# Contributing

Thanks for helping. This is a small monorepo with npm workspaces and Node ≥ 20.

```bash
npm install
npm run dev          # playground: http://localhost:5173 (#/ AI demo, #/workbench)
npm test             # vitest
npm run typecheck
npm run test:e2e     # Playwright (npx playwright install chromium once)
```

## Before you open a pull request

- `npm test`, `npm run typecheck` and `npm run test:e2e` pass.
- If you touched a card, `packages/view` or `packages/core`, rebuild the demo bundle (`npm run build:cards`) and commit `examples/demo-cards/dist/cards.json` if it is tracked. The bundle freshness test fails otherwise.
- If you touched `packages/vite`, run `npm run build:packages` first: Vite configs load the package from `dist/`.
- Check the change in the playground, in **both** panes: native, and MCP App (host → proxy → view). Read the Protocol tab.
- If an export changed, update `docs/` and `skills/vue-mcp-apps/references/api.md`.
- After editing any doc, run `npm run docs:llms` to regenerate `llms-full.txt`.
- Add a line to `CHANGELOG.md` under *Unreleased*.

## Ground rules

These are the invariants listed in [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- Actions are data.
- Payloads are plain JSON.
- Templates fetch nothing.
- The view bridge has no dependencies.
- The server helpers are SDK-agnostic.

New protocol features follow the [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) by name and shape.

Commits follow Conventional Commits (`feat(view): …`, `fix(playground): …`, `docs: …`).
