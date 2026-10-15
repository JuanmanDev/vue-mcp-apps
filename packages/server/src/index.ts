/**
 * Server side of the card contract: register one MCP Apps template per card,
 * point tools at them, and shape tool results so a host draws the card while
 * the model reads text.
 *
 * SDK-agnostic: works with `McpServer` from `@modelcontextprotocol/server` (v2)
 * and from `@modelcontextprotocol/sdk` (v1) — anything with `registerTool` and
 * `registerResource`.
 *
 * The protocol in one paragraph: a tool's DEFINITION names a `ui://` resource
 * (`_meta.ui.resourceUri`); the host reads that resource (HTML, mime
 * `text/html;profile=mcp-app`), draws it in a sandboxed iframe and talks to it
 * over JSON-RPC `postMessage`; each tool RESULT is handed to the iframe, whose
 * `structuredContent` carries what the view draws while `content` stays what
 * the model reads. Clicks come back as `tools/call` the host proxies to this
 * server — through the same checks as the model's own calls.
 */
import {
  LEGACY_RESOURCE_URI_META_KEY,
  MCP_APP_MIME,
  cardUri,
  type CallToolResult,
  type CardManifest,
  type CardSpec,
  type ToolVisibility,
} from '@vue-mcp-apps/core'

export { clientSupportsMcpApps, MCP_APP_MIME, MCP_APPS_EXTENSION, cardUri } from '@vue-mcp-apps/core'

/** What `@vue-mcp-apps/vite`'s `mcpCardBundle()` writes: one script + one stylesheet for every card. */
export interface CardBundle {
  /** The whole view — Vue, your cards, their libraries, the bridge — as one classic script. */
  script: string
  /** Every style the cards use (Tailwind / Nuxt UI included), already compiled. */
  css: string
  /** The card names the script can draw. */
  cards: string[]
  /** Hash of the sources the bundle was built from: a test can fail when it is stale. */
  sourceHash?: string
  generatedBy?: string
}

/** Anything with the two `McpServer` methods we need (SDK v1 or v2). */
export interface ServerLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(name: string, config: any, cb: any): unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerResource(name: string, uri: any, config: any, cb: any): unknown
}

/** Accept the bundle object, or the parsed JSON file. Null when it is empty or malformed. */
export function asCardBundle(value: unknown): CardBundle | null {
  const v = value as Partial<CardBundle> | null
  if (!v || typeof v.script !== 'string' || !v.script || !Array.isArray(v.cards)) return null
  return { ...v, css: typeof v.css === 'string' ? v.css : '' } as CardBundle
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
}

/** `</script`, `</style` and `<!--` cannot appear raw inside inline tags. */
export function inlineSafe(code: string): string {
  return code.replace(/<\/(script|style)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
}

/** The template HTML for card `name`: self-contained, fetches nothing. */
export function cardTemplateHtml(bundle: CardBundle, name: string, options: { title?: string; lang?: string } = {}): string {
  if (!bundle.cards.includes(name)) throw new Error(`The card bundle has no "${name}" card (it has: ${bundle.cards.join(', ')}).`)
  return '<!doctype html>\n'
    + `<html lang="${escapeHtml(options.lang ?? 'en')}">\n<head>\n`
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta name="color-scheme" content="light dark">\n'
    + `<title>${escapeHtml(options.title ?? name)}</title>\n`
    + '<style>html,body{margin:0;padding:0;background:transparent}</style>\n'
    + (bundle.css ? `<style>${inlineSafe(bundle.css)}</style>\n` : '')
    + '</head>\n<body>\n'
    + `<div data-mcp-card="${escapeHtml(name)}"></div>\n`
    + `<script>${inlineSafe(bundle.script)}</script>\n`
    + '</body>\n</html>\n'
}

/** The template resource's `_meta`: CSP (nothing to fetch by default), permissions, border. */
export function cardResourceMeta(spec: CardSpec | undefined): Record<string, unknown> {
  const resource = spec?.resource ?? {}
  return {
    ui: {
      csp: {
        connectDomains: resource.csp?.connectDomains ?? [],
        resourceDomains: resource.csp?.resourceDomains ?? [],
        ...(resource.csp?.frameDomains ? { frameDomains: resource.csp.frameDomains } : {}),
        ...(resource.csp?.baseUriDomains ? { baseUriDomains: resource.csp.baseUriDomains } : {}),
      },
      ...(resource.permissions ? { permissions: resource.permissions } : {}),
      prefersBorder: resource.prefersBorder ?? false,
    },
  }
}

/**
 * The `_meta` of a tool whose result is card `name`: the spec's
 * `ui.resourceUri` plus the flat key older hosts read.
 */
export function cardToolMeta(name: string, options: { visibility?: ToolVisibility[]; uriPrefix?: string } = {}): Record<string, unknown> {
  const resourceUri = cardUri(name, options.uriPrefix)
  return {
    ui: { resourceUri, ...(options.visibility ? { visibility: options.visibility } : {}) },
    [LEGACY_RESOURCE_URI_META_KEY]: resourceUri,
  }
}

/** The `_meta` of a tool with no card of its own — e.g. one only a card's button may call (`['app']`). */
export function toolVisibilityMeta(visibility: ToolVisibility[]): Record<string, unknown> {
  return { ui: { visibility } }
}

/**
 * A tool result that shows card `name`. `text` is what the model reads (and
 * what a host without MCP Apps shows) — say what the card says, briefly.
 */
export function cardResult(name: string, props: Record<string, unknown>, text?: string): CallToolResult & { structuredContent: { card: { name: string; props: Record<string, unknown> } } } {
  return {
    content: [{ type: 'text', text: text ?? `Showed the "${name}" card to the user.` }],
    structuredContent: { card: { name, props } },
  }
}

export interface CardServerKitOptions {
  manifest: CardManifest
  /** The built bundle (the parsed `cards.json`), or null to run text-only. */
  bundle: CardBundle | unknown | null
  /** Default `ui://cards/`. */
  uriPrefix?: string
}

/**
 * Everything bound to one manifest and bundle:
 *
 *   const kit = createCardServerKit({ manifest: cards, bundle })
 *   kit.registerResources(server)
 *   kit.registerTool(server, 'get_weather', { card: 'weather-card', description, inputSchema }, async (args) =>
 *     kit.result('weather-card', props, 'Sunny, 21 °C in Madrid.'))
 *
 * With no bundle (not built yet), tools are registered WITHOUT a template and
 * results still carry their text: a host falls back to text, as the spec says.
 */
export function createCardServerKit(options: CardServerKitOptions) {
  const { manifest } = options
  const bundle = asCardBundle(options.bundle)
  const prefix = options.uriPrefix

  /** Cards that are both declared and built. */
  const drawable = (name: string) => !!bundle && bundle.cards.includes(name) && Object.prototype.hasOwnProperty.call(manifest, name)

  return {
    manifest,
    bundle,
    drawable,

    uri: (name: string) => cardUri(name, prefix),

    html: (name: string) => {
      if (!bundle) throw new Error('No card bundle: build it first (vite build with mcpCardBundle()).')
      return cardTemplateHtml(bundle, name, { title: manifest[name]?.title })
    },

    /** Register one `ui://` template per drawable card. Returns their URIs. */
    registerResources(server: ServerLike): string[] {
      if (!bundle) return []
      const registered: string[] = []
      for (const name of bundle.cards) {
        if (!drawable(name)) continue
        const spec = manifest[name]!
        const uri = cardUri(name, prefix)
        const meta = cardResourceMeta(spec)
        server.registerResource(
          `card-${name}`,
          uri,
          { title: spec.title, description: spec.description ?? `Interactive "${spec.title}" card (MCP App).`, mimeType: MCP_APP_MIME, _meta: meta },
          async () => ({ contents: [{ uri, mimeType: MCP_APP_MIME, text: cardTemplateHtml(bundle, name, { title: spec.title }), _meta: meta }] }),
        )
        registered.push(uri)
      }
      return registered
    },

    /**
     * `server.registerTool` with the card's `_meta` merged in. `card` names the
     * card the tool's result shows; leave it out for a tool with no card, and
     * set `visibility: ['app']` for one only a card's button may call.
     */
    registerTool<C extends Record<string, unknown>>(
      server: ServerLike,
      name: string,
      config: C & { card?: string; visibility?: ToolVisibility[]; _meta?: Record<string, unknown> },
      handler: unknown,
    ): unknown {
      const { card, visibility, _meta, ...rest } = config
      let meta: Record<string, unknown> | undefined = _meta
      if (card) {
        if (!Object.prototype.hasOwnProperty.call(manifest, card)) throw new Error(`Tool "${name}": unknown card "${card}".`)
        if (drawable(card)) meta = { ...(_meta ?? {}), ...cardToolMeta(card, { visibility, uriPrefix: prefix }) }
        else if (visibility) meta = { ...(_meta ?? {}), ...toolVisibilityMeta(visibility) }
      } else if (visibility) {
        meta = { ...(_meta ?? {}), ...toolVisibilityMeta(visibility) }
      }
      return server.registerTool(name, meta ? { ...rest, _meta: meta } : rest, handler)
    },

    /** `cardResult`, with the card's title in the default text. */
    result(name: string, props: Record<string, unknown>, text?: string) {
      return cardResult(name, props, text ?? `Showed the "${manifest[name]?.title ?? name}" card to the user.`)
    },
  }
}

export type CardServerKit = ReturnType<typeof createCardServerKit>
