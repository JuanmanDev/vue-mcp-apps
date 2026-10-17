# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-10-17

First public release, extracted from the card system of Facturador / Hotelier Tools. Preview on GitHub since 2026-10-15; this release adds the Dependabot updates, Vite 8 support and the CI hardening below.

### Changed since the preview

- Tooling: Vite 8 (Rolldown), Vitest 5, vue-router 5, jsdom 30, `@types/node` 26, concurrently 10, `@vueuse/core` 15; GitHub Actions checkout/setup-node/upload-artifact v7, Pages actions v5 (Dependabot #1–#10). Developing the repo now needs **Node ≥ 22.12**; the published packages still support Node ≥ 20.
- `@vue-mcp-apps/vite`: accepts Vite 8 as a peer; builds cards for `es2022` with Tailwind v4's browser baseline (`CSS_BASELINE`). Under Vite 8 the old `es2020` target made Lightning CSS lower Tailwind's logical properties (+61 kB per template); the CSS is back to ~194 kB. No `inlineDynamicImports` under Vite 8 (Rolldown builds the IIFE as one chunk already). Script is ~+13 kB gzip under Rolldown (Vue hydration helpers are no longer tree-shaken).

### Added since the preview

- CI `packages` job: `npm pack` → blank consumer project → smoke test, on Node 20, 22 and 24 (`npm run test:packages`).
- Pages workflow builds on pull requests; after each deploy, the full Playwright suite runs against the live site (`E2E_BASE_URL`).
- Release runs the packed-package smoke test and E2E before publishing.
- Dependabot: majors in their own PRs, minor/patch grouped, all actions in one PR.


### Added in the preview

- **`@vue-mcp-apps/core`**: `defineCards` (frozen manifest, validated names and actions), `cardActionFor` with five action kinds (`tool`, `link`, `notify`, `message`, `context`), `resultCard`, `toPlain`, `safeLinkUrl`, `cardUri`, `cardTools`, `eventListenerProp`, MCP Apps protocol constants and wire types, `clientSupportsMcpApps`, `resultText`.
- **`@vue-mcp-apps/view`**: `McpAppBridge` (dependency-free view side of the spec, with request timeouts), `startMcpApp` (iframe runtime: handshake, host context, streamed input, result → card, actions, card swap, size reporting, localized status line), `<McpCard>` (native host), `CardRenderer`, `useCardHost()`, `applyHostContext` and `NUXT_UI_TOKENS`.
- **`@vue-mcp-apps/server`**: `createCardServerKit` (templates, tool `_meta`, visibility, results; works with MCP SDK v1 and v2), `cardTemplateHtml`, `cardResourceMeta`, `cardToolMeta`, `toolVisibilityMeta`, `cardResult`, `asCardBundle`, `inlineSafe`.
- **`@vue-mcp-apps/vite`**: `defineCardBundleConfig` / `mcpCardBundle` (one IIFE + CSS → `cards.json`, size limit, source hash), `sourceHash`.
- **Example `demo-cards`**: weather, change approval (card-only `apply_changes`) and poll (card-only `cast_vote`) cards with Nuxt UI; one server for stdio, HTTP (CORS allowlist) and the browser.
- **Playground**: AI chat demo (`#/`) with Chrome built-in AI, WebLLM, OpenAI-compatible and scripted providers, cards inline as sandboxed MCP Apps or natively; three-layer workbench (`#/workbench`) on the official `AppBridge` with sandbox proxy, inspector, fixtures, live props editing, host settings and hot reload.
- **Tests**: core contract, renderer, protocol conformance against ext-apps' `AppBridge`, server kit against the SDK v2 server/client, bundle freshness, Playwright end-to-end.
- **CI/CD**: CI, E2E, GitHub Pages, release (npm with provenance), CodeQL, Dependabot.
- **Docs**: README, integration, architecture, writing cards, playground, AI demo, testing, CI/CD, FAQ, troubleshooting, glossary; `AGENTS.md`, `llms.txt`, `llms-full.txt`; Claude Code skill and plugin.

[Unreleased]: https://github.com/JuanmanDev/vue-mcp-apps/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/JuanmanDev/vue-mcp-apps/releases/tag/v0.1.0
