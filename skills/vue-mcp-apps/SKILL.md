---
name: vue-mcp-apps
description: Build, extend and test MCP Apps (MCP UI, the io.modelcontextprotocol/ui extension) written as native Vue components with the vue-mcp-apps libraries (@vue-mcp-apps/core, view, server, vite). Use it when creating or editing an interactive card for an MCP tool with Vue or Nuxt UI; when registering ui:// template resources or shaping tool results with structuredContent.card; when mounting cards natively with <McpCard> or inside a host iframe with startMcpApp; when building the single-file card bundle (cards.json); when testing views against the official AppBridge, a sandbox proxy, or the vue-mcp-apps playground (native pane, three-layer MCP App pane, protocol inspector); or when debugging a card that does not render, does not initialize, or whose buttons do nothing.
---

# vue-mcp-apps

## Mental model

A **card** is a Vue SFC: props come in, events go out, and the card knows nothing about MCP. A frozen **manifest** (`defineCards`) declares what each event *means*:

| Kind | Meaning |
| --- | --- |
| `tool` | Call a declared tool. |
| `link` | Open an http(s) URL. |
| `notify` | Show a line under the card. |
| `message` | Post a user message to the chat. |
| `context` | Update the model's context. |

The same component runs in two hosts:

1. **Native:** `<McpCard>` mounts it inside your own Vue app. There is no iframe.
2. **MCP App:** the server publishes `ui://cards/<name>`, an HTML template with one inlined script and stylesheet built by `@vue-mcp-apps/vite`. A host (Claude, VS Code, Goose, ChatGPT, the playground) frames it in three layers: host → sandbox proxy (another origin) → view. Inside the view, `startMcpApp` speaks the MCP Apps protocol.

Tools return `kit.result(name, props, text)`. That puts `structuredContent.card = { name, props }` in the result for the view, and `content` text for the model. A card click becomes `tools/call`, and the host proxies it to the server.

## File map

```
packages/core/src/cards.ts       defineCards, cardActionFor, resultCard, toPlain, safeLinkUrl, cardUri, eventListenerProp
packages/core/src/protocol.ts    METHODS, MCP_APP_MIME, MCP_APPS_EXTENSION, HostContext & wire types, clientSupportsMcpApps, resultText
packages/view/src/bridge.ts      McpAppBridge — the view side of the protocol, dependency-free
packages/view/src/app.ts         startMcpApp — the iframe runtime (handshake, result → card, actions, size)
packages/view/src/McpCard.ts     <McpCard> — native host
packages/view/src/renderer.ts    CardRenderer — the one place events become CardActions (used by both hosts)
packages/view/src/context.ts     useCardHost() — read-only { mode, hostContext, toolInput, streaming, busy }
packages/view/src/theme.ts       applyHostContext, NUXT_UI_TOKENS
packages/server/src/index.ts     createCardServerKit, cardTemplateHtml, cardToolMeta, cardResult, …
packages/vite/src/index.ts       defineCardBundleConfig, mcpCardBundle (enforce: 'post') → cards.json
examples/demo-cards/             manifest.ts, components.ts, cards/*.vue, view.ts, vite.cards.config.ts, server/{createServer,stdio,http}.ts
playground/src/project.ts        THE file that says which cards/server the playground tests
playground/src/lib/sandboxHost.ts  host layer on the official AppBridge (policy + logging)
playground/public/sandbox.html   the sandbox proxy (layer 2), copyable into any host
playground/src/pages/            DemoPage (#/ AI chat) · WorkbenchPage (#/workbench)
playground/src/ai/               AI demo: types.ts (AiProvider, Decision) · prompt.ts (systemPrompt, decisionSchema, parseDecision) · agent.ts (send, PROVIDERS, modelTools) · providers/{chrome,webllm,openai,scripted}.ts
e2e/                             Playwright end-to-end tests (npm run test:e2e)
.github/workflows/               ci · e2e · pages · release · codeql (+ dependabot.yml)
AGENTS.md · llms.txt · llms-full.txt   AI-friendly entry points (npm run docs:llms regenerates llms-full.txt)
docs/ARCHITECTURE.md · INTEGRATION.md · WRITING_CARDS.md · PLAYGROUND.md · AI_DEMO.md · TESTING.md · CI_CD.md · FAQ.md · TROUBLESHOOTING.md · GLOSSARY.md
references/protocol.md · references/api.md   (next to this file)
```

## Recipe: add a card (6 steps)

1. **Manifest.** In `manifest.ts`, add `'my-card': { title, description, actions: { evt: { kind: 'tool', tool: 'my_tool' }, … }, fixtures: { default: {…} } }`. The name is kebab-case with a dash.
2. **Component.** Write `cards/MyCard.vue`:
   - `defineProps` for the data;
   - `defineEmits` with exactly the event names from the manifest;
   - the first emitted argument is the payload: an object for `tool`, a URL for `link`, text for `message` / `context` / `notify`;
   - optionally `useCardHost()` for `busy`, `mode`, `hostContext` and `toolInput`.
3. **Register.** Add `'my-card': MyCard` to `components.ts`. The view bundle and native hosts both import it.
4. **Server.** Return the card from a tool:
   - `kit.registerTool(server, 'show_my', { card: 'my-card', inputSchema, description }, async args => kit.result('my-card', props, 'what the model should read'))`;
   - a tool that only the card may call gets `visibility: ['app']`.
5. **Build.** `npm run build:cards`, or `npm run dev`, which watches. The card name must be in `cards: Object.keys(manifest)`.
6. **Verify.** In `npm run dev` → http://localhost:5173:
   - draw the card from a fixture, edit its props, click in **both** panes;
   - then "play the model" with the real tool;
   - read the Protocol tab;
   - run `npm test` (the bundle freshness test fails until `cards.json` is rebuilt).

## Extending the libraries: invariants to keep

- **Actions are data.** A tool action always runs the tool *declared* in the manifest, never a name sent by the card. Do not add a `callTool` to `useCardHost()` or to card props. New action kinds go in `CardActionSpec`, `defineCards` validation, `cardActionFor`, both hosts (`app.ts`, `McpCard.ts`) and the docs.
- **Payloads are plain JSON.** Everything that crosses `postMessage` goes through `toPlain`, or a JSON copy on the host side. Vue proxies throw `DataCloneError`.
- **A template fetches nothing.** One inline script and one inline stylesheet, bundled icons, no fonts, no dynamic `import()`. The CSP stays empty unless a card declares `resource.csp`.
- **One bundle, one source hash.** `cards.json` holds `{ generatedBy, versions, sourceHash, sources, cards, script, css }`. Keep `mcpCardBundle` at `enforce: 'post'`.
- **The view bridge stays spec-exact and dependency-free.** Method names come from `METHODS`. Trust only `event.source === window.parent`. Answer `ping` and `ui/resource-teardown`; answer unknown requests with `-32601`. The test `packages/view/src/bridge.test.ts` plays it against the official `AppBridge`, so keep it green.
- **The server kit stays SDK-agnostic.** It only uses `registerTool` and `registerResource` (`ServerLike`). `packages/server/src/server.test.ts` runs it against a real SDK v2 `McpServer` and `Client`.
- **Workspace resolution uses the custom condition `vue-mcp-apps:source`**, never a bare `source`:
  - Vite: `resolve.conditions: ['vue-mcp-apps:source', ...defaultClientConditions]`;
  - tsconfig: `customConditions`;
  - tsx: `--conditions=vue-mcp-apps:source`.
- Config files load packages from `dist`. After editing `packages/vite`, run `npm run build:packages` before building cards.

## Integrating into another project

Full guide with copy-pasteable files: `docs/INTEGRATION.md`. In short:

- **Cards package** exports `manifest` (pure data, imported by every side), `components` (browser sides) and `dist/cards.json` (server only).
- **Server**: `createCardServerKit({ manifest, bundle })` on SDK v2 (`@modelcontextprotocol/server`, `inputSchema: z.object(...)`) or v1 (`@modelcontextprotocol/sdk/server/mcp.js`, raw zod shape). HTTP: `createMcpHandler(factory)` + `toNodeHandler` (Node/Express) or `.fetch(request)` (edge). Keep state outside the factory; CORS allowlist for browser hosts.
- **Nuxt 4 app**: `modules: ['@nuxt/ui']`, `build.transpile: ['my-cards']`, `@source` the cards folder in the CSS, render `<McpCard>` in a `.client.vue` component with `call-tool` wired to the app's MCP client; `message` actions → next chat turn, `context` → next prompt.
- **Plain Vue**: `ui({ scanPackages: ['my-cards'] })` + `app.use(ui)`.
- **Unknown cards from other servers**: be a host — `AppBridge` + the copyable `playground/public/sandbox.html` on another origin; `playground/src/lib/sandboxHost.ts` is the reference.
- **Migrating a hand-rolled system** (Facturador's `CARD_ACTIONS`/`card-host.ts`/`mcp-app/*`/`api/mcp-apps.ts`): mapping table in `docs/INTEGRATION.md#11-migrating-a-hand-rolled-card-system`. Note the payload moves to the FIRST emitted argument and `tag` → `name` (`uriPrefix` keeps old URIs).

## The AI demo (`#/`)

An in-browser assistant picks a **model-visible** tool (`modelTools()`: visibility includes `"model"`), the host calls it, and the card appears in the chat as a sandboxed MCP App (or natively). Card `ui/message` → next user turn (`fromCard`); `ui/update-model-context` → `chat.modelContext`.

- Providers (`AiProvider`): `chrome` (Prompt API `LanguageModel`, Gemini Nano, `responseConstraint`), `webllm` (`@mlc-ai/web-llm` in a Web Worker; Qwen2.5-1.5B default, Llama-3.2-1B, Qwen2.5-0.5B), `openai` (OpenAI-compatible, native `tools`; Ollama default `http://localhost:11434/v1`, `qwen2.5:3b`), `scripted` (rules; always available; fallback).
- Decision JSON: `{"action":"call_tool","tool":<enum>,"arguments":{}}` | `{"action":"answer","text":"…"}`; `parseDecision` validates tool + required args, else `DecisionError` → scripted fallback.
- Add a provider: implement `AiProvider` with the `prompt.ts` helpers, register in `PROVIDERS`. Providers never touch MCP, the host or cards.
- Details: `docs/AI_DEMO.md`.

## Testing

- `npm test`: vitest, covering the core contract, the bridge against `AppBridge` over fake windows, the server kit over `InMemoryTransport`, and bundle freshness.
- `npm run typecheck`: `tsc -b` for the packages, `vue-tsc` for the example and the playground.
- Playground by Playwright. The view is two frames deep:
  ```js
  const view = page.frameLocator('iframe[title="Sandbox proxy"]').frameLocator('iframe[title="MCP App view"]')
  await page.getByRole('button', { name: 'Weather in Madrid' }).click()
  await view.getByRole('button', { name: 'Refresh' }).click()
  // inspector rows: page.locator('ol li')
  ```
- End to end: `npm run test:e2e` (Playwright, `e2e/`): three layers, card clicks, scripted AI chat. Never use WebLLM/Chrome AI in CI.
- CI/CD: `ci.yml` (build, freshness, unit, typecheck, playground build), `e2e.yml`, `pages.yml` (GitHub Pages, `PLAYGROUND_BASE=/<repo>/`), `release.yml` (tag `v*` → npm publish through trusted publishing, with provenance), `codeql.yml`, `dependabot.yml`. See `docs/CI_CD.md`.
- Official CLI probe: `npx @modelcontextprotocol/inspector --cli <server cmd> --method tools/call --tool-name get_weather --tool-arg city=Madrid --app-info` → `hasApp: true`.
- Official inspector (Apps tab): `npx @modelcontextprotocol/inspector npx tsx --conditions=vue-mcp-apps:source examples/demo-cards/src/server/stdio.ts`.
- Remote: `npm run server:http` → `http://localhost:3001/mcp`. Use it with the playground's *Remote* mode, ext-apps' `basic-host`, or MCPJam.

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| View shows "Loading…" forever; the log has `ui/initialize` and a response but no `ui/notifications/initialized` | The host's `postMessage` threw `DataCloneError`: a Vue reactive proxy is inside `hostContext`, the tool args or the result. JSON-copy everything you send (the playground's `plain()`); the inspector logs it as **send failed**. |
| Card shows "Did not work: DataCloneError … could not be cloned" | The card emitted reactive state (for example a `ref([])`) and something bypassed `toPlain`. Emit plain data, and keep `toPlain` in `cardActionFor`. |
| Build reports `css 0 kB` | `mcpCardBundle` ran before Vite's CSS plugin. It must be `enforce: 'post'`. If you changed it, rebuild `packages/vite` (configs load `dist`). |
| Icons missing; the console shows CSP / `api.iconify.design` blocked | Icons must be bundled: `ui({ icon: { clientBundle: { scan: true } } })` plus the `@iconify-json/<set>` package. |
| `Failed to resolve entry for package "pkce-challenge"` (or another dependency) in Vite | `resolve.conditions` replaced the defaults. Use `['vue-mcp-apps:source', ...defaultClientConditions]`. |
| `vue-tsc` errors inside `node_modules/@internationalized/date` (or another package's raw `.ts`) | A bare `source` condition. Use the namespaced `vue-mcp-apps:source`. |
| Card not drawn; status says "Nothing to show." or shows the text | The result has no `structuredContent.card`; or the card name is not in `cards.json` (rebuild); or the template is for another card (a template draws its own card first). |
| Button does nothing | The event name is not listed in the manifest (no listener is bound), or a `link` payload is not http(s), or a `message` / `context` payload is empty. |
| "Refused by host: tool is not visible to apps" | The tool's `_meta.ui.visibility` lacks `'app'`. Register it with `visibility: ['model', 'app']`, or leave the option out. |
| Model cannot call a tool | It is `visibility: ['app']` (card-only), which is by design. |
| Native pane: "no native component" | Add the component to `project.components` (`playground/src/project.ts`) and its folder to `@source` in `playground/src/style.css`. |
| Sandbox pane blank on `127.0.0.1` | Open `http://localhost:5173`: the proxy uses the other host name to get a second origin. |
| AI demo: "unusable reply … scripted rules answer instead" | A small model produced invalid JSON / unknown tool / missing args. Expected sometimes; improve tool descriptions or use a larger model. |
| AI demo: OpenAI-compatible `Failed to fetch` | Endpoint CORS: `OLLAMA_ORIGINS=<page origin> ollama serve`; LM Studio → enable CORS. |
| `PLAYGROUND_BASE=/x/` became `C:/Program Files/Git/x/` | Git Bash path conversion: `MSYS_NO_PATHCONV=1`. |
| Dark mode wrong inside the view | The bundle must use `ui({ colorMode: false })`. The theme comes from `hostContext.theme` (the `.dark` class). |

More: `references/protocol.md` (every MCP Apps message and field) and `references/api.md` (every export).
