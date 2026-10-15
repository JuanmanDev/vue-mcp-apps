## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test:e2e` passes (or not affected)
- [ ] `npm run build:cards` re-run if a card, `packages/view` or `packages/core` changed
- [ ] Docs updated (README / docs / `skills/vue-mcp-apps/references/api.md` when exports change); `npm run docs:llms`
- [ ] Invariants kept: actions are data, card-only tools use `visibility: ['app']`, plain JSON over `postMessage`, templates fetch nothing
- [ ] Checked in the workbench: both panes, light/dark, Protocol tab
