# The playground

The playground has two pages (hash router):

| Route | Page | For |
| --- | --- | --- |
| `#/` | **AI demo** — hero + chat. An in-browser assistant calls the demo server's tools and the cards appear inline in the chat. | Showing MCP Apps the way users meet them. See [AI_DEMO.md](AI_DEMO.md). |
| `#/workbench` | **Workbench** — native pane, three-layer MCP App pane, inspector, controls. | Building and debugging cards. This document. |

Both pages share one MCP connection (in-browser server by default) and are kept alive when you switch, so live views are not torn down. The header has tabs for Demo, Workbench, Docs and GitHub.

The workbench draws the same card twice:

- **natively**, in the page itself;
- **as an MCP App**, inside the three layers a real web host uses.

It also logs every message that crosses between them.

```bash
npm install
npm run dev     # builds the cards, watches them, serves http://localhost:5173 (#/ demo, #/workbench)
```

Open **http://localhost:5173**, not `127.0.0.1`. The proxy uses the other name; see below.

## The layers

| # | Layer | Where | What it runs |
| --- | --- | --- | --- |
| 0 | **Native** | the page | `<McpCard>` → `CardRenderer` → your `.vue` card, with the page's own Nuxt UI. No iframe, no protocol. |
| 1 | **Host** | `http://localhost:5173` | `AppBridge` from `@modelcontextprotocol/ext-apps/app-bridge` (the official host bridge) and an MCP `Client` (`src/lib/sandboxHost.ts`, `src/lib/connection.ts`). |
| 2 | **Sandbox proxy** | `http://127.0.0.1:5173/sandbox.html` | `public/sandbox.html`: dependency-free, can be copied into any host. |
| 3 | **View** | `srcdoc` iframe inside the proxy | The template from `resources/read ui://cards/<name>`: your card bundle and `startMcpApp`. |

### Layer 1: the host

`AppViewHost` creates the proxy iframe and connects an `AppBridge` to it through `PostMessageTransport`. It connects before setting `src`, so the proxy's first message cannot be missed. The bridge is created with `null` as its client, so every request from the view goes through playground code that logs it and applies host policy:

| From the view | What the playground host does |
| --- | --- |
| `tools/call` | Allowed only if the tool exists and its `_meta.ui.visibility` includes `'app'`; optionally asks you to confirm. Then forwarded to the server. |
| `ui/open-link` | Opens a new tab. |
| `ui/message` | Appended to the **Conversation** tab. |
| `ui/update-model-context` | Shown in the **Model context** tab. |
| `ui/request-display-mode` | Grants `inline` or `fullscreen`; fullscreen turns the pane into an overlay. |
| `resources/read` | Forwarded to the server. |
| `notifications/message` | Logged. |

Host capabilities advertised: `openLinks`, `serverTools`, `serverResources`, `logging`, `updateModelContext` (text) and `message` (text).

### Layer 2: the sandbox proxy

1. The proxy posts `ui/notifications/sandbox-proxy-ready`.
2. The host answers `ui/notifications/sandbox-resource-ready` with `{ html, sandbox, csp, permissions }`.
3. The proxy creates the inner iframe:
   - `sandbox` as given by the host;
   - `allow` built from `permissions`;
   - `srcdoc` = the HTML with a CSP `<meta>` injected after `<head>`.

   The CSP it builds from `_meta.ui.csp`:

   ```
   default-src 'none'; script-src 'self' 'unsafe-inline' <resourceDomains>;
   style-src 'self' 'unsafe-inline' <resourceDomains>; img-src 'self' data: blob: <resourceDomains>;
   font-src 'self' data: <resourceDomains>; media-src 'self' data: blob: <resourceDomains>;
   connect-src 'self' <connectDomains>; frame-src <frameDomains | 'none'>; object-src 'none';
   base-uri <baseUriDomains | 'self'>
   ```

4. It relays every other message both ways, untouched. `ui/notifications/sandbox-*` messages are for the proxy only. It never creates requests of its own.

**Two origins from one server.** Vite listens on `127.0.0.1`, so the page can be the host at `http://localhost:5173` while the proxy is loaded from `http://127.0.0.1:5173`. These are two origins, as the spec requires (*Proxy origin: auto / cross-origin*).

On a single-origin deploy such as GitHub Pages, the proxy iframe gets `sandbox="allow-scripts allow-forms"` without `allow-same-origin`. Its origin becomes opaque (`null`), which is still not the host's (*Proxy origin: opaque*).

### Layer 3: the view

The inner iframe's sandbox (*View sandbox*):

- **standard:** `allow-scripts allow-same-origin allow-forms`. This is basic-host's default; the view shares the proxy's origin, which is not the host's.
- **strict:** `allow-scripts allow-forms`. The view gets an opaque origin, with no storage. Use it to check that a card does not depend on `localStorage`.

Chrome warns that *"An iframe which has both allow-scripts and allow-same-origin … can escape its sandboxing"*. That is expected for the standard mode. It is safe here because the frame's origin is not the host's.

## The sidebar

### MCP server

- **In-browser:** `project.createServer(bundle)` is connected to an MCP `Client` through `InMemoryTransport.createLinkedPair()`. This is your real server code running in the tab, and it is what the GitHub Pages demo uses.
- **Remote:** Streamable HTTP to a URL (default `http://localhost:3001/mcp`, served by `npm run server:http`). The server's CORS must allow the playground's origin (the demo server reads its allowlist from `ALLOWED_ORIGINS`).

In both modes the client advertises `capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes = ["text/html;profile=mcp-app"]`.

### Play the model

The example buttons (from `project.examples`) and the tool list:

- **UI** marks tools with a template.
- **app-only** marks tools with `visibility: ['app']`; the model cannot call these.

Pick a tool, edit the JSON arguments (pre-filled from the example, or from the schema's required keys) and press **Call**. The host then:

1. reads the tool's template and re-creates the view;
2. waits for `ui/notifications/initialized` (with a 10 s timeout, which is logged);
3. if *Stream tool input* is on, sends `tool-input-partial` key by key (120 ms apart);
4. sends `tool-input`;
5. calls the tool;
6. sends `tool-result`. On error it sends `tool-cancelled` instead.

The native pane gets the same result.

### Fixtures

Every `fixtures` entry in the manifest becomes a button. Pressing it draws the card from those props without calling a tool: the host reads `ui://cards/<name>`, then sends an empty `tool-input` and a synthetic `tool-result`.

Below the buttons, **Props of `<card>`** shows the current card's props. Edit them and press **Apply to both panes** to re-render both panes. This is the fastest loop for design work.

### Host

| Control | Effect |
| --- | --- |
| Theme | The playground page *and* `hostContext.theme`. The header's sun/moon button does the same. |
| Locale | `hostContext.locale` (the shell's status words follow it). |
| Host styles | Presets of spec style variables (`hostContext.styles.variables`). The native pane maps them with the same `NUXT_UI_TOKENS`. |
| Display mode | `hostContext.displayMode`; `fullscreen` turns the MCP App pane into an overlay. |
| Proxy origin | `auto`, `cross-origin` or `opaque` (see layer 2). Changing it re-creates the view. |
| View sandbox | `standard` or `strict` (see layer 3). Changing it re-creates the view. |
| Stream tool input | Sends `tool-input-partial` before `tool-input`. |
| Auto-approve tool calls from cards | When off, every card `tools/call` asks you first (`window.confirm`). |

Context changes reach the view as `ui/notifications/host-context-changed` carrying only the changed fields, via `AppBridge.setHostContext`.

The pane header has two buttons: **Cancel** (`ui/notifications/tool-cancelled`) and **Teardown** (`ui/resource-teardown`). A badge next to them shows the last `size-changed` height.

## The inspector

| Tab | Shows |
| --- | --- |
| **Protocol** | Every JSON-RPC message, newest first. `→` host→view (info colour), `←` view→host (primary colour), `⛨` a host policy decision (allowed / refused / denied, and why), `•` a host-side step (connect, `resources/read`, the model's `tools/call`). Click a row for the full JSON. Filter by layer (`bridge`, `host`, `native`); *hide size/ping* hides the noisy ones. |
| **Conversation** | `ui/message` posts from cards, from both panes. |
| **Model context** | The last `ui/update-model-context`. |
| **Result** | The raw tool result: `content` for the model, `structuredContent` for the view. |

A host that fails to send (typically `DataCloneError`, when a Vue proxy or a function reaches `postMessage`) is logged as **send failed**.

## Hot reload

`npm run dev` runs two things together:

- `vite build --watch` for the card bundle (`examples/demo-cards/dist/cards.json`);
- the playground's Vite server.

When the JSON changes, `project.ts` accepts the update through `import.meta.hot`, and `main.ts` then:

1. swaps the bundle in;
2. reconnects the in-browser server (so templates carry the new script);
3. replays the current run (`tool-input` and `tool-result`) in a fresh view.

The native pane reloads through normal Vue HMR.

## Using it for your own project

Edit **`playground/src/project.ts`**. It is the only file that names the demo:

```ts
export const project: PlaygroundProject = {
  name: 'my-cards',
  manifest: cards,                    // defineCards(...)
  components,                         // { 'my-card': MyCard }
  createServer: b => createMyServer({ bundle: b }) as never, // optional: in-browser mode
  bundle,                             // import bundle from 'my-cards/cards.json'
  remoteUrl: 'http://localhost:3001/mcp',
  examples: [{ label: 'Try it', tool: 'my_tool', args: {} }],
}
```

You also need to:

- Add your cards' folder to `@source` in `playground/src/style.css`, so their Tailwind classes exist in the native pane.
- Update the `import.meta.hot.accept` path in `onBundleUpdate`.

Leave `createServer` out to use *Remote* only. The MCP App pane draws **any** MCP Apps server, even one that does not use this library. The native pane needs your components.

## Deploying to GitHub Pages

```bash
PLAYGROUND_BASE=/vue-mcp-apps/ npm run build    # packages → cards → playground/dist
```

`vite.config.ts` reads `PLAYGROUND_BASE` for `base`. Routing uses hash history, so deep links work on a static host. On `*.github.io` the proxy cannot get a second origin, so *auto* falls back to the **opaque** sandbox. Everything else works the same, including the in-browser server.

## Driving it from tests

The view sits two frames deep:

```js
const view = page
  .frameLocator('iframe[title="Sandbox proxy"]')
  .frameLocator('iframe[title="MCP App view"]')
await page.getByRole('button', { name: 'Weather in Madrid' }).click()
await view.getByRole('button', { name: 'Refresh' }).click()
```

The inspector rows are `ol li` elements, which is useful for asserting that a given method went by.
