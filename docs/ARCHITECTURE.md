# Architecture

A card is a Vue component. This document covers how one component becomes:

- an MCP App template that a server publishes,
- a view that a host draws in a sandbox,
- a native widget in your own app,

and why it is built that way.

## 1. The card contract (`@vue-mcp-apps/core`)

### Manifest

```ts
const cards = defineCards({
  'approval-card': {
    title: 'Change approval',            // resource title; text for hosts without UI
    description: '…',
    actions: {                           // event name → action
      approved:  { kind: 'tool', tool: 'apply_changes' },
      rejected:  { kind: 'notify', fallback: 'Changes rejected.' },
      explained: { kind: 'context' },
    },
    propsSchema: { type: 'object', … },  // optional JSON Schema (docs, editors)
    fixtures:   { booking: { … } },      // named example props (playground, tests)
    resource:   { csp: { connectDomains: [] }, permissions: {}, prefersBorder: false },
  },
})
```

`defineCards` runs three checks and then freezes the table:

- card names are kebab-case with at least one dash;
- every card has a title;
- every action kind is known, and a `tool` action names its tool.

Nothing at runtime can widen what a card may ask for.

### Actions: emitted-argument conventions

A card emits ordinary Vue events. The **first argument is the payload**:

| `kind` | Card emits | Becomes | Host does |
| --- | --- | --- | --- |
| `tool` | `emit('approved', { ids })` | `{ kind: 'tool', tool: <declared>, args }` | `tools/call` with the **declared** tool name; `args` is the first argument if it is a plain object, otherwise `{}` |
| `link` | `emit('opened', url)` | `{ kind: 'link', url }` | `ui/open-link`; http(s) only, otherwise the action is dropped |
| `notify` | `emit('rejected', message?, data?)` | `{ kind: 'notify', message, data }` | shows a line under the card or a toast; nothing leaves the card; `fallback` (or the event name) when there is no message |
| `message` | `emit('asked', text)` | `{ kind: 'message', text }` | `ui/message`: a user message in the chat, which the model answers |
| `context` | `emit('explained', text)` | `{ kind: 'context', text }` | `ui/update-model-context`: context for the model's next turn |

`cardActionFor(manifest, name, event, args)` does the mapping:

- It returns `null` for an event the manifest does not list, or for an unusable payload such as a bad URL or empty text.
- Payloads pass through `toPlain`, a JSON copy, so Vue proxies never reach `postMessage`.

`CardRenderer` binds exactly one listener per listed event (`eventListenerProp('approved')` → `onApproved`). Anything else the card emits goes nowhere.

### The card in a tool result

```json
{
  "content": [{ "type": "text", "text": "Proposed 3 changes … nothing is applied yet." }],
  "structuredContent": { "card": { "name": "approval-card", "props": { … } } }
}
```

- `content` is what the **model** reads, and what a host without MCP Apps shows.
- `structuredContent.card` is what the **view** draws.
- `resultCard(result)` reads it.
- **Fallback:** if a result has no `card` but `structuredContent` is a plain object, the template's own card is drawn with `structuredContent` as its props. This lets results built by hand, or by other libraries, still render.

## 2. The view runtime (`@vue-mcp-apps/view` → `startMcpApp`)

What happens inside the host's iframe:

1. **Mount.** A single Vue app (the shell) is mounted on `[data-mcp-card]` (or `#app`). `install(app)` runs first, so that `app.use(ui)` registers Nuxt UI. The shell renders `CardRenderer` and a one-line status (`role="status"`).
2. **Handshake.** `McpAppBridge.connect()` sends:
   - `ui/initialize` with `{ appInfo, appCapabilities: { availableDisplayModes }, protocolVersion: '2026-01-26' }`,
   - then `ui/notifications/initialized`.
   It stores `hostCapabilities`, `hostContext` and `hostInfo`.
3. **Context.** `applyHostContext` applies the context: `lang`, `color-scheme`, the `.dark` class, `data-theme`, `data-display-mode` and the style variables (see Theming). Every `host-context-changed` notification applies it again.
4. **Input.** `tool-input-partial` and `tool-input` fill `useCardHost().toolInput`. `streaming` is true while partial input is arriving.
5. **Result.** `tool-result` → `resultCard` (or the fallback) → the card is drawn.
   - The template is for **one** card: an initial result that carries another card is not drawn there.
   - An `isError` result shows its text.
6. **Clicks.** The card's actions run as follows:

   | Action | What the shell does |
   | --- | --- |
   | `tool` | Sets `busy`, sends `tools/call`. If the answer carries a card it ships, that card is swapped in; otherwise the text is shown under the card. If the host advertises `updateModelContext` (and `reportClicksToModel` is not false), it also sends a line to the model. |
   | `link` | `ui/open-link`, falling back to `window.open`. |
   | `notify` | Shows the message as the status line. |
   | `message` | `ui/message`. |
   | `context` | `ui/update-model-context`. |

7. **Size.** A `ResizeObserver` on `<body>` sends `ui/notifications/size-changed` whenever the size changes. It measures the body, not the document: the document is at least as tall as the frame, so it could only ever grow.
8. **Teardown.** `ui/resource-teardown` unmounts the card and answers `{}`.

`McpAppBridge` is hand-written: about a dozen messages and no dependencies, because it is inlined into every template. Its request timeout is 30 s. It answers `ping`, and answers unknown host requests with JSON-RPC error `-32601`.

## 3. The native runtime

- `<McpCard>` takes `manifest`, `components`, `result` (or `card`), `hostContext`, `callTool`, `handleLinks` and `showStatus`. It emits `action`, `result` and `error`. It provides the same `useCardHost()` state, with `mode: 'native'`. When given `callTool`, it runs tool actions and swaps in follow-up cards.
- `CardRenderer` is shared by both runtimes. Because of that, a click means the same thing in the iframe and in your page.
- `useCardHost()` returns `{ mode, hostContext, toolInput, streaming, busy }`, all read-only. Outside any host (a unit test, a plain page) it answers `native` with empty refs. It deliberately offers **no** way to call a tool.

## 4. The server kit (`@vue-mcp-apps/server`)

`createCardServerKit({ manifest, bundle, uriPrefix? })` returns:

| Member | What it does |
| --- | --- |
| `registerResources(server)` | One `ui://cards/<name>` resource per card that is both declared and built. Mime `text/html;profile=mcp-app`, `_meta` from `cardResourceMeta(spec)` (CSP, permissions, `prefersBorder`). |
| `registerTool(server, name, { card?, visibility?, ...config }, handler)` | Calls `server.registerTool` with `_meta.ui.resourceUri` (and the legacy flat `ui/resourceUri` key), plus `visibility` when given. Only done when the card is drawable; otherwise visibility alone. |
| `result(name, props, text?)` | `cardResult` with the card's title in the default text. |
| `html(name)`, `uri(name)`, `drawable(name)`, `bundle`, `manifest` | Helpers. |

The server is duck-typed: `ServerLike` only needs `registerTool` and `registerResource`, so SDK v1 and v2 both work. The free functions are `cardTemplateHtml`, `cardToolMeta`, `toolVisibilityMeta`, `cardResult`, `asCardBundle`, `inlineSafe` and `clientSupportsMcpApps`.

The template HTML has:

- the viewport and `color-scheme` meta tags,
- a transparent `html, body`,
- the bundle CSS as an inline `<style>`,
- `<div data-mcp-card="name">`,
- the bundle script as an inline `<script>`.

`inlineSafe` escapes `</script`, `</style` and `<!--` in the inlined code.

## 5. The bundle (`@vue-mcp-apps/vite`)

`defineCardBundleConfig` produces a Vite library build:

- IIFE format, one chunk (`inlineDynamicImports`), `cssCodeSplit: false`, target es2020;
- production flags for Vue;
- output under `node_modules/.cache/vue-mcp-apps`, since only the JSON matters.

`mcpCardBundle` runs with `enforce: 'post'`, after Vite's CSS plugin has emitted the stylesheet. It writes `cards.json`:

| Field | Meaning |
| --- | --- |
| `generatedBy` | `@vue-mcp-apps/vite` |
| `versions` | Versions of `vue`, `@nuxt/ui`, `tailwindcss` and `@vue-mcp-apps/view` found in `node_modules`. |
| `sourceHash` | sha256 of the versions plus every source file of the bundle (CRLF normalised). A test can fail when the bundle is stale. |
| `sources` | Source paths relative to the Vite root. |
| `cards` | Card names the script draws. |
| `script` | The whole view as one classic script, inline-safe. |
| `css` | Every style, compiled (Tailwind / Nuxt UI), inline-safe. |

The plugin also:

- fails the build on more than one chunk (do not use `import()` in cards);
- fails when the bundle is over `maxSizeKb` (default 2048);
- warns about assets it cannot inline.

## 6. Theming

Hosts send their design tokens as the spec's CSS variables in `hostContext.styles.variables`, for example `--color-background-primary` and `--font-sans`. `applyHostContext`:

- sets every variable on `:root` as it comes;
- mirrors the ones in `NUXT_UI_TOKENS` onto Nuxt UI tokens, so a Nuxt UI card looks native in the host:

  | Spec variable | Nuxt UI token |
  | --- | --- |
  | `--color-background-primary` / `-secondary` / `-tertiary` / `-inverse` | `--ui-bg` / `--ui-bg-muted` / `--ui-bg-elevated` / `--ui-bg-inverted` |
  | `--color-text-primary` / `-secondary` / `-tertiary` / `-disabled` / `-inverse` | `--ui-text-highlighted` / `--ui-text` / `--ui-text-muted` / `--ui-text-dimmed` / `--ui-text-inverted` |
  | `--color-border-primary` / `-secondary` / `-tertiary` / `-inverse` | `--ui-border` / `--ui-border-muted` / `--ui-border-accented` / `--ui-border-inverted` |
  | `--border-radius-sm` | `--ui-radius` |

- maps `--font-sans` to `font-family`;
- injects `styles.css.fonts` in a `<style>` element;
- toggles the `.dark` class from `theme`, which is how Nuxt UI and Tailwind's class-mode `dark:` work.

Pass `tokens: {}` to `startMcpApp` to set only the spec's variables, or pass your own map.

## 7. Security model

- **Actions are data.** What an event does is declared in the manifest and frozen. The card's own event cannot name a tool: the tool is always the one declared for that event. So a card whose props were crafted by an attacker (through prompt injection into tool output, for example) still cannot reach other tools.
- **Visibility.** A tool that only a card may call is registered with `visibility: ['app']`.
  - The host must refuse such a tool when the model calls it, and must refuse a card's call to a tool without `'app'`.
  - Put the irreversible step behind an app-only tool and the human stays in the loop: the model can only *propose*.
- **Sandbox.** Web hosts frame a proxy on another origin, and the proxy frames the view. The view cannot touch the host's DOM, cookies or storage. See `docs/PLAYGROUND.md` for the exact attributes.
- **CSP.** The template fetches nothing. It declares empty `connectDomains` and `resourceDomains`, so the host's CSP can be `default-src 'none'` plus inline code. Add domains in `resource.csp` only when a card truly needs them.
- **Origin checks.** The view trusts a message only when `event.source === window.parent`. The host may sit behind a proxy on an unknown origin, so replies go to `'*'`; nothing the view sends is a secret the host does not already hold. On the host side, `PostMessageTransport` checks `event.source` against the proxy's window.
- **Links** are http(s) only. **Props are not secrets:** they live in the conversation.
