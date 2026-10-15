# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-10-15

First public version, extracted from the card system of Facturador / Hotelier Tools.

### Added

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
