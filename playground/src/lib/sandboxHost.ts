/**
 * Layer 1 — the HOST side of one MCP App view, built on the OFFICIAL host
 * bridge (`AppBridge` from @modelcontextprotocol/ext-apps). Testing a view here
 * means testing it against the reference implementation, not against our own
 * view runtime talking to itself.
 *
 *   Host page (this)  ──postMessage──▶  Sandbox proxy (public/sandbox.html, other origin)
 *                                           ──postMessage──▶  View (srcdoc iframe: your card bundle)
 *
 * Every JSON-RPC message crossing the bridge is logged (the Inspector pane),
 * and every host decision too: which tool calls from the view are allowed
 * (`_meta.ui.visibility`), links, messages, model context.
 */
import { AppBridge, PostMessageTransport, buildAllowAttribute } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { CallToolResult, HostContext } from '@vue-mcp-apps/core'
import { callTool } from './connection'
import { client, findTool, log, state, toolVisibility, type Direction } from './store'

export interface ViewOptions {
  html: string
  meta: Record<string, unknown>
  hostContext: HostContext
  onSize?: (height: number) => void
  onDisplayMode?: (mode: string) => void
  /** A card posted a user message (`ui/message`). Default: the workbench's Conversation tab. */
  onMessage?: (text: string) => void
  /** A card updated the model context. Default: the workbench's Model context tab. */
  onModelContext?: (text: string, structuredContent?: unknown) => void
  /** Logged with every entry, to tell several views apart. */
  label?: string
}

function summarise(message: { method?: string; id?: unknown; result?: unknown; error?: { message?: string }; params?: unknown }): string {
  if (message.error) return `error: ${message.error.message ?? ''}`
  const p = (message.params ?? {}) as Record<string, unknown>
  switch (message.method) {
    case 'tools/call': return `${String(p.name)}(${JSON.stringify(p.arguments ?? {}).slice(0, 80)})`
    case 'ui/notifications/size-changed': return `${String(p.width)}×${String(p.height)}`
    case 'ui/notifications/tool-input':
    case 'ui/notifications/tool-input-partial': return JSON.stringify(p.arguments ?? {}).slice(0, 100)
    case 'ui/notifications/tool-result': {
      const sc = p.structuredContent as { card?: { name?: string } } | undefined
      return sc?.card?.name ? `card ${sc.card.name}` : (p.isError ? 'isError' : 'result')
    }
    case 'ui/open-link': return String(p.url)
    case 'ui/message':
    case 'ui/update-model-context': {
      const content = (p.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? ''
      return content.slice(0, 100)
    }
    case 'ui/notifications/host-context-changed': return Object.keys(p).join(', ')
    case 'ui/notifications/sandbox-resource-ready': return `${String((p.html as string | undefined)?.length ?? 0)} chars of HTML`
    case 'ui/initialize': return `${String((p.appInfo as { name?: string } | undefined)?.name ?? '')} · protocol ${String(p.protocolVersion ?? '')}`
    case 'notifications/message': return `${String(p.level)}: ${JSON.stringify(p.data).slice(0, 80)}`
    default:
      if (message.method) return ''
      return message.result !== undefined ? JSON.stringify(message.result).slice(0, 100) : ''
  }
}

/** The proxy URL on ANOTHER origin than this page, or the same URL in an opaque sandbox. */
export function proxyTarget(): { url: string; opaque: boolean } {
  const here = new URL(window.location.href)
  const base = new URL(`${import.meta.env.BASE_URL}sandbox.html`, here)
  const mode = state.host.proxyOrigin
  const swap = here.hostname === 'localhost' ? '127.0.0.1' : here.hostname === '127.0.0.1' ? 'localhost' : null
  if (mode !== 'opaque' && swap) {
    base.hostname = swap
    return { url: base.href, opaque: false }
  }
  // One origin only (GitHub Pages): an opaque origin is still not ours.
  return { url: base.href, opaque: true }
}

export class AppViewHost {
  bridge: AppBridge | null = null
  frame: HTMLIFrameElement | null = null
  initialized = false
  private readyWaiters: Array<() => void> = []

  constructor(private readonly container: HTMLElement, private readonly options: ViewOptions) {}

  whenReady(): Promise<void> {
    return this.initialized ? Promise.resolve() : new Promise(resolve => this.readyWaiters.push(resolve))
  }

  async start(): Promise<void> {
    const { url, opaque } = proxyTarget()
    const ui = (this.options.meta.ui ?? {}) as { csp?: Record<string, string[]>; permissions?: Record<string, unknown>; prefersBorder?: boolean }

    const frame = document.createElement('iframe')
    frame.title = 'Sandbox proxy'
    frame.setAttribute('sandbox', opaque ? 'allow-scripts allow-forms' : 'allow-scripts allow-same-origin allow-forms')
    const allow = buildAllowAttribute(ui.permissions as never)
    if (allow) frame.setAttribute('allow', allow)
    frame.style.cssText = 'display:block;width:100%;border:0;background:transparent;height:120px'
    this.container.replaceChildren(frame)
    this.frame = frame

    const bridge = new AppBridge(
      null,
      { name: 'vue-mcp-apps playground', version: '0.1.0' },
      { openLinks: {}, serverTools: {}, serverResources: {}, logging: {}, updateModelContext: { text: {} }, message: { text: {} } },
      { hostContext: this.options.hostContext as never },
    )
    this.bridge = bridge

    bridge.onsandboxready = () => {
      const params = {
        html: this.options.html,
        csp: ui.csp,
        permissions: ui.permissions,
        sandbox: state.host.viewSandbox === 'strict' ? 'allow-scripts allow-forms' : 'allow-scripts allow-same-origin allow-forms',
      }
      void bridge.sendSandboxResourceReady(params as never)
    }
    bridge.oninitialized = () => {
      this.initialized = true
      for (const resolve of this.readyWaiters.splice(0)) resolve()
    }
    bridge.onsizechange = ({ height }) => {
      if (typeof height === 'number' && height > 0) {
        frame.style.height = `${Math.min(Math.ceil(height), 2000)}px`
        this.options.onSize?.(height)
      }
    }
    bridge.oncalltool = async (params) => {
      const tool = findTool(params.name)
      const visibility = toolVisibility(tool)
      if (!tool || !visibility.includes('app')) {
        const why = !tool ? 'unknown tool' : 'tool is not visible to apps (_meta.ui.visibility)'
        log({ direction: 'policy', layer: 'host', method: 'tools/call refused', summary: `${params.name}: ${why}`, data: params, tone: 'error' })
        return { isError: true, content: [{ type: 'text', text: `Refused by host: ${why}.` }] } as never
      }
      if (!state.host.autoApproveAppCalls && !window.confirm(`The card wants to run ${params.name}(${JSON.stringify(params.arguments ?? {})}). Allow?`)) {
        log({ direction: 'policy', layer: 'host', method: 'tools/call denied', summary: `${params.name}: the user said no`, data: params, tone: 'warning' })
        return { isError: true, content: [{ type: 'text', text: 'The user declined.' }] } as never
      }
      log({ direction: 'policy', layer: 'host', method: 'tools/call allowed', summary: `${params.name} (visibility: ${visibility.join(', ')})`, data: params, tone: 'success' })
      const result: CallToolResult = await callTool(params.name, (params.arguments ?? {}) as Record<string, unknown>)
      return result as never
    }
    bridge.onopenlink = async ({ url: link }) => {
      log({ direction: 'policy', layer: 'host', method: 'open link', summary: link, data: { url: link }, tone: 'info' })
      window.open(link, '_blank', 'noopener,noreferrer')
      return {}
    }
    bridge.onmessage = async ({ content }) => {
      const text = content.map(c => ('text' in c ? c.text : `[${c.type}]`)).join('\n')
      if (this.options.onMessage) this.options.onMessage(text)
      else state.conversation.push({ at: Date.now(), from: 'card', text })
      return {}
    }
    bridge.onupdatemodelcontext = async (params) => {
      const text = (params.content ?? []).map(c => ('text' in c ? c.text : `[${c.type}]`)).join('\n')
      if (this.options.onModelContext) this.options.onModelContext(text, params.structuredContent)
      else state.modelContext = { at: Date.now(), text, structuredContent: params.structuredContent }
      return {}
    }
    bridge.onrequestdisplaymode = async ({ mode }) => {
      const granted = mode === 'fullscreen' || mode === 'inline' ? mode : 'inline'
      this.options.onDisplayMode?.(granted)
      return { mode: granted }
    }
    bridge.onreadresource = async (params) => {
      log({ direction: 'policy', layer: 'host', method: 'resources/read (view)', summary: params.uri, data: params, tone: 'info' })
      if (!client.value) throw new Error('Not connected')
      return await client.value.readResource(params) as never
    }
    bridge.onloggingmessage = (params) => {
      log({ direction: 'view→host', layer: 'bridge', method: 'log', summary: `${params.level}: ${JSON.stringify(params.data).slice(0, 120)}`, data: params, tone: params.level === 'error' ? 'error' : 'info' })
    }

    const transport = new PostMessageTransport(frame.contentWindow!, frame.contentWindow!)
    const tap = (direction: Direction, message: unknown) => {
      const m = message as { method?: string; id?: string | number; error?: unknown }
      log({ direction, layer: 'bridge', method: m.method ?? (m.error ? 'error' : 'response'), id: m.id, summary: summarise(m as never), data: message, tone: m.error ? 'error' : undefined })
    }
    const send = transport.send.bind(transport)
    transport.send = async (message, opts) => {
      tap('host→view', message)
      try {
        // postMessage clones its payload; Vue's reactive proxies cannot be cloned. Plain JSON always can.
        return await send(JSON.parse(JSON.stringify(message)), opts)
      } catch (error) {
        // Typically a DataCloneError: postMessage cannot clone a Vue proxy or a function.
        log({ direction: 'host', layer: 'host', method: 'send failed', summary: error instanceof Error ? error.message : String(error), data: message, tone: 'error' })
        throw error
      }
    }
    await bridge.connect(transport)
    const receive = transport.onmessage
    transport.onmessage = (message, extra) => {
      tap('view→host', message)
      receive?.call(transport, message, extra as never)
    }
    frame.src = url
  }

  async setHostContext(context: HostContext): Promise<void> {
    this.bridge?.setHostContext(context as never)
  }

  async teardown(): Promise<void> {
    try {
      await this.bridge?.teardownResource({})
    } catch { /* the view may be gone */ }
  }

  async destroy(): Promise<void> {
    await this.bridge?.close().catch(() => {})
    this.bridge = null
    this.frame?.remove()
    this.frame = null
  }
}
