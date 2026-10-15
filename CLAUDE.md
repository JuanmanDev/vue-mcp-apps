# CLAUDE.md — agent guide for vue-mcp-apps

**Read `skills/vue-mcp-apps/SKILL.md` first.** It has the mental model, the recipe for adding a card, the invariants and the troubleshooting table. `AGENTS.md` is the terse version; `docs/INTEGRATION.md` covers using this in other projects.

## Repo map

```
packages/core     card contract + protocol constants/types (no DOM, no deps)
packages/view     startMcpApp (iframe runtime), McpCard (native), McpAppBridge, useCardHost, theme
packages/server   createCardServerKit — ui:// templates, tool _meta, results (SDK v1/v2)
packages/vite     defineCardBundleConfig / mcpCardBundle → cards.json (one script + one css)
examples/demo-cards  3 Nuxt UI cards + MCP server (stdio, HTTP :3001, in-browser)
playground        #/ AI chat demo (src/ai: chrome · webllm · openai · scripted) · #/workbench: native | host→proxy→view (official AppBridge) | inspector
e2e/              Playwright tests (npm run test:e2e)
.github/          ci · e2e · pages · release · codeql workflows, dependabot, issue/PR templates
skills/           the Claude skill (also shipped as a plugin via .claude-plugin/)
docs/             ARCHITECTURE, INTEGRATION, WRITING_CARDS, PLAYGROUND, AI_DEMO, TESTING, CI_CD, FAQ, TROUBLESHOOTING, GLOSSARY
AGENTS.md · llms.txt · llms-full.txt   AI-friendly entry points (npm run docs:llms)
```

npm workspaces: run `npm install` once at the root.

## Commands

```bash
npm run dev              # playground + watched card build → http://localhost:5173 (use localhost, not 127.0.0.1)
npm test                 # vitest (contract, bridge vs official AppBridge, server kit vs SDK v2, bundle freshness)
npm run typecheck        # tsc -b packages + vue-tsc example/playground
npm run build            # packages → cards.json → static playground
npm run build:packages   # needed after editing packages/vite (configs load dist/)
npm run build:cards      # examples/demo-cards/dist/cards.json — rebuild after touching a card
npm run server:http      # demo server on http://localhost:3001/mcp
npm run test:e2e         # Playwright (three layers, card clicks, scripted AI chat)
npm run docs:llms        # regenerate llms-full.txt after editing docs
```

## Invariants

- What a card event does is declared in the manifest (`defineCards`). A tool action runs the **declared** tool. Never give cards a way to call arbitrary tools.
- Everything that crosses `postMessage` is plain JSON: `toPlain` in the card path, a JSON copy in hosts. Vue proxies throw `DataCloneError`.
- A template fetches nothing: everything is inlined, icons are bundled (`icon.clientBundle.scan`), there are no fonts, and there is no dynamic `import()`.
- `McpAppBridge` stays spec-exact and dependency-free. It trusts only `event.source === window.parent`.
- Server helpers stay SDK-agnostic (`ServerLike`).
- Card-only tools use `visibility: ['app']`.
- Workspace sources resolve through the condition `vue-mcp-apps:source`. Never use a bare `source`, and keep `...defaultClientConditions` in Vite's `resolve.conditions`.
- Rebuild `cards.json` after changing a card, `packages/view` or `packages/core`. The bundle freshness test fails otherwise.
- Docs and the skill describe the real exported names. Update `skills/vue-mcp-apps/references/api.md` when an export changes.
- The AI demo's model only sees tools whose visibility includes `model`; providers turn text into a `Decision` and never touch MCP, the host or cards.
- After editing docs, run `npm run docs:llms`.
