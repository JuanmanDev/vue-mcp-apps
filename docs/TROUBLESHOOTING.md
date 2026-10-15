# Troubleshooting

Start with the workbench's **Protocol** tab: it shows every message between host and view and every host decision. Most problems are visible there in one line.

## The view

| Symptom | Cause | Fix |
| --- | --- | --- |
| Inspector shows `ui/initialize` and a `response`, but never `ui/notifications/initialized` | The host's response could not be posted: `DataCloneError` (a Vue reactive proxy in `hostContext`, tool input or result) | Send plain JSON: `JSON.parse(JSON.stringify(x))` / `toPlain(x)`. The playground logs `send failed` when this happens. |
| A card button does nothing; the view says "Did not work: DataCloneError" | The card emitted a `ref`/`reactive` value | `cardActionFor` copies payloads with `toPlain`; rebuild the bundle with a current `@vue-mcp-apps/core`. |
| "Nothing to show." under an empty card | The result has no `structuredContent.card` and no plain-object `structuredContent`, or the card name is not in the bundle | Return `kit.result(name, props, text)`; check `cards: Object.keys(manifest)` and rebuild. |
| "Unknown card "x"" | The manifest has the card but `components` does not | Add it to `components.ts`. |
| The card stays on "Loading…" | No `tool-result` arrived, or the template card differs from the result's card | Check the inspector for `ui/notifications/tool-result`; a template only draws its own card on the first result. |
| Icons are blank inside the iframe | Iconify tried to fetch from its API; the CSP blocked it | `ui({ icon: { clientBundle: { scan: true } } })` and install `@iconify-json/<collection>`. |
| Unstyled card in the iframe | `cards.json` has `css 0 kB` | Use `@vue-mcp-apps/vite` with `enforce: 'post'` (current version) and rebuild its `dist` when developing it; import your CSS in `view.ts`. |
| Dark mode does not apply | Nuxt UI `colorMode` is on (reads localStorage) or the host sends no `theme` | `ui({ colorMode: false })`; the runtime toggles `.dark` from `hostContext.theme`. |
| Card fonts differ from the host | Expected: the host's `--font-sans` is applied only when it sends `styles.variables` | Choose a *Host styles* preset in the workbench to test. |
| Iframe height jumps or stays tiny | The view measures `body`; margins or `100vh` layouts confuse it | Avoid `h-screen` in cards; let content define height. |

## Clicks and tools

| Symptom | Cause | Fix |
| --- | --- | --- |
| ⛨ `tools/call refused … not visible to apps` | The tool's `visibility` is `['model']` | Add `'app'` (or omit visibility: default is both). |
| ⛨ `model call refused … app-only` | The model (or *Play the model*) called a `visibility: ['app']` tool | Intended: only a card may call it. |
| A link does nothing | Not http(s) — `safeLinkUrl` drops `javascript:`, `data:`, relative URLs | Emit an absolute http(s) URL. |
| `message` / `context` does nothing | Empty text, or the host lacks the capability | Emit non-empty text; check `hostCapabilities.message` / `updateModelContext`. |
| An event is ignored | Not listed in the manifest's `actions` | List it — unlisted events ask for nothing, by design. |

## Build and tooling

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Failed to resolve entry for package "pkce-challenge"` | `resolve.conditions` replaced Vite's defaults | `conditions: ['vue-mcp-apps:source', ...defaultClientConditions]`. |
| `vue-tsc` errors inside `node_modules/@internationalized/date/src` | A bare `source` condition resolves third-party TS sources | Use the namespaced `vue-mcp-apps:source`. |
| "A card bundle is one script; got N chunks" | A dynamic `import()` in a card or its dependencies | Import statically. |
| "Card bundle is N kB, over maxSizeKb" | Heavy dependency in a card | Trim it, or raise `maxSizeKb`. |
| Bundle freshness test fails | A card / `packages/view` / `packages/core` changed after the last build | `npm run build:cards`. |
| `PLAYGROUND_BASE=/x/` becomes `C:/Program Files/Git/x/` (Git Bash) | MSYS path conversion | Prefix with `MSYS_NO_PATHCONV=1`. |
| Shell scripts arrive empty on Windows | Line-ending/autocrlf tooling | Check `git diff` before committing. |

## Playground and hosts

| Symptom | Cause | Fix |
| --- | --- | --- |
| Proxy layer never turns green | Page opened at `127.0.0.1` while Vite only answers one name, or a blocked port | Open `http://localhost:5173`; or pick *Proxy origin: opaque*. |
| "view not ready … after 10 s" | The template is not an MCP App (no bridge), or a script error in the view | Open DevTools on the `about:srcdoc` frame; check the console. |
| Remote mode: CORS error or 403 | The server does not allow the page's origin | Add it to `ALLOWED_ORIGINS` (demo) / your CORS allowlist. |
| Hot reload does a full page reload | `onBundleUpdate` points at another `cards.json` specifier | Accept the same specifier you import in `project.ts`. |
| claude.ai cannot reach a local server | It needs public https | Tunnel (`cloudflared tunnel --url http://localhost:3001`). |
| Claude Desktop shows text, not the card | Old client, or the tool has no `_meta.ui.resourceUri` (bundle missing at server start) | Update the client; make sure `cards.json` exists before starting the server. |

## AI demo

| Symptom | Cause | Fix |
| --- | --- | --- |
| Chrome built-in AI shows `unavailable` | Browser/hardware/flags | Check `chrome://on-device-internals`; use WebLLM or Scripted. |
| WebLLM: "WebGPU not available" | Browser or GPU without WebGPU | Recent Chrome/Edge on desktop; or another provider. |
| WebLLM out of memory | Model too large for the GPU | Pick Llama 3.2 1B or Qwen2.5 0.5B. |
| "unusable reply … the scripted rules answer instead" | The small model produced invalid JSON or a wrong tool | Expected now and then; a larger model or clearer tool descriptions help. |
| OpenAI-compatible: `Failed to fetch` | CORS on the endpoint | Ollama: `OLLAMA_ORIGINS=<page origin> ollama serve`; LM Studio: enable CORS. |
