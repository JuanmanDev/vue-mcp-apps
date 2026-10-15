# API reference

Every export of the four packages, as defined in `packages/*/src`. `@vue-mcp-apps/view` also re-exports all of `@vue-mcp-apps/core`.

## @vue-mcp-apps/core

### Cards (`cards.ts`)

```ts
type CardActionSpec =
  | { kind: 'tool'; tool: string }        // args = first emitted arg if a plain object, else {}
  | { kind: 'link' }                      // first arg, http(s) only
  | { kind: 'notify'; fallback?: string } // first arg (string) or fallback or event name; second arg = data
  | { kind: 'message' }                   // first arg as text → ui/message
  | { kind: 'context' }                   // first arg as text → ui/update-model-context

type JsonSchema = Record<string, unknown>

interface CardSpec {
  title: string
  description?: string
  actions?: Record<string, CardActionSpec>
  propsSchema?: JsonSchema
  fixtures?: Record<string, Record<string, unknown>>
  resource?: {
    csp?: { connectDomains?: string[]; resourceDomains?: string[]; frameDomains?: string[]; baseUriDomains?: string[] }
    permissions?: Record<string, Record<string, never>>
    prefersBorder?: boolean
  }
}

type CardManifest<Names extends string = string> = Readonly<Record<Names, Readonly<CardSpec>>>

function defineCards<const T extends Record<string, CardSpec>>(cards: T): CardManifest<Extract<keyof T, string>>
  // validates kebab-case names, titles and action kinds; freezes everything
function isCardName(manifest: CardManifest, name: unknown): name is string
function cardTools(manifest: CardManifest): string[]          // sorted allowlist of every tool any card may call

interface CardPayload { name: string; props: Record<string, unknown> }
function plainObject(value: unknown): value is Record<string, unknown>
function resultCard(result: unknown): CardPayload | null      // reads structuredContent.card

type CardAction =
  | { kind: 'tool'; event: string; tool: string; args: Record<string, unknown> }
  | { kind: 'link'; event: string; url: string }
  | { kind: 'notify'; event: string; message: string; data: Record<string, unknown> }
  | { kind: 'message'; event: string; text: string }
  | { kind: 'context'; event: string; text: string }

function safeLinkUrl(value: unknown): string | null           // http(s) href or null
function toPlain<T>(value: T): T                              // JSON copy (no proxies, functions, Dates → strings)
function cardActionFor(manifest: CardManifest, name: string, event: string, args: readonly unknown[]): CardAction | null
function eventListenerProp(event: string): string             // 'foo-bar' | 'fooBar' → 'onFooBar'
function cardUri(name: string, prefix = 'ui://cards/'): string
```

### Protocol (`protocol.ts`)

```ts
const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui'
const MCP_APPS_PROTOCOL_VERSION = '2026-01-26'
const MCP_APP_MIME = 'text/html;profile=mcp-app'
const LEGACY_RESOURCE_URI_META_KEY = 'ui/resourceUri'
const METHODS: {
  initialize, openLink, message, updateModelContext, requestDisplayMode, callTool, readResource,
  initialized, sizeChanged, log,
  toolInput, toolInputPartial, toolResult, toolCancelled, hostContextChanged,
  resourceTeardown, sandboxProxyReady, sandboxResourceReady
}  // the method strings; see protocol.md

type JsonRpcId = string | number
interface JsonRpcMessage { jsonrpc: '2.0'; id?; method?; params?; result?; error?: { code; message; data? } }
interface ContentBlock { type: string; text?: string; [k: string]: unknown }
interface CallToolResult { content?: ContentBlock[]; structuredContent?: Record<string, unknown>; isError?: boolean; _meta? }
type DisplayMode = 'inline' | 'fullscreen' | 'pip'
interface HostContext { theme?; styles?; displayMode?; availableDisplayModes?; containerDimensions?; locale?; timeZone?;
                        userAgent?; platform?; deviceCapabilities?; safeAreaInsets?; toolInfo?; [k: string]: unknown }
interface HostCapabilities { openLinks?; serverTools?; serverResources?; updateModelContext?; message?; logging?; … }
interface InitializeResult { protocolVersion; hostInfo?; hostCapabilities; hostContext }
interface ResourceCsp { connectDomains?; resourceDomains?; frameDomains?; baseUriDomains? }
interface ResourcePermissions { camera?; microphone?; geolocation?; clipboardWrite? }
type ToolVisibility = 'model' | 'app'

function clientSupportsMcpApps(capabilities: unknown): boolean  // extensions (or experimental) lists our mime
function resultText(result: CallToolResult | null | undefined): string
```

## @vue-mcp-apps/view

### `startMcpApp` (`app.ts`)

```ts
interface StartMcpAppOptions {
  manifest: CardManifest
  components: CardComponents                       // Readonly<Record<string, Component>>
  install?: (app: App) => void                     // app.use(ui), i18n, pinia…
  appInfo?: { name: string; version: string }      // default { name: 'vue-mcp-apps', version: '0.1.0' }
  root?: string | HTMLElement                      // default [data-mcp-card], then #app
  card?: string                                    // default root's data-mcp-card (or data-card)
  tokens?: Readonly<Record<string, string>>        // default NUXT_UI_TOKENS; {} = spec variables only
  strings?: Record<string, Partial<ShellStrings>>  // per-language overrides
  displayModes?: DisplayMode[]                     // default ['inline']
  reportClicksToModel?: boolean                    // default true
}
interface McpAppHandle { bridge: McpAppBridge; app: App; card: Ref<CardPayload | null>; unmount(): void }
function startMcpApp(options: StartMcpAppOptions): Promise<McpAppHandle>

interface ShellStrings { loading; working; done; failed; cancelled; noCard }   // en es fr de it pt built in
function shellStrings(locale: string | undefined, overrides?: Record<string, Partial<ShellStrings>>): ShellStrings
```

### `McpAppBridge` (`bridge.ts`)

```ts
interface BridgeHandlers {
  onToolInput?(args); onToolInputPartial?(args); onToolResult?(result: CallToolResult)
  onToolCancelled?(reason?: string); onHostContextChanged?(context: HostContext); onTeardown?(): void | Promise<void>
}
interface BridgeOptions { requestTimeoutMs?: number /* 30000 */; availableDisplayModes?: DisplayMode[] }

class McpAppBridge {
  constructor(handlers: BridgeHandlers, options?: BridgeOptions, host: Window = window.parent, self: Window = window)
  hostCapabilities: HostCapabilities; hostContext: HostContext; hostInfo?: { name; version }
  connect(appInfo): Promise<InitializeResult>        // ui/initialize → ui/notifications/initialized
  close(): void
  request(method: string, params: unknown): Promise<unknown>
  notify(method: string, params: unknown): void
  callTool(name, args): Promise<CallToolResult>
  readResource(uri): Promise<{ contents: … }>
  openLink(url): Promise<unknown>
  sendMessage(text): Promise<unknown>               // ui/message, role 'user'
  updateModelContext(text, structuredContent?): Promise<unknown>
  requestDisplayMode(mode): Promise<{ mode }>
  sizeChanged(width, height): void
  log(level: 'debug'|'info'|'warning'|'error', data, logger = 'vue-mcp-apps'): void
}
```

Trusts only `event.source === host`. Answers `ping` and `ui/resource-teardown`, and answers anything else with `-32601`. If `postMessage` throws, it retries with a JSON copy.

### Native hosting

```ts
// McpCard.ts
const McpCard: Component<{
  manifest: CardManifest; components: CardComponents
  result?: CallToolResult | null; card?: CardPayload | null       // card wins
  hostContext?: HostContext
  callTool?: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>
  handleLinks?: boolean   // default true: window.open(url, '_blank', 'noopener,noreferrer')
  showStatus?: boolean    // default true
}>  // emits: action(CardAction), result({ action, result }), error({ action, error })

// renderer.ts
type CardComponents = Readonly<Record<string, Component>>
const CardRenderer: Component<{ manifest; components; name: string; cardProps?: Record<string, unknown> }>  // emits action(CardAction)

// context.ts
type CardHostMode = 'native' | 'mcp-app'
interface CardHostState { mode; hostContext: Readonly<Ref<HostContext>>; toolInput: Readonly<Ref<Record<string, unknown> | null>>;
                          streaming: Readonly<Ref<boolean>>; busy: Readonly<Ref<boolean>> }
interface CardHostRefs { mode; hostContext: Ref; toolInput: Ref; streaming: Ref; busy: Ref }
function createCardHostRefs(mode: CardHostMode, hostContext?: HostContext): CardHostRefs
function provideCardHost(refs: CardHostRefs): void
function useCardHost(): CardHostState         // outside a host: 'native' with empty refs
```

### Theme (`theme.ts`)

```ts
const NUXT_UI_TOKENS: Readonly<Record<string, string>>
  // --color-background-primary → --ui-bg, -secondary → --ui-bg-muted, -tertiary → --ui-bg-elevated, -inverse → --ui-bg-inverted
  // --color-text-primary → --ui-text-highlighted, -secondary → --ui-text, -tertiary → --ui-text-muted,
  //   -disabled → --ui-text-dimmed, -inverse → --ui-text-inverted
  // --color-border-primary → --ui-border, -secondary → --ui-border-muted, -tertiary → --ui-border-accented, -inverse → --ui-border-inverted
  // --border-radius-sm → --ui-radius
function applyHostContext(context: HostContext, tokens = NUXT_UI_TOKENS, doc: Document = document): void
  // lang, color-scheme, .dark, data-theme, data-display-mode, variables (+tokens), --font-sans → font-family, styles.css.fonts
```

## @vue-mcp-apps/server

```ts
export { clientSupportsMcpApps, MCP_APP_MIME, MCP_APPS_EXTENSION, cardUri } from '@vue-mcp-apps/core'

interface CardBundle { script: string; css: string; cards: string[]; sourceHash?: string; generatedBy?: string }
interface ServerLike { registerTool(name, config, cb): unknown; registerResource(name, uri, config, cb): unknown }

function asCardBundle(value: unknown): CardBundle | null
function inlineSafe(code: string): string                      // escapes </script, </style, <!--
function cardTemplateHtml(bundle: CardBundle, name: string, options?: { title?: string; lang?: string }): string
function cardResourceMeta(spec: CardSpec | undefined): Record<string, unknown>   // { ui: { csp, permissions?, prefersBorder } }
function cardToolMeta(name: string, options?: { visibility?: ToolVisibility[]; uriPrefix?: string }): Record<string, unknown>
function toolVisibilityMeta(visibility: ToolVisibility[]): Record<string, unknown>
function cardResult(name: string, props: Record<string, unknown>, text?: string):
  CallToolResult & { structuredContent: { card: { name: string; props: Record<string, unknown> } } }

interface CardServerKitOptions { manifest: CardManifest; bundle: CardBundle | unknown | null; uriPrefix?: string }
function createCardServerKit(options: CardServerKitOptions): {
  manifest; bundle: CardBundle | null
  drawable(name: string): boolean                 // declared AND built
  uri(name: string): string
  html(name: string): string                      // throws without a bundle
  registerResources(server: ServerLike): string[] // registered URIs
  registerTool(server: ServerLike, name: string,
    config: { card?: string; visibility?: ToolVisibility[]; _meta?: Record<string, unknown>; [k: string]: unknown },
    handler: unknown): unknown                    // throws for an unknown card
  result(name: string, props: Record<string, unknown>, text?: string): ReturnType<typeof cardResult>
}
type CardServerKit = ReturnType<typeof createCardServerKit>
```

## @vue-mcp-apps/vite

```ts
interface McpCardBundleOptions { outFile: string; cards: readonly string[]; maxSizeKb?: number /* 2048 */; verbose?: boolean /* true */ }
function inlineSafe(code: string): string
function sourceHash(root: string, sources: readonly string[], versions: Record<string, string>): string
function mcpCardBundle(options: McpCardBundleOptions): Plugin      // apply 'build', enforce 'post'
interface CardBundleConfigOptions extends McpCardBundleOptions { entry: string; plugins?: PluginOption[]; config?: UserConfig }
function defineCardBundleConfig(options: CardBundleConfigOptions): UserConfig
  // IIFE lib build, one chunk, cssCodeSplit false, es2020, Vue prod flags; writes only the JSON
```

Output JSON: `{ generatedBy, versions, sourceHash, sources, cards, script, css }`.

## Playground AI demo (not a package — `playground/src/ai/`)

The contract to implement or extend the demo assistant. Providers turn text into a decision; `agent.ts` does MCP, host checks and cards.

```ts
// types.ts
interface ToolSpec { name: string; description: string; inputSchema: Record<string, unknown> }   // model-visible tools only
type Decision =
  | { action: 'call_tool'; tool: string; arguments: Record<string, unknown> }
  | { action: 'answer'; text: string }
interface Turn { role: 'user' | 'assistant' | 'tool'; text: string; tool?: string; fromCard?: boolean }
interface DecideContext { turns: Turn[]; tools: ToolSpec[]; modelContext: string[] }
type ProviderState = 'unavailable' | 'downloadable' | 'downloading' | 'loading' | 'ready' | 'error'
interface ProviderStatus { state: ProviderState; detail?: string; progress?: number }
type ProviderId = 'chrome' | 'webllm' | 'openai' | 'scripted'
interface AiProvider {
  id: ProviderId; label: string; blurb: string
  check(): Promise<ProviderStatus>                                   // cheap, never downloads
  load(onStatus: (s: ProviderStatus) => void): Promise<void>         // may download
  decide(context: DecideContext): Promise<Decision>
  answerAfterTool(context: DecideContext & { tool: string; resultText: string }): Promise<string>
}

// prompt.ts
toolSignature(tool: ToolSpec): string                 // get_weather(city: string, unit?: "C" | "F")
systemPrompt(tools: ToolSpec[]): string
transcript(context: DecideContext, maxTurns = 8): string
decisionSchema(tools: ToolSpec[]): Record<string, unknown>   // tool: enum of tool names
ANSWER_SCHEMA                                          // { text: string }
afterToolPrompt(tool: string, resultText: string): string
parseDecision(raw: string, tools: ToolSpec[]): Decision      // throws DecisionError
extractJson(raw: string): string
parseAnswer(raw: string): string
class DecisionError extends Error

// agent.ts
PROVIDERS: Record<ProviderId, AiProvider>
chat                                                   // reactive: items, turns, modelContext, providerId, status, busy, thinking
modelTools(): ToolSpec[]
refreshStatuses(), selectProvider(id), loadProvider(id?), autoPick()
send(text: string, options?: { fromCard?: boolean }): Promise<void>
addModelContext(text: string): void
resetChat(): void
```

WebLLM models (`providers/webllm.ts`, `WEBLLM_MODELS`): `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (default), `Llama-3.2-1B-Instruct-q4f16_1-MLC`, `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. OpenAI-compatible config (`openaiConfig`): `baseUrl`, `model`, `apiKey` (memory only).
