/**
 * Playground state: the connection, the host settings, the current run, and the
 * protocol log. One reactive module — the workbench is one page.
 */
import { reactive, shallowRef } from 'vue'
import type { Client } from '@modelcontextprotocol/client'
import type { CallToolResult, DisplayMode } from '@vue-mcp-apps/core'
import { project } from '../project'

export interface ToolInfo {
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export type Direction = 'host→view' | 'view→host' | 'host' | 'policy'

export interface LogEntry {
  n: number
  at: number
  direction: Direction
  layer: 'bridge' | 'host' | 'native'
  method: string
  id?: string | number
  summary: string
  data: unknown
  tone?: 'info' | 'success' | 'warning' | 'error'
}

export type StylePreset = 'none' | 'warm' | 'ocean' | 'mono'

export const state = reactive({
  connection: {
    mode: (project.createServer ? 'browser' : 'remote') as 'browser' | 'remote',
    url: project.remoteUrl,
    status: 'idle' as 'idle' | 'connecting' | 'connected' | 'error',
    error: '',
    serverName: '',
    tools: [] as ToolInfo[],
  },
  host: {
    theme: 'light' as 'light' | 'dark',
    locale: 'en-US',
    displayMode: 'inline' as DisplayMode,
    stylePreset: 'none' as StylePreset,
    /** cross-origin: proxy on 127.0.0.1 ↔ host on localhost. opaque: proxy in a sandbox without allow-same-origin. */
    proxyOrigin: 'auto' as 'auto' | 'cross-origin' | 'opaque',
    /** The VIEW iframe's sandbox: basic-host's default, or strict (no allow-same-origin: no storage). */
    viewSandbox: 'standard' as 'standard' | 'strict',
    streamInput: true,
    autoApproveAppCalls: true,
  },
  run: {
    label: '',
    tool: '' as string,
    args: {} as Record<string, unknown>,
    result: null as CallToolResult | null,
    resourceUri: '' as string,
    /** Bumped to make the sandbox pane re-create its view. */
    viewKey: 0,
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    error: '',
  },
  conversation: [] as Array<{ at: number; from: 'model' | 'card' | 'host'; text: string }>,
  modelContext: null as null | { at: number; text: string; structuredContent?: unknown },
  log: [] as LogEntry[],
  bundleVersion: 0,
  frameHeight: 120,
})

export const client = shallowRef<Client | null>(null)

let counter = 0
export function log(entry: Omit<LogEntry, 'n' | 'at'>): void {
  state.log.push({ ...entry, n: ++counter, at: Date.now() })
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500)
}

export function clearLog(): void {
  state.log.splice(0)
}

/** `_meta.ui.resourceUri` (or the deprecated flat key) of a tool. */
export function toolResourceUri(tool: ToolInfo | undefined): string {
  const meta = tool?._meta as { ui?: { resourceUri?: unknown }; 'ui/resourceUri'?: unknown } | undefined
  const uri = meta?.ui?.resourceUri ?? meta?.['ui/resourceUri']
  return typeof uri === 'string' ? uri : ''
}

/** Who may call a tool. Default per spec: both. */
export function toolVisibility(tool: ToolInfo | undefined): Array<'model' | 'app'> {
  const v = (tool?._meta as { ui?: { visibility?: unknown } } | undefined)?.ui?.visibility
  return Array.isArray(v) && v.length ? v.filter((x): x is 'model' | 'app' => x === 'model' || x === 'app') : ['model', 'app']
}

export function findTool(name: string): ToolInfo | undefined {
  return state.connection.tools.find(t => t.name === name)
}
