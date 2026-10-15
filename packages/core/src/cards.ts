/**
 * The card contract — what a card is, what its buttons may ask for, and how a
 * card travels in a tool result. Pure data, shared by the three places a card
 * lives:
 *
 *  - the MCP server, which registers one `ui://` template per card and returns
 *    `structuredContent.card = { name, props }` from its tools;
 *  - an MCP Apps host (Claude, VS Code, the playground…), whose sandboxed iframe
 *    runs the view bundle (`@vue-mcp-apps/view` → `startMcpApp`);
 *  - your own Vue app, which mounts the very same component natively
 *    (`<McpCard>`) — no iframe.
 *
 * A card says what happened by emitting a Vue event. What each event MEANS is
 * declared here, as data, never as code the host evaluates: a `tool` action
 * always runs the tool declared for it, whatever the card sends. A card whose
 * props were turned against it still cannot ask for any other tool.
 */

/** What one card event asks its host to do. */
export type CardActionSpec =
  /** Call `tool` on the card's MCP server. Arguments: the event's first argument, when it is a plain object. */
  | { kind: 'tool'; tool: string }
  /** Open the event's first argument (http/https only) in the host. */
  | { kind: 'link' }
  /** Show the event's first argument (or `fallback`) as a notice. Nothing leaves the card. */
  | { kind: 'notify'; fallback?: string }
  /** Post the event's first argument as a user message to the conversation (`ui/message`). */
  | { kind: 'message' }
  /** Tell the model what happened, for its next turn (`ui/update-model-context`). */
  | { kind: 'context' }

/** Anything JSON Schema; kept loose so the core needs no schema library. */
export type JsonSchema = Record<string, unknown>

export interface CardSpec {
  /** Human title: resource title, playground label, the text a host without UI gets. */
  title: string
  description?: string
  /** Event name → action. An event not listed asks for nothing. */
  actions?: Record<string, CardActionSpec>
  /** JSON Schema of the card's props. Used by the playground's props editor and by docs. */
  propsSchema?: JsonSchema
  /** Named example props: the playground's presets, your tests' fixtures. */
  fixtures?: Record<string, Record<string, unknown>>
  /**
   * The template resource's `_meta.ui` extras: origins the view may reach
   * (`csp`), iframe permissions, border preference. Default: nothing to fetch.
   */
  resource?: {
    csp?: { connectDomains?: string[]; resourceDomains?: string[]; frameDomains?: string[]; baseUriDomains?: string[] }
    permissions?: Record<string, Record<string, never>>
    prefersBorder?: boolean
  }
}

export type CardManifest<Names extends string = string> = Readonly<Record<Names, Readonly<CardSpec>>>

/** Card names are custom-element-like: lower case, at least one dash. */
const CARD_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/

/**
 * Declare your cards. Validates names and action specs once, then freezes the
 * table so nothing at runtime can widen what a card may ask for.
 */
export function defineCards<const T extends Record<string, CardSpec>>(cards: T): CardManifest<Extract<keyof T, string>> {
  for (const [name, spec] of Object.entries(cards)) {
    if (!CARD_NAME.test(name)) throw new Error(`Card name "${name}" must be kebab-case with at least one dash (e.g. "weather-card").`)
    if (!spec || typeof spec.title !== 'string' || !spec.title) throw new Error(`Card "${name}" needs a title.`)
    for (const [event, action] of Object.entries(spec.actions ?? {})) {
      if (!['tool', 'link', 'notify', 'message', 'context'].includes(action?.kind)) {
        throw new Error(`Card "${name}" event "${event}": unknown action kind "${(action as { kind?: unknown })?.kind}".`)
      }
      if (action.kind === 'tool' && (typeof action.tool !== 'string' || !action.tool)) {
        throw new Error(`Card "${name}" event "${event}": a tool action names its tool.`)
      }
    }
  }
  const frozen = Object.fromEntries(
    Object.entries(cards).map(([name, spec]) => [name, Object.freeze({ ...spec, actions: Object.freeze({ ...(spec.actions ?? {}) }) })]),
  )
  return Object.freeze(frozen) as CardManifest<Extract<keyof T, string>>
}

export function isCardName(manifest: CardManifest, name: unknown): name is string {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(manifest, name)
}

/** Every tool any card may call — the allowlist a host enforces for clicks. */
export function cardTools(manifest: CardManifest): string[] {
  const tools = new Set<string>()
  for (const spec of Object.values(manifest)) {
    for (const action of Object.values(spec.actions ?? {})) if (action.kind === 'tool') tools.add(action.tool)
  }
  return [...tools].sort()
}

// ---------------------------------------------------------------------------
// The card in a tool result
// ---------------------------------------------------------------------------

/** A card and its props: what `structuredContent.card` carries. */
export interface CardPayload {
  name: string
  props: Record<string, unknown>
}

export function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The card a tool result carries (`structuredContent.card`), or null. */
export function resultCard(result: unknown): CardPayload | null {
  const card = (result as { structuredContent?: { card?: unknown } } | null)?.structuredContent?.card as
    { name?: unknown; props?: unknown } | undefined
  if (!card || typeof card.name !== 'string' || !card.name) return null
  return { name: card.name, props: plainObject(card.props) ? card.props : {} }
}

// ---------------------------------------------------------------------------
// Resolving a card event
// ---------------------------------------------------------------------------

/** A resolved request from a card, ready for a host to act on. */
export type CardAction =
  | { kind: 'tool'; event: string; tool: string; args: Record<string, unknown> }
  | { kind: 'link'; event: string; url: string }
  | { kind: 'notify'; event: string; message: string; data: Record<string, unknown> }
  | { kind: 'message'; event: string; text: string }
  | { kind: 'context'; event: string; text: string }

/** An http(s) URL, or null. A card's link is data and may be anything. */
export function safeLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * A JSON-safe copy. Card payloads cross `postMessage`, which cannot clone Vue's
 * reactive proxies (a `ref([])` emitted as-is throws DataCloneError), functions
 * or class instances. Dates become ISO strings.
 */
export function toPlain<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * What card `name`'s `event`, emitted with `args`, asks for — or null when the
 * card does not list that event or the payload is unusable.
 */
export function cardActionFor(manifest: CardManifest, name: string, event: string, args: readonly unknown[]): CardAction | null {
  if (!isCardName(manifest, name)) return null
  const specs = manifest[name]!.actions ?? {}
  if (!Object.prototype.hasOwnProperty.call(specs, event)) return null
  const spec = specs[event]!
  const first = args[0]
  switch (spec.kind) {
    case 'tool':
      return { kind: 'tool', event, tool: spec.tool, args: plainObject(first) ? toPlain(first) : {} }
    case 'link': {
      const url = safeLinkUrl(first)
      return url ? { kind: 'link', event, url } : null
    }
    case 'notify':
      return {
        kind: 'notify',
        event,
        message: typeof first === 'string' && first ? first : (spec.fallback ?? event),
        data: plainObject(args[1]) ? toPlain(args[1]) : {},
      }
    case 'message':
    case 'context': {
      const value = text(first).trim()
      return value ? { kind: spec.kind, event, text: value } : null
    }
  }
}

/** `onFooBar` for `fooBar` / `foo-bar` — the prop Vue binds a component event listener to. */
export function eventListenerProp(event: string): string {
  const camel = event.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
  return `on${camel.charAt(0).toUpperCase()}${camel.slice(1)}`
}

/** `ui://cards/weather-card` — the template URI of a card. */
export function cardUri(name: string, prefix = 'ui://cards/'): string {
  return `${prefix}${name}`
}
