# Integration guide

How to use vue-mcp-apps in **your** project: where the files go, what each side imports, and complete files you can copy. Every path below is real and every name is exported by the packages.

- [0. Choose a layout](#0-choose-a-layout)
- [1. Install the packages](#1-install-the-packages)
- [2. A cards package (manifest, components, view, bundle)](#2-a-cards-package)
- [3. Serve the cards from an MCP server](#3-serve-the-cards-from-an-mcp-server)
  - [SDK v2](#31-sdk-v2-modelcontextprotocolserver) · [SDK v1](#32-sdk-v1-modelcontextprotocolsdk) · [stdio](#33-stdio) · [Node http](#34-node-http) · [Express](#35-express) · [fetch handlers: Cloudflare, Bun, Deno, Hono](#36-fetch-handlers-cloudflare-workers-bun-deno-hono)
- [4. Reading `cards.json` in Node and in bundlers](#4-reading-cardsjson)
- [5. Native cards in a Nuxt 4 app](#5-native-cards-in-a-nuxt-4-app)
- [6. Native cards in a plain Vue + Vite app](#6-native-cards-in-a-plain-vue--vite-app)
- [7. Your own chat UI (known and unknown cards)](#7-your-own-chat-ui)
- [8. Connecting real hosts](#8-connecting-real-hosts)
- [9. Keeping the bundle fresh in CI](#9-keeping-the-bundle-fresh-in-ci)
- [10. Using the playground with your cards](#10-using-the-playground-with-your-cards)
- [11. Migrating a hand-rolled card system](#11-migrating-a-hand-rolled-card-system)
- [12. Checklist](#12-checklist)

---

## 0. Choose a layout

| Layout | When | How the pieces find each other |
| --- | --- | --- |
| **Inside this monorepo** (fork it, add `examples/my-cards`) | Prototyping; you want the playground with zero setup | npm workspaces |
| **Your monorepo**: `packages/cards` + `apps/server` + `apps/web` | You own the server and the app | Workspaces; `cards` exports `manifest`, `components`, `cards.json` |
| **Separate repos** | Cards shared by several apps / servers | Publish `my-cards` (manifest + components + built `cards.json`) as a package |

The rule that makes all layouts work: **the manifest is pure data and is imported by every side**; the components are imported by browser sides only; `cards.json` is read by the server only.

```
my-cards/
  src/manifest.ts        ← server, view bundle, native hosts, tests
  src/components.ts      ← view bundle, native hosts
  src/cards/*.vue
  src/view.ts            ← entry of the view bundle (runs in the host's iframe)
  src/cards.css
  vite.cards.config.ts   ← builds dist/cards.json
  dist/cards.json        ← the server inlines it into ui:// templates
```

## 1. Install the packages

From npm (to work from a local path or tarballs instead, see the README's [Install](../README.md#install)):

```bash
npm i @vue-mcp-apps/core @vue-mcp-apps/view @vue-mcp-apps/server
npm i -D @vue-mcp-apps/vite
```

| Side | Needs |
| --- | --- |
| Cards package | `@vue-mcp-apps/core`, `@vue-mcp-apps/view`, `vue`, `@nuxt/ui`, `tailwindcss` · dev: `@vue-mcp-apps/vite`, `vite`, `@vitejs/plugin-vue`, `@iconify-json/lucide` |
| MCP server | `@vue-mcp-apps/server` (+ `@vue-mcp-apps/core`), your MCP SDK (`@modelcontextprotocol/server` v2 or `@modelcontextprotocol/sdk` v1), `zod` |
| Native host app | `@vue-mcp-apps/view`, `vue`, `@nuxt/ui` (if the cards use it), your MCP client |

> **TypeScript inside this monorepo.** Workspace packages export their TypeScript sources under the custom condition `vue-mcp-apps:source`. Consumers of built packages need nothing. Inside the monorepo set `"customConditions": ["vue-mcp-apps:source"]` in tsconfig, `resolve.conditions: ['vue-mcp-apps:source', ...defaultClientConditions]` in Vite, and `tsx --conditions=vue-mcp-apps:source` for Node scripts. Never use a bare `source` condition (it collides with third-party packages).

## 2. A cards package

### `package.json`

```json
{
  "name": "my-cards",
  "private": true,
  "type": "module",
  "exports": {
    "./manifest": "./src/manifest.ts",
    "./components": "./src/components.ts",
    "./cards.json": "./dist/cards.json"
  },
  "scripts": {
    "build:cards": "vite build -c vite.cards.config.ts",
    "watch:cards": "vite build -c vite.cards.config.ts --watch"
  },
  "dependencies": {
    "@nuxt/ui": "^4.11.3",
    "@vue-mcp-apps/core": "^0.1.0",
    "@vue-mcp-apps/view": "^0.1.0",
    "tailwindcss": "^4.2.1",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@iconify-json/lucide": "^1.2.0",
    "@vitejs/plugin-vue": "^6.0.0",
    "@vue-mcp-apps/vite": "^0.1.0",
    "vite": "^8.0.0"
  }
}
```

If the package is consumed by a server compiled with `tsc` (not a bundler), export compiled `.js` for the manifest instead of `.ts`, or compile it with your server.

### `src/manifest.ts`

```ts
import { defineCards } from '@vue-mcp-apps/core'

export const cards = defineCards({
  'order-card': {
    title: 'Order',
    description: 'One order with its lines and a cancel button.',
    actions: {
      cancelRequested: { kind: 'tool', tool: 'cancel_order' }, // card-only tool on the server
      opened: { kind: 'link' },
      asked: { kind: 'message' },
    },
    fixtures: {
      paid: { id: 'A-1001', status: 'paid', total: 42.5, lines: [{ sku: 'TEA', qty: 2 }] },
    },
  },
})
export type CardName = keyof typeof cards
```

### `src/components.ts`

```ts
import type { Component } from 'vue'
import OrderCard from './cards/OrderCard.vue'
import type { CardName } from './manifest'

export const components: Record<CardName, Component> = { 'order-card': OrderCard }
```

### `src/cards/OrderCard.vue`

```vue
<script setup lang="ts">
import { useCardHost } from '@vue-mcp-apps/view'

const props = defineProps<{ id: string; status: string; total: number; lines: Array<{ sku: string; qty: number }> }>()
const emit = defineEmits<{
  cancelRequested: [args: { id: string }]
  opened: [url: string]
  asked: [text: string]
}>()
const host = useCardHost()
const money = (n: number) => new Intl.NumberFormat(host.hostContext.value.locale, { style: 'currency', currency: 'EUR' }).format(n)
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between">
      <p class="font-semibold">Order {{ id }}</p>
      <UBadge :color="status === 'paid' ? 'success' : 'neutral'">{{ status }}</UBadge>
    </div>
    <ul class="text-sm my-3"><li v-for="l in lines" :key="l.sku">{{ l.qty }} × {{ l.sku }}</li></ul>
    <p class="font-bold">{{ money(total) }}</p>
    <div class="flex gap-2 mt-3">
      <UButton color="error" variant="soft" :loading="host.busy.value" @click="emit('cancelRequested', { id })">Cancel order</UButton>
      <UButton variant="ghost" @click="emit('asked', `Why was order ${id} charged ${money(total)}?`)">Ask</UButton>
    </div>
  </UCard>
</template>
```

### `src/view.ts` and `src/cards.css`

```ts
import './cards.css'
import ui from '@nuxt/ui/vue-plugin'
import { startMcpApp } from '@vue-mcp-apps/view'
import { cards } from './manifest'
import { components } from './components'

startMcpApp({ manifest: cards, components, install: app => app.use(ui), appInfo: { name: 'my-cards', version: '1.0.0' } })
  .catch(error => console.error('[my-cards] could not start:', error))
```

```css
@import "tailwindcss";
@import "@nuxt/ui";
@source "./cards";
html, body { background: transparent; }
```

`startMcpApp` options: `manifest`, `components`, `install(app)`, `appInfo`, `root` (default `[data-mcp-card]` then `#app`), `card` (default: the root's `data-mcp-card`), `tokens` (host variable → design token map, default `NUXT_UI_TOKENS`), `strings` (per-language overrides of the shell's few words), `displayModes`, `reportClicksToModel` (default `true`).

### `vite.cards.config.ts`

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { defineCardBundleConfig } from '@vue-mcp-apps/vite'
import { cards } from './src/manifest'

export default defineConfig(defineCardBundleConfig({
  entry: 'src/view.ts',
  outFile: 'dist/cards.json',
  cards: Object.keys(cards),
  maxSizeKb: 2048, // fail the build past this
  plugins: [
    vue(),
    ui({
      router: false,                          // no vue-router inside a card; links are actions
      colorMode: false,                       // the host decides light/dark
      icon: { clientBundle: { scan: true } }, // bundle the icons you use: a template fetches nothing
    }),
  ],
}))
```

`cards.json` fields: `generatedBy`, `versions` (vue, @nuxt/ui, tailwindcss, @vue-mcp-apps/view), `sourceHash`, `sources`, `cards`, `script` (one IIFE), `css`. The plugin refuses more than one chunk (no dynamic `import()` in cards) and warns about assets it cannot inline.

## 3. Serve the cards from an MCP server

`createCardServerKit({ manifest, bundle, uriPrefix? })` returns:

| Member | Does |
| --- | --- |
| `registerResources(server)` | Registers `ui://cards/<name>` (mime `text/html;profile=mcp-app`, `_meta.ui.csp` from the manifest) for every card that is both declared and built. Returns the URIs. |
| `registerTool(server, name, config, handler)` | `server.registerTool` with `_meta.ui.resourceUri` (+ the legacy flat key) when `config.card` is drawable, and `_meta.ui.visibility` when `config.visibility` is set. `card` / `visibility` are removed before the SDK sees the config. |
| `result(name, props, text?)` | `{ content: [{ type: 'text', text }], structuredContent: { card: { name, props } } }`. |
| `uri(name)`, `html(name)`, `drawable(name)`, `bundle`, `manifest` | Helpers. |

### 3.1 SDK v2 (`@modelcontextprotocol/server`)

```ts
// server/createServer.ts — isomorphic: stdio, HTTP, edge, browser
import { McpServer } from '@modelcontextprotocol/server'
import { createCardServerKit } from '@vue-mcp-apps/server'
import { z } from 'zod'
import { cards } from 'my-cards/manifest'

export function createServer(bundle: unknown) {
  const server = new McpServer({ name: 'shop', version: '1.0.0' })
  const kit = createCardServerKit({ manifest: cards, bundle })
  kit.registerResources(server)

  kit.registerTool(server, 'show_order', {
    card: 'order-card',
    title: 'Show order',
    description: 'Show one order as an interactive card.',
    inputSchema: z.object({ id: z.string() }),
    annotations: { readOnlyHint: true },
  }, async ({ id }: { id: string }) => {
    const order = await db.orders.get(id)
    return kit.result('order-card', order, `Order ${id}: ${order.status}, total ${order.total} EUR.`)
  })

  kit.registerTool(server, 'cancel_order', {
    card: 'order-card',
    visibility: ['app'],            // only the card's button; the model never sees it
    description: 'Cancel an order. Called by the card after the user clicks.',
    inputSchema: z.object({ id: z.string() }),
  }, async ({ id }: { id: string }) => {
    const order = await db.orders.cancel(id)
    return kit.result('order-card', order, `Order ${id} cancelled.`)
  })

  return server
}
```

### 3.2 SDK v1 (`@modelcontextprotocol/sdk`)

The kit is SDK-agnostic (`ServerLike` = anything with `registerTool` and `registerResource`). The only difference is v1's input schema shape (a raw zod shape):

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createCardServerKit } from '@vue-mcp-apps/server'
import { z } from 'zod'

const server = new McpServer({ name: 'shop', version: '1.0.0' })
const kit = createCardServerKit({ manifest: cards, bundle })
kit.registerResources(server)
kit.registerTool(server, 'show_order', {
  card: 'order-card',
  description: 'Show one order as an interactive card.',
  inputSchema: { id: z.string() },
}, async ({ id }: { id: string }) => kit.result('order-card', await db.orders.get(id)))
```

### 3.3 stdio

```ts
// server/stdio.ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { createServer } from './createServer'
import { readCardBundle } from './bundle'

await createServer(readCardBundle()).connect(new StdioServerTransport())
console.error('[shop] MCP server on stdio') // stdout belongs to the protocol: log to stderr
```

### 3.4 Node http

```ts
// server/http.ts
import { createServer as createHttpServer } from 'node:http'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createServer } from './createServer'
import { readCardBundle } from './bundle'

const bundle = readCardBundle()
const mcp = toNodeHandler(createMcpHandler(() => createServer(bundle)))
const ALLOWED = new Set((process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(','))

createHttpServer((req, res) => {
  const origin = req.headers.origin
  if (origin) {
    if (!ALLOWED.has(origin)) return void res.writeHead(403).end(`Origin ${origin} not allowed`)
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id, authorization')
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version')
  }
  if (req.method === 'OPTIONS') return void res.writeHead(204).end()
  if (!req.url?.startsWith('/mcp')) return void res.writeHead(404).end()
  Promise.resolve(mcp(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500).end() })
}).listen(3001)
```

`createMcpHandler` builds a fresh server per request (stateless). Keep state — sessions, stores, caches — **outside** the factory and pass it in (the demo's `createDemoStore()`).

CORS matters only for browser hosts (the playground, a web chat calling your server directly). Desktop hosts and server-side connectors ignore it. Never answer `Access-Control-Allow-Origin: *` on a server that holds anything private.

### 3.5 Express

```ts
import express from 'express'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'

const app = express()
const mcp = toNodeHandler(createMcpHandler(() => createServer(bundle)))
app.all('/mcp', (req, res) => { void mcp(req, res) }) // mount BEFORE express.json(): the handler reads the body itself
app.use(express.json())
app.listen(3001)
```

(`@modelcontextprotocol/express` also exists for SDK v2; use it if you prefer its helpers.)

### 3.6 fetch handlers (Cloudflare Workers, Bun, Deno, Hono)

```ts
import { createMcpHandler } from '@modelcontextprotocol/server'
import bundle from 'my-cards/cards.json' // bundled at build time
import { createServer } from './createServer'

const handler = createMcpHandler(() => createServer(bundle))

export default {
  fetch(request: Request) {
    const url = new URL(request.url)
    return url.pathname === '/mcp' ? handler.fetch(request) : new Response('Not found', { status: 404 })
  },
}
// Hono: app.all('/mcp', c => handler.fetch(c.req.raw))
```

## 4. Reading `cards.json`

| Runtime | How |
| --- | --- |
| Node (tsx, plain ESM) | `JSON.parse(readFileSync(new URL('../dist/cards.json', import.meta.url), 'utf8'))` — see `examples/demo-cards/src/server/bundle.ts`, which returns `null` (text-only mode) when the file is missing. |
| Node ESM import | `import bundle from 'my-cards/cards.json' with { type: 'json' }` |
| TypeScript `tsc` build | `resolveJsonModule: true` and a static import; `tsc` copies the JSON next to the output. |
| Bundlers (Vite, esbuild, Wrangler) | `import bundle from 'my-cards/cards.json'` |
| Browser (in-page server) | Same import; see `playground/src/project.ts`. |

`asCardBundle(value)` (also used by the kit) accepts the parsed JSON and returns `null` for an empty or malformed one, so a checkout without a build still starts.

## 5. Native cards in a Nuxt 4 app

Your Nuxt app already uses Nuxt UI; the cards render with **your** theme and plugins. No iframe.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // The cards' <UCard>/<UButton> are resolved by Nuxt's auto-import transform; it skips node_modules
  // unless the package is transpiled. (Or import components explicitly: import UCard from '@nuxt/ui/components/Card.vue'.)
  build: { transpile: ['my-cards'] },
})
```

```css
/* assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
@source "../../node_modules/my-cards/src/cards"; /* let Tailwind see the cards' classes */
```

```vue
<!-- components/ToolCard.client.vue -->
<script setup lang="ts">
import { McpCard, type CallToolResult, type CardAction } from '@vue-mcp-apps/view'
import { cards } from 'my-cards/manifest'
import { components } from 'my-cards/components'

const props = defineProps<{ result: CallToolResult }>()
const emit = defineEmits<{ message: [text: string]; context: [text: string] }>()
const toast = useToast()
const mcp = useMcpClient() // yours: wraps an MCP Client from @modelcontextprotocol/client

async function callTool(name: string, args: Record<string, unknown>) {
  return await mcp.callTool({ name, arguments: args }) // your server re-checks visibility and auth
}

function onAction(action: CardAction) {
  if (action.kind === 'notify') toast.add({ title: action.message })
  if (action.kind === 'message') emit('message', action.text)   // → send as the user's next chat message
  if (action.kind === 'context') emit('context', action.text)   // → add to the model's next prompt
}

const colorMode = useColorMode()
const hostContext = computed(() => ({ theme: colorMode.value === 'dark' ? 'dark' : 'light', locale: 'en-US' }) as const)
</script>

<template>
  <McpCard
    :manifest="cards"
    :components="components"
    :result="props.result"
    :host-context="hostContext"
    :call-tool="callTool"
    @action="onAction"
  />
</template>
```

`<McpCard>` props: `manifest`, `components`, `result` (a tool result with `structuredContent.card`) **or** `card` (`{ name, props }`), `hostContext`, `callTool`, `handleLinks` (default `true`: open http(s) links in a new tab), `showStatus` (default `true`). Events: `action`, `result`, `error`. `hostContext` feeds `useCardHost()` inside the card; page styling is yours.

Server-side rendering: cards are interactive widgets; render them client-only (`.client.vue`) unless you have checked every card for SSR safety.

## 6. Native cards in a plain Vue + Vite app

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

export default defineConfig({
  plugins: [vue(), ui({ scanPackages: ['my-cards'] })], // resolve Nuxt UI components inside the cards package
})
```

```ts
// main.ts
import './style.css' // @import "tailwindcss"; @import "@nuxt/ui"; @source "../node_modules/my-cards/src/cards";
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'

createApp(App).use(createRouter({ history: createWebHistory(), routes: [] })).use(ui).mount('#app')
```

Then use `<McpCard>` as in section 5 (wrap in `<UApp>` for toasts and overlays).

## 7. Your own chat UI

A chat that talks to MCP servers meets two kinds of cards:

1. **Cards you ship** (you have their components): render natively with `<McpCard>`. Wire `call-tool` to your MCP client, turn `message` actions into user turns and `context` actions into notes for the next prompt. This is what Facturador's chat does.
2. **Cards from other servers** (only a `ui://` template): be an MCP Apps host.
   - Copy `playground/public/sandbox.html` (dependency-free) and serve it from **another origin** (a sub-domain, or an opaque `sandbox="allow-scripts allow-forms"` frame when you only have one origin).
   - Use `AppBridge` + `PostMessageTransport` from `@modelcontextprotocol/ext-apps/app-bridge`; `playground/src/lib/sandboxHost.ts` is a complete reference: handlers for `oncalltool` (with the visibility check), `onopenlink`, `onmessage`, `onupdatemodelcontext`, `onrequestdisplaymode`, `onsizechange`, `onreadresource`, plus message logging.
   - Send plain JSON only (clone reactive state before `sendToolResult` / `setHostContext`).

Decide per tool: `resultCard(result)` returns the card if the result carries one; `getToolUiResourceUri(tool)` (ext-apps) or `tool._meta.ui.resourceUri` tells you whether a template exists.

## 8. Connecting real hosts

**Claude Desktop** — `claude_desktop_config.json` (Settings → Developer → Edit config):

```json
{
  "mcpServers": {
    "shop": { "command": "node", "args": ["C:/path/to/server/stdio.js"] }
  }
}
```

With TypeScript sources: `"command": "npx", "args": ["tsx", "C:/path/to/server/stdio.ts"]`.

**VS Code ≥ 1.109** — `.vscode/mcp.json`:

```json
{
  "servers": {
    "shop": { "type": "stdio", "command": "node", "args": ["${workspaceFolder}/server/stdio.js"] }
  }
}
```

or `{ "type": "http", "url": "http://localhost:3001/mcp" }`.

**claude.ai** — Settings → Connectors → *Add custom connector*, URL `https://your-host/mcp`. For local testing expose `http://localhost:3001` through a tunnel (`cloudflared tunnel --url http://localhost:3001`).

**Goose, MCPJam, Postman, the MCP Inspector** — point them at the stdio command or the HTTP URL. The Inspector: `npx @modelcontextprotocol/inspector node server/stdio.js` → *Apps* tab.

## 9. Keeping the bundle fresh in CI

If you commit `cards.json` (so the server needs no build step), add the freshness test from `examples/demo-cards/test/bundle.test.ts`:

```ts
import { sourceHash } from '@vue-mcp-apps/vite'
const bundle = JSON.parse(readFileSync('dist/cards.json', 'utf8'))
expect(sourceHash(ROOT, bundle.sources, bundle.versions)).toBe(bundle.sourceHash)
```

It hashes the sources (CRLF-normalised) plus the key dependency versions, so CI fails when someone edits a card and forgets `npm run build:cards` — without rebuilding minified output byte for byte. If you do **not** commit it, build it in CI before starting or packaging the server (`npm run build:cards`).

## 10. Using the playground with your cards

Edit `playground/src/project.ts` — the only file that names the project under test:

```ts
import { cards } from 'my-cards/manifest'
import { components } from 'my-cards/components'
import { createServer } from 'my-server/createServer'
import bundle from 'my-cards/cards.json'

export const project: PlaygroundProject = {
  name: 'my-cards',
  manifest: cards,
  components,
  createServer: b => createServer(b) as never, // omit to use only Remote mode
  bundle,
  remoteUrl: 'http://localhost:3001/mcp',
  examples: [{ label: 'Order A-1001', tool: 'show_order', args: { id: 'A-1001' } }],
}
```

and point `onBundleUpdate` at your `cards.json` specifier for hot reload. Add your cards' folder to `playground/src/style.css` (`@source`). For the AI demo, the assistant uses whatever model-visible tools your server lists. See [PLAYGROUND.md](PLAYGROUND.md) and [AI_DEMO.md](AI_DEMO.md).

## 11. Migrating a hand-rolled card system

vue-mcp-apps was extracted from Facturador / Hotelier Tools. If your project has a similar system:

| Before | After | Notes |
| --- | --- | --- |
| `CARD_ACTIONS` (`web/lib/card-host.ts`) | `defineCards({ name: { title, actions } })` | Same idea: event → `tool` / `link` / `notify`; adds `message` and `context`. Payload is now the **first** argument (Facturador used `emit(evt, tool, params)` → `args[1]`). |
| `mountCard(container, tag, props, onAction)` | `<McpCard>` / `CardRenderer` | Vue components, not custom elements; props are real props, not attributes. |
| `web/lib/mcp-app/bridge.ts` | `McpAppBridge` | Same spec messages + `ui/message`, `requestDisplayMode`, `readResource`, `tool-input-partial`, request timeouts. |
| `web/lib/mcp-app/main.ts` | `startMcpApp` | Same flow; host context and theme applied for you. |
| `build-plugin.ts` + `vite.mcp-app.config.ts` → `api/mcp-app/card-app.json` | `defineCardBundleConfig` → `cards.json` (`cards` instead of `tags`, plus `css`, `versions`) | CSS is one compiled stylesheet instead of per-component shadow CSS. |
| `api/mcp-apps.ts` (`registerCardAppResources`, `cardToolMeta`, `adaptCardResult`) | `createCardServerKit` (`registerResources`, `registerTool`, `result`) | Results carry the card directly in `structuredContent`; no adapter pass. |
| `structuredContent.card = { tag, props }`, `ui://remote-component/<tag>` | `structuredContent.card = { name, props }`, `ui://cards/<name>` | Keep old URIs with `uriPrefix: 'ui://remote-component/'`. |
| `mcpAppBundle.test.ts` | `sourceHash` test | Same technique. |

Steps:

1. Move the actions table into `defineCards`, keeping the event and tool names.
2. Convert `.ce.vue` cards to regular SFCs: `defineProps`/`defineEmits`, drop attribute string parsing (`Array | String` props) and shadow-DOM styles; change `emit('approved', tool, params)` to `emit('approved', params)`.
3. Build with `@vue-mcp-apps/vite`; delete the old build plugin.
4. Replace the server's template registration with the kit; replace `adaptCardResult` with `kit.result`.
5. In the app's chat, replace the custom-element mount with `<McpCard>`; keep the server-side allowlist (the kit's `cardTools(manifest)` from core lists every tool a card may call).
6. Run the old and new cards side by side in the workbench (`project.ts`) until they match, then remove the old code.

## 12. Checklist

- [ ] Manifest names are kebab-case; every event the card emits is listed; `tool` actions name real tools.
- [ ] Card-only tools have `visibility: ['app']`.
- [ ] `cards: Object.keys(manifest)` in the bundle config; `cards.json` rebuilt (or built in CI).
- [ ] No secrets in props; links are http(s); no dynamic `import()` in cards.
- [ ] Icons bundled (`icon.clientBundle.scan`), `colorMode: false`, `router: false`.
- [ ] CORS allowlist on HTTP servers used by browser hosts.
- [ ] Workbench: fixture renders in both panes; clicks work in both; Protocol tab shows `tools/call allowed`.
- [ ] Official Inspector `--app-info` reports `hasApp: true` for card tools.
