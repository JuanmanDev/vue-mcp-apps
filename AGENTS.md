# AGENTS.md — vue-mcp-apps

Terse guide for coding agents. Human docs: README.md, docs/. Claude skill: skills/vue-mcp-apps/SKILL.md.

## What

MCP Apps (ext `io.modelcontextprotocol/ui`, spec 2026-01-26) written as Vue SFCs. Same component → native in Vue app (`<McpCard>`) + sandboxed in MCP host iframe (`startMcpApp`). Server kit registers `ui://cards/<name>` templates. Vite plugin builds one `cards.json`. Playground: `#/` AI chat demo, `#/workbench` three-layer tester.

## Map

```
packages/core/src/cards.ts      defineCards cardActionFor cardTools resultCard toPlain safeLinkUrl cardUri eventListenerProp
packages/core/src/protocol.ts   METHODS MCP_APP_MIME MCP_APPS_EXTENSION MCP_APPS_PROTOCOL_VERSION HostContext CallToolResult clientSupportsMcpApps resultText
packages/view/src/bridge.ts     McpAppBridge — view side protocol, no deps, trusts only window.parent
packages/view/src/app.ts        startMcpApp — iframe runtime: handshake → result → card → actions → size
packages/view/src/McpCard.ts    <McpCard> native host
packages/view/src/renderer.ts   CardRenderer — ONLY place events → CardAction
packages/view/src/context.ts    useCardHost() {mode hostContext toolInput streaming busy}
packages/view/src/theme.ts      applyHostContext NUXT_UI_TOKENS
packages/server/src/index.ts    createCardServerKit cardTemplateHtml cardResourceMeta cardToolMeta toolVisibilityMeta cardResult asCardBundle inlineSafe
packages/vite/src/index.ts      defineCardBundleConfig mcpCardBundle(enforce post) sourceHash inlineSafe
examples/demo-cards/src         manifest.ts components.ts cards/*.vue view.ts server/{createServer,stdio,http,bundle}.ts
examples/demo-cards/test        bundle.test.ts (freshness)
playground/src/project.ts       WHICH cards/server playground tests — edit for own project
playground/src/lib              store connection sandboxHost(layer1, AppBridge, policy) workbench
playground/public/sandbox.html  layer2 proxy, no deps, copyable
playground/src/ai               types prompt agent providers/{chrome,webllm(+worker),openai,scripted}
playground/src/pages            DemoPage WorkbenchPage
e2e/                            Playwright
docs/                           ARCHITECTURE INTEGRATION WRITING_CARDS PLAYGROUND AI_DEMO TESTING CI_CD FAQ TROUBLESHOOTING GLOSSARY
```

## Commands

```bash
npm ci                    # install (workspaces)
npm run dev               # build+watch cards, playground http://localhost:5173 (NOT 127.0.0.1)
npm test                  # vitest: contract, bridge vs official AppBridge, server kit vs SDK v2, bundle freshness
npm run typecheck         # tsc -b packages + vue-tsc example/playground
npm run test:e2e          # playwright (E2E_BASE_URL=<url> → against deployed site)
npm run test:packages     # npm pack → blank project → smoke (CI: Node 20/22/24)
npm run build             # packages → cards.json → playground
npm run build:cards       # after ANY change to cards, packages/view, packages/core
npm run server:http       # demo server :3001/mcp (CORS allowlist ALLOWED_ORIGINS)
npm run server:stdio
npm run docs:llms         # regen llms-full.txt
```

## Invariants (do not break)

- Dev Node >=22.12 (Vite 8, Vitest 5). Published libs Node >=20 — keep core/server/view dependency-light, `test:packages` proves it.
- Card bundle target es2022 + `CSS_BASELINE` (evergreen hosts). Lower target = Lightning CSS bloat.
- Actions = data. Manifest maps event → action. Tool action runs DECLARED tool, never name from card. No API giving cards arbitrary tool calls.
- Card-only tools: `visibility: ['app']`. Host refuses model calls to them; refuses card calls to tools without `'app'`.
- Payload = first emitted arg. tool→plain object, link→http(s) URL, notify/message/context→text.
- postMessage payloads plain JSON. Vue proxies → DataCloneError. `toPlain` in core; hosts JSON-clone hostContext/input/result.
- Template fetches nothing: script+css inlined, icons via `icon.clientBundle.scan`, no fonts, no dynamic import (bundle must be 1 chunk). Fetching card → declare `resource.csp`.
- `McpAppBridge` spec-exact, dependency-free, checks `event.source === window.parent`.
- Server kit SDK-agnostic (`ServerLike`: registerTool + registerResource). v1 + v2.
- Result shape: `content` text for model + `structuredContent.card = {name, props}` for view. Always useful text.
- No secrets in props.
- Links http(s) only (`safeLinkUrl`).
- Custom condition `vue-mcp-apps:source`. Never bare `source`. Vite `resolve.conditions` keep `...defaultClientConditions`.
- `colorMode: false`, `router: false` in card bundle's Nuxt UI plugin. Host theme → `.dark`.
- AI demo: model sees only tools with visibility incl. `model`. Providers never touch MCP/host/cards — only text → Decision.
- Exports change → update skills/vue-mcp-apps/references/api.md + docs.

## Recipes

Add card:
1. manifest.ts `'x-card': {title, actions, fixtures}`
2. cards/XCard.vue defineProps + defineEmits (names = manifest events)
3. components.ts register
4. server `kit.registerTool(server,'show_x',{card:'x-card',inputSchema,description}, async a => kit.result('x-card', props, text))`
5. `npm run build:cards`; workbench fixture → click both panes → Protocol tab

Card-only tool: `kit.registerTool(server,'apply_x',{card:'x-card',visibility:['app'],inputSchema},h)` + manifest `approved:{kind:'tool',tool:'apply_x'}`.

Swap card: tool handler returns `kit.result('other-card', props)`.

New AI provider: implement `AiProvider` (playground/src/ai/types.ts), use prompt.ts helpers (`systemPrompt transcript decisionSchema parseDecision afterToolPrompt ANSWER_SCHEMA parseAnswer`), register in `PROVIDERS` (agent.ts).

Point playground at own project: edit playground/src/project.ts (+ `@source` in playground/src/style.css).

## Debug

- View no `initialized` → DataCloneError from host (reactive proxy). Clone.
- `css 0 kB` → vite plugin must be enforce:'post'; rebuild packages/vite dist.
- `pkce-challenge` resolve error → resolve.conditions lost defaults.
- vue-tsc errors in @internationalized/date → bare `source` condition.
- Icons blank → clientBundle.scan + @iconify-json/*.
- `⛨ refused` → visibility.
- Git Bash `PLAYGROUND_BASE=/x/` mangled → `MSYS_NO_PATHCONV=1`.
- Reach view in Playwright: `page.frameLocator('iframe[title="Sandbox proxy"]').frameLocator('iframe[title="MCP App view"]')`.

## Style

TS strict, ESM, `.js` import suffix in packages (Node-safe dist). Comments explain WHY. Tests next to sources (`*.test.ts`). Commits: Conventional Commits, terse.
