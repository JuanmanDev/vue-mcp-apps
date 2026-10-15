// @vitest-environment jsdom
/**
 * Our dependency-free view bridge against the OFFICIAL host bridge
 * (`AppBridge` from @modelcontextprotocol/ext-apps): the handshake, every
 * host → view notification we handle, and every view → host request we send.
 *
 * Two fake windows stand in for the host page and the view iframe. Like real
 * frames, a message is delivered asynchronously and carries `source`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { McpAppBridge } from './bridge'

function deliver(target: EventTarget, data: unknown, source: unknown) {
  // structuredClone: what postMessage really does (and why reactive proxies fail).
  const cloned = structuredClone(data)
  setTimeout(() => {
    const event = new Event('message')
    Object.defineProperty(event, 'data', { value: cloned })
    Object.defineProperty(event, 'source', { value: source })
    target.dispatchEvent(event)
  }, 0)
}

function frames() {
  const viewSelf = new EventTarget()
  // What the HOST holds for the view (iframe.contentWindow): posting to it reaches the view.
  const viewProxy = { postMessage: (data: unknown) => deliver(viewSelf, data, hostProxy) } as unknown as Window
  // What the VIEW holds for the host (window.parent): posting to it reaches the host page (jsdom's window).
  const hostProxy = { postMessage: (data: unknown) => deliver(window, data, viewProxy) } as unknown as Window
  return { viewSelf: viewSelf as unknown as Window, viewProxy, hostProxy }
}

const opened: Array<{ close(): unknown }> = []
afterEach(async () => {
  for (const c of opened.splice(0)) await c.close()
})

async function setup(handlers: ConstructorParameters<typeof McpAppBridge>[0] = {}) {
  const { viewSelf, viewProxy, hostProxy } = frames()
  const host = new AppBridge(
    null,
    { name: 'test-host', version: '1.0.0' },
    { openLinks: {}, serverTools: {}, logging: {}, updateModelContext: { text: {} }, message: { text: {} } },
    { hostContext: { theme: 'dark', locale: 'es-ES', displayMode: 'inline' } },
  )
  const initialized = new Promise<void>(resolve => { host.oninitialized = () => resolve() })
  await host.connect(new PostMessageTransport(viewProxy, viewProxy))
  const view = new McpAppBridge(handlers, { requestTimeoutMs: 2000 }, hostProxy, viewSelf)
  opened.push(host, view)
  const init = await view.connect({ name: 'test-view', version: '1.0.0' })
  await initialized
  return { host, view, init }
}

describe('McpAppBridge ↔ official AppBridge', () => {
  it('completes the handshake and receives the host context', async () => {
    const { init, view } = await setup()
    expect(init.protocolVersion).toBeTypeOf('string')
    expect(init.hostInfo).toMatchObject({ name: 'test-host' })
    expect(view.hostContext).toMatchObject({ theme: 'dark', locale: 'es-ES' })
    expect(view.hostCapabilities.serverTools).toBeDefined()
  })

  it('receives tool input (partial and final), results and cancellations', async () => {
    const onToolInput = vi.fn()
    const onToolInputPartial = vi.fn()
    const onToolResult = vi.fn()
    const onToolCancelled = vi.fn()
    const { host } = await setup({ onToolInput, onToolInputPartial, onToolResult, onToolCancelled })
    await host.sendToolInputPartial({ arguments: { city: 'Mad' } })
    await host.sendToolInput({ arguments: { city: 'Madrid' } })
    await host.sendToolResult({ content: [{ type: 'text', text: 'ok' }], structuredContent: { card: { name: 'weather-card', props: { city: 'Madrid' } } } })
    await host.sendToolCancelled({ reason: 'stop' })
    await vi.waitFor(() => expect(onToolCancelled).toHaveBeenCalledWith('stop'))
    expect(onToolInputPartial).toHaveBeenCalledWith({ city: 'Mad' })
    expect(onToolInput).toHaveBeenCalledWith({ city: 'Madrid' })
    expect(onToolResult.mock.calls[0]![0]).toMatchObject({ structuredContent: { card: { name: 'weather-card' } } })
  })

  it('merges host context changes', async () => {
    const onHostContextChanged = vi.fn()
    const { host, view } = await setup({ onHostContextChanged })
    host.setHostContext({ theme: 'light', locale: 'es-ES', displayMode: 'inline' })
    await vi.waitFor(() => expect(onHostContextChanged).toHaveBeenCalled())
    expect(view.hostContext).toMatchObject({ theme: 'light', locale: 'es-ES' })
  })

  it('calls tools through the host', async () => {
    const { host, view } = await setup()
    host.oncalltool = async params => ({ content: [{ type: 'text', text: `ran ${params.name} with ${JSON.stringify(params.arguments)}` }] })
    const result = await view.callTool('apply_changes', { ids: ['c1'] })
    expect(result.content?.[0]).toEqual({ type: 'text', text: 'ran apply_changes with {"ids":["c1"]}' })
  })

  it('asks the host to open links, post messages and update model context', async () => {
    const { host, view } = await setup()
    const links: string[] = []
    const messages: unknown[] = []
    const contexts: unknown[] = []
    host.onopenlink = async ({ url }) => { links.push(url); return {} }
    host.onmessage = async (params) => { messages.push(params); return {} }
    host.onupdatemodelcontext = async (params) => { contexts.push(params); return {} }
    await view.openLink('https://example.com/')
    await view.sendMessage('What should I pack?')
    await view.updateModelContext('The user rejected it.')
    expect(links).toEqual(['https://example.com/'])
    expect(messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'What should I pack?' }] }])
    expect(contexts).toEqual([{ content: [{ type: 'text', text: 'The user rejected it.' }] }])
  })

  it('reports its size and answers teardown', async () => {
    const onTeardown = vi.fn()
    const { host, view } = await setup({ onTeardown })
    const sizes: unknown[] = []
    host.onsizechange = params => { sizes.push(params) }
    view.sizeChanged(320, 240)
    await vi.waitFor(() => expect(sizes).toEqual([{ width: 320, height: 240 }]))
    await host.teardownResource({})
    expect(onTeardown).toHaveBeenCalled()
  })

  it('a host error rejects the request', async () => {
    const { host, view } = await setup()
    host.oncalltool = async () => { throw new Error('nope') }
    await expect(view.callTool('x', {})).rejects.toThrow(/nope/)
  })

  it('ignores messages that do not come from its parent', async () => {
    const onToolResult = vi.fn()
    const { viewSelf, hostProxy } = frames()
    const view = new McpAppBridge({ onToolResult }, {}, hostProxy, viewSelf)
    void view.connect({ name: 'v', version: '1' }).catch(() => {})
    opened.push(view)
    deliver(viewSelf as unknown as EventTarget, { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: {} }, { postMessage() {} })
    await new Promise(r => setTimeout(r, 10))
    expect(onToolResult).not.toHaveBeenCalled()
  })
})
