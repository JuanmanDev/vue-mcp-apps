# Testing

How this repo tests itself, and how to test **your** cards and servers the same way.

| Level | Where | Command |
| --- | --- | --- |
| Card contract | `packages/core/src/cards.test.ts` | `npm test` |
| Native renderer | `packages/view/src/renderer.test.ts` (jsdom) | `npm test` |
| Protocol conformance | `packages/view/src/bridge.test.ts` (jsdom) | `npm test` |
| Server kit | `packages/server/src/server.test.ts` | `npm test` |
| Bundle freshness | `examples/demo-cards/test/bundle.test.ts` | `npm test` |
| End to end | `e2e/*.spec.ts` (Playwright) | `npm run test:e2e` |
| Types | all packages, example, playground | `npm run typecheck` |
| Official tools | MCP Inspector CLI, ext-apps `basic-host` | see below |

## Unit and protocol tests (Vitest)

`vitest.config.ts` resolves workspace packages to their TypeScript sources (`vue-mcp-apps:source`), so tests need no build. Files that need a DOM start with `// @vitest-environment jsdom`.

### The card contract

Test what a click may do, not how the card looks:

```ts
import { cardActionFor } from '@vue-mcp-apps/core'
import { cards } from '../src/manifest'

it('Apply can only apply', () => {
  expect(cardActionFor(cards, 'approval-card', 'approved', [{ proposal: 'p1', ids: ['c1'], tool: 'drop_db' }]))
    .toEqual({ kind: 'tool', event: 'approved', tool: 'apply_changes', args: { proposal: 'p1', ids: ['c1'], tool: 'drop_db' } })
})
it('unlisted events ask for nothing', () => {
  expect(cardActionFor(cards, 'approval-card', 'deleted', [{}])).toBeNull()
})
```

### Protocol conformance against the official host

`bridge.test.ts` connects our `McpAppBridge` to ext-apps' `AppBridge` + `PostMessageTransport` through two fake windows that deliver messages asynchronously, with `source`, after a real `structuredClone` (exactly what `postMessage` does — which is why reactive proxies fail). It covers the handshake, host context, `tool-input-partial`/`tool-input`/`tool-result`/`tool-cancelled`, `host-context-changed`, `tools/call`, `ui/open-link`, `ui/message`, `ui/update-model-context`, `size-changed`, `ui/resource-teardown`, error propagation and ignoring foreign senders. Copy the `frames()` helper to test a view runtime of your own.

### Server kit against the real SDK

`server.test.ts` builds an SDK v2 `McpServer`, registers cards and tools through `createCardServerKit`, connects a `Client` over `InMemoryTransport.createLinkedPair()` and asserts what a host sees: listed resources and their `_meta`, tools' `_meta.ui.resourceUri` / `visibility`, a self-contained template (no `<script src>`, escaped `</script>`), and results with `structuredContent.card`. Do the same for your server:

```ts
const [a, b] = InMemoryTransport.createLinkedPair()
await createServer(bundle).connect(b)
const client = new Client({ name: 'test', version: '1' }, { capabilities: { extensions: { [MCP_APPS_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } } })
await client.connect(a)
const result = await client.callTool({ name: 'show_order', arguments: { id: 'A-1001' } })
expect(result.structuredContent).toMatchObject({ card: { name: 'order-card' } })
```

### Bundle freshness

`bundle.test.ts` recomputes `sourceHash(root, bundle.sources, bundle.versions)` and compares it with `cards.json`; it also checks that every manifest card is in the bundle and that the CSS has no remote `url()` and the script no `import()`. It is skipped when `dist/cards.json` does not exist.

## End-to-end tests (Playwright)

`e2e/` runs Chromium against the playground (built and served by Playwright's `webServer`). The suites cover:

- **Three layers**: a tool call renders the card in both panes; the proxy iframe is on another origin (or opaque); the view initializes; clicks inside the view reach the server (`tools/call allowed` in the inspector).
- **Card actions**: refresh (tool + swap), approval with a card-only tool, voting, `ui/message` into the conversation.
- **Host context**: dark mode reaches the view (`.dark` on its `<html>`).
- **AI chat (scripted provider)**: a typed request produces a card in the chat and an answer; a card's message button produces a new turn.

```bash
npx playwright install chromium   # once
npm run test:e2e
npx playwright show-report        # after a failure
```

Reaching inside a view (two iframes deep):

```ts
const view = page.frameLocator('iframe[title="Sandbox proxy"]').frameLocator('iframe[title="MCP App view"]')
await view.getByRole('button', { name: /Apply 2 of 3/ }).click()
await expect(page.getByText('tools/call allowed')).toBeVisible()
```

Tips:

- Use `http://localhost:<port>` as the page URL so the proxy (served from `127.0.0.1`) is cross-origin; on one origin the playground falls back to an opaque sandbox — test both (`Proxy origin` select).
- Never test the WebLLM / Chrome providers in CI (downloads, hardware). The scripted provider is deterministic.
- `page.addInitScript(() => localStorage.setItem('vma:intro-dismissed', '1'))` hides the workbench intro banner.

## Official tools

```bash
# Does each card tool advertise a template? (exit code 2 when not)
npx @modelcontextprotocol/inspector --cli npx tsx --conditions=vue-mcp-apps:source examples/demo-cards/src/server/stdio.ts \
  --method tools/call --tool-name get_weather --tool-arg city=Madrid --app-info
# → {"hasApp":true,"toolName":"get_weather","resourceUri":"ui://cards/weather-card","csp":{…},"prefersBorder":false,"resourceMimeType":"text/html;profile=mcp-app"}

# Interactive: Inspector UI → Apps tab
npx @modelcontextprotocol/inspector npx tsx --conditions=vue-mcp-apps:source examples/demo-cards/src/server/stdio.ts

# ext-apps reference host
npm run server:http &   # http://localhost:3001/mcp
git clone https://github.com/modelcontextprotocol/ext-apps && cd ext-apps && npm i
SERVERS='["http://localhost:3001/mcp"]' npm start   # open http://localhost:8080
```

## Manual checklist for a new card

1. Workbench → *Fixtures* → render each fixture: both panes look the same, light and dark, `es-ES` and `en-US`.
2. Edit props live (empty arrays, long strings, missing optional fields).
3. Click every button in **both** panes; the Protocol tab shows the expected `tools/call` / `ui/open-link` / `ui/message` / `ui/update-model-context` and a `⛨ allowed` line for tools.
4. Switch *View sandbox* to strict (no storage) and *Proxy origin* to opaque: still works.
5. *Play the model* with streaming on; cancel mid-way; teardown.
6. AI demo: ask for it in plain words.
7. Official Inspector `--app-info`: `hasApp: true`.
