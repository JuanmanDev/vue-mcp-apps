/**
 * Constants and wire types of the MCP Apps extension (`io.modelcontextprotocol/ui`,
 * spec 2026-01-26). Names are the spec's; see
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
 *
 * Kept dependency-free on purpose: a view bundle inlines this module, and the
 * official SDK (`@modelcontextprotocol/ext-apps`) brings the MCP SDK and zod.
 */

/** The extension id a client advertises under `capabilities.extensions`. */
export const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui'

/** The protocol version the view sends in `ui/initialize`. */
export const MCP_APPS_PROTOCOL_VERSION = '2026-01-26'

/** The mime type of an MCP App template resource. */
export const MCP_APP_MIME = 'text/html;profile=mcp-app'

/** The deprecated flat key older hosts still read next to `_meta.ui.resourceUri`. */
export const LEGACY_RESOURCE_URI_META_KEY = 'ui/resourceUri'

/** Every JSON-RPC method of the extension, by direction. */
export const METHODS = Object.freeze({
  // view → host (requests)
  initialize: 'ui/initialize',
  openLink: 'ui/open-link',
  message: 'ui/message',
  updateModelContext: 'ui/update-model-context',
  requestDisplayMode: 'ui/request-display-mode',
  callTool: 'tools/call',
  readResource: 'resources/read',
  // view → host (notifications)
  initialized: 'ui/notifications/initialized',
  sizeChanged: 'ui/notifications/size-changed',
  log: 'notifications/message',
  // host → view (notifications)
  toolInput: 'ui/notifications/tool-input',
  toolInputPartial: 'ui/notifications/tool-input-partial',
  toolResult: 'ui/notifications/tool-result',
  toolCancelled: 'ui/notifications/tool-cancelled',
  hostContextChanged: 'ui/notifications/host-context-changed',
  // host → view (requests)
  resourceTeardown: 'ui/resource-teardown',
  // sandbox proxy ↔ host (never relayed to the view)
  sandboxProxyReady: 'ui/notifications/sandbox-proxy-ready',
  sandboxResourceReady: 'ui/notifications/sandbox-resource-ready',
} as const)

export type JsonRpcId = string | number

export interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface ContentBlock {
  type: string
  text?: string
  [key: string]: unknown
}

export interface CallToolResult {
  content?: ContentBlock[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
  _meta?: Record<string, unknown>
}

export type DisplayMode = 'inline' | 'fullscreen' | 'pip'

export interface HostContext {
  theme?: 'light' | 'dark'
  styles?: { variables?: Record<string, string | undefined>; css?: { fonts?: string } }
  displayMode?: DisplayMode
  availableDisplayModes?: DisplayMode[]
  containerDimensions?: { width?: number; maxWidth?: number; height?: number; maxHeight?: number }
  locale?: string
  timeZone?: string
  userAgent?: string
  platform?: 'web' | 'desktop' | 'mobile'
  deviceCapabilities?: { touch?: boolean; hover?: boolean }
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number }
  toolInfo?: { id?: JsonRpcId; tool: { name: string; [key: string]: unknown } }
  [key: string]: unknown
}

export interface HostCapabilities {
  openLinks?: Record<string, never>
  serverTools?: { listChanged?: boolean }
  serverResources?: { listChanged?: boolean }
  updateModelContext?: Record<string, unknown>
  message?: Record<string, unknown>
  logging?: Record<string, never>
  [key: string]: unknown
}

export interface InitializeResult {
  protocolVersion: string
  hostInfo?: { name: string; version: string }
  hostCapabilities: HostCapabilities
  hostContext: HostContext
}

/** `_meta.ui.csp` of a template resource: the only origins the view may reach. */
export interface ResourceCsp {
  connectDomains?: string[]
  resourceDomains?: string[]
  frameDomains?: string[]
  baseUriDomains?: string[]
}

/** `_meta.ui.permissions` of a template resource (maps to the iframe `allow`). */
export interface ResourcePermissions {
  camera?: Record<string, never>
  microphone?: Record<string, never>
  geolocation?: Record<string, never>
  clipboardWrite?: Record<string, never>
}

/** Who may call a tool: the model, the view (app), or both (the default). */
export type ToolVisibility = 'model' | 'app'

/** True when the connected client advertised MCP Apps support with the template mime type. */
export function clientSupportsMcpApps(capabilities: unknown): boolean {
  const caps = capabilities as { extensions?: Record<string, unknown>; experimental?: Record<string, unknown> } | null | undefined
  const ui = (caps?.extensions?.[MCP_APPS_EXTENSION] ?? caps?.experimental?.[MCP_APPS_EXTENSION]) as
    { mimeTypes?: unknown } | undefined
  return Array.isArray(ui?.mimeTypes) && ui.mimeTypes.includes(MCP_APP_MIME)
}

/** The text of a tool result's text blocks, joined. */
export function resultText(result: CallToolResult | null | undefined): string {
  return (result?.content ?? [])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n')
    .trim()
}
