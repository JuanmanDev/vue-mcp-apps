/**
 * The view side of the MCP Apps protocol — JSON-RPC 2.0 over `postMessage`
 * with the host that framed us.
 *
 * Hand-written rather than taken from `@modelcontextprotocol/ext-apps`' `App`:
 * the view needs a dozen messages, and `App` brings the MCP SDK and zod into a
 * bundle that is inlined into every template. The method names and shapes are
 * the spec's; the playground drives this bridge with the official `AppBridge`,
 * and `bridge.test.ts` plays a host against it.
 *
 * Trust: a message counts only when it comes from `window.parent` — the frame
 * that embedded us. The host may sit behind a sandbox proxy on another origin,
 * so the origin is not known in advance and replies go to '*'; nothing a view
 * sends is a secret the host does not already hold.
 */
import {
  METHODS,
  MCP_APPS_PROTOCOL_VERSION,
  type CallToolResult,
  type ContentBlock,
  type DisplayMode,
  type HostCapabilities,
  type HostContext,
  type InitializeResult,
  type JsonRpcId,
  type JsonRpcMessage,
} from '@vue-mcp-apps/core'

export interface BridgeHandlers {
  onToolInput?: (args: Record<string, unknown>) => void
  onToolInputPartial?: (args: Record<string, unknown>) => void
  onToolResult?: (result: CallToolResult) => void
  onToolCancelled?: (reason?: string) => void
  onHostContextChanged?: (context: HostContext) => void
  onTeardown?: () => void | Promise<void>
}

export interface BridgeOptions {
  /** Default 30 s. A host that never answers must not leave a button spinning forever. */
  requestTimeoutMs?: number
  /** Display modes this view can render in. Default `['inline']`. */
  availableDisplayModes?: DisplayMode[]
}

export class McpAppBridge {
  private nextId = 1
  private readonly pending = new Map<JsonRpcId, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private readonly listener = (event: MessageEvent) => this.receive(event)
  private readonly timeoutMs: number
  hostCapabilities: HostCapabilities = {}
  hostContext: HostContext = {}
  hostInfo: { name: string; version: string } | undefined

  constructor(
    private readonly handlers: BridgeHandlers,
    private readonly options: BridgeOptions = {},
    private readonly host: Window = window.parent,
    private readonly self: Window = window,
  ) {
    this.timeoutMs = options.requestTimeoutMs ?? 30_000
  }

  /** Listen, then run the handshake: `ui/initialize` → `ui/notifications/initialized`. */
  async connect(appInfo: { name: string; version: string }): Promise<InitializeResult> {
    this.self.addEventListener('message', this.listener)
    const result = await this.request(METHODS.initialize, {
      appInfo,
      appCapabilities: { availableDisplayModes: this.options.availableDisplayModes ?? ['inline'] },
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    }) as InitializeResult
    this.hostCapabilities = result?.hostCapabilities ?? {}
    this.hostContext = result?.hostContext ?? {}
    this.hostInfo = result?.hostInfo
    this.notify(METHODS.initialized, {})
    return result
  }

  close(): void {
    this.self.removeEventListener('message', this.listener)
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error('closed'))
    }
    this.pending.clear()
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method}: no answer from the host after ${this.timeoutMs} ms`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  /** `tools/call`, proxied by the host to the MCP server that owns this view. */
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.request(METHODS.callTool, { name, arguments: args }) as Promise<CallToolResult>
  }

  /** `resources/read` on the view's own server. */
  readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }> {
    return this.request(METHODS.readResource, { uri }) as Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }>
  }

  openLink(url: string): Promise<unknown> {
    return this.request(METHODS.openLink, { url })
  }

  /** Post a user message to the conversation (the model answers it). */
  sendMessage(text: string): Promise<unknown> {
    return this.request(METHODS.message, { role: 'user', content: [{ type: 'text', text }] satisfies ContentBlock[] })
  }

  /** Tell the model what happened in the view, for its next turn (no follow-up of its own). */
  updateModelContext(text: string, structuredContent?: Record<string, unknown>): Promise<unknown> {
    return this.request(METHODS.updateModelContext, {
      content: [{ type: 'text', text }],
      ...(structuredContent ? { structuredContent } : {}),
    })
  }

  requestDisplayMode(mode: DisplayMode): Promise<{ mode: DisplayMode }> {
    return this.request(METHODS.requestDisplayMode, { mode }) as Promise<{ mode: DisplayMode }>
  }

  sizeChanged(width: number, height: number): void {
    this.notify(METHODS.sizeChanged, { width, height })
  }

  log(level: 'debug' | 'info' | 'warning' | 'error', data: unknown, logger = 'vue-mcp-apps'): void {
    this.notify(METHODS.log, { level, logger, data })
  }

  private send(message: JsonRpcMessage): void {
    try {
      this.host.postMessage(message, '*')
    } catch {
      // DataCloneError: a reactive proxy or a function slipped into the payload.
      this.host.postMessage(JSON.parse(JSON.stringify(message)), '*')
    }
  }

  private respond(id: JsonRpcId, result: unknown): void {
    this.send({ jsonrpc: '2.0', id, result })
  }

  private receive(event: MessageEvent): void {
    if (event.source !== this.host) return
    const message = event.data as JsonRpcMessage | null
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return

    // A response to one of our requests.
    if (message.id !== undefined && message.method === undefined) {
      const waiter = this.pending.get(message.id)
      if (!waiter) return
      this.pending.delete(message.id)
      clearTimeout(waiter.timer)
      if (message.error) waiter.reject(new Error(message.error.message || 'Request failed'))
      else waiter.resolve(message.result)
      return
    }

    const params = (message.params ?? {}) as Record<string, unknown>

    // A request from the host.
    if (message.id !== undefined) {
      const id = message.id
      switch (message.method) {
        case METHODS.resourceTeardown:
          Promise.resolve(this.handlers.onTeardown?.()).finally(() => this.respond(id, {}))
          return
        case 'ping':
          this.respond(id, {})
          return
        default:
          this.send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${message.method}` } })
          return
      }
    }

    // A notification from the host.
    switch (message.method) {
      case METHODS.toolInput:
        this.handlers.onToolInput?.((params.arguments ?? {}) as Record<string, unknown>)
        return
      case METHODS.toolInputPartial:
        this.handlers.onToolInputPartial?.((params.arguments ?? {}) as Record<string, unknown>)
        return
      case METHODS.toolResult:
        this.handlers.onToolResult?.(params as CallToolResult)
        return
      case METHODS.toolCancelled:
        this.handlers.onToolCancelled?.(typeof params.reason === 'string' ? params.reason : undefined)
        return
      case METHODS.hostContextChanged:
        this.hostContext = { ...this.hostContext, ...params }
        this.handlers.onHostContextChanged?.(this.hostContext)
        return
      default:
        // Anything newer: nothing to do.
    }
  }
}
