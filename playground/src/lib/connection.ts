/**
 * The MCP client side of the playground host: connect to the in-browser demo
 * server (in-memory transport — the GitHub Pages mode) or to a remote server
 * over Streamable HTTP, advertising MCP Apps support like a real host does.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { MCP_APP_MIME, MCP_APPS_EXTENSION, type CallToolResult } from '@vue-mcp-apps/core'
import { project } from '../project'
import { client, log, state, type ToolInfo } from './store'

let currentBundle: unknown = project.bundle

export function setBundle(bundle: unknown): void {
  currentBundle = bundle
}

function newClient(): Client {
  return new Client(
    { name: 'vue-mcp-apps-playground', version: '0.1.0' },
    { capabilities: { extensions: { [MCP_APPS_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } } },
  )
}

export async function connect(): Promise<void> {
  await disconnect()
  state.connection.status = 'connecting'
  state.connection.error = ''
  try {
    const c = newClient()
    if (state.connection.mode === 'browser') {
      if (!project.createServer) throw new Error('This project has no in-browser server (project.ts → createServer).')
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      const server = project.createServer(currentBundle)
      await server.connect(serverTransport)
      await c.connect(clientTransport)
    } else {
      await c.connect(new StreamableHTTPClientTransport(new URL(state.connection.url)))
    }
    client.value = c
    const info = c.getServerVersion()
    state.connection.serverName = info ? `${info.name} ${info.version}` : 'server'
    await refreshTools()
    state.connection.status = 'connected'
    log({ direction: 'host', layer: 'host', method: 'connected', summary: `${state.connection.mode === 'browser' ? 'In-browser' : state.connection.url} — ${state.connection.tools.length} tools`, data: info, tone: 'success' })
  } catch (error) {
    state.connection.status = 'error'
    state.connection.error = error instanceof Error ? error.message : String(error)
    log({ direction: 'host', layer: 'host', method: 'connect failed', summary: state.connection.error, data: String(error), tone: 'error' })
  }
}

export async function disconnect(): Promise<void> {
  const c = client.value
  client.value = null
  state.connection.tools = []
  state.connection.status = 'idle'
  if (c) await c.close().catch(() => {})
}

export async function refreshTools(): Promise<void> {
  const c = client.value
  if (!c) return
  const { tools } = await c.listTools()
  state.connection.tools = tools as ToolInfo[]
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const c = client.value
  if (!c) throw new Error('Not connected')
  return await c.callTool({ name, arguments: args }) as CallToolResult
}

export async function readResource(uri: string): Promise<{ html: string; meta: Record<string, unknown> }> {
  const c = client.value
  if (!c) throw new Error('Not connected')
  const result = await c.readResource({ uri })
  const content = result.contents[0] as { text?: string; blob?: string; mimeType?: string; _meta?: Record<string, unknown> } | undefined
  if (!content) throw new Error(`${uri}: empty resource`)
  const html = typeof content.text === 'string' ? content.text : content.blob ? atob(content.blob) : ''
  // `_meta.ui` may sit on the content item or on the listed resource; the item wins.
  let meta = content._meta ?? {}
  if (!meta.ui) {
    const listed = (await c.listResources().catch(() => ({ resources: [] }))).resources.find(r => r.uri === uri) as { _meta?: Record<string, unknown> } | undefined
    meta = listed?._meta ?? meta
  }
  return { html, meta }
}
