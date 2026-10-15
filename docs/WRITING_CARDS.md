# Writing cards

A card is a Vue single-file component that:

- **takes props** (its data),
- **emits events** (what the person did),
- **knows nothing about MCP.**

What those events *mean* lives in the manifest. The same file runs inside Claude, VS Code or any MCP Apps host, and natively in your own Vue app.

## Step by step

### 1. Add the card to the manifest

```ts
// src/manifest.ts
export const cards = defineCards({
  'invoice-card': {
    title: 'Invoice',                                   // shown to hosts and in the playground
    description: 'An invoice the user can send or download.',
    actions: {
      sent:       { kind: 'tool', tool: 'send_invoice' },  // the button can only ever run send_invoice
      downloaded: { kind: 'link' },                        // http(s) URL
      questioned: { kind: 'message' },                     // a user message to the chat
    },
    fixtures: {
      draft: { number: 'F-2026-0042', total: 240, currency: 'EUR', status: 'draft' },
    },
  },
})
```

Rules for names:

- Card names are kebab-case with at least one dash (`invoice-card`).
- Event names are the names your component emits (`sent` → `emit('sent', …)`).

### 2. Write the component

```vue
<!-- src/cards/InvoiceCard.vue -->
<script setup lang="ts">
import { useCardHost } from '@vue-mcp-apps/view'

const props = defineProps<{ number: string; total: number; currency: string; status: 'draft' | 'sent'; pdfUrl?: string }>()
const emit = defineEmits<{
  sent: [args: { number: string }]
  downloaded: [url: string]
  questioned: [text: string]
}>()
const host = useCardHost()
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between">
      <p class="font-semibold">{{ number }}</p>
      <UBadge :color="status === 'sent' ? 'success' : 'warning'" variant="subtle">{{ status }}</UBadge>
    </div>
    <p class="text-2xl font-bold my-3">{{ total }} {{ currency }}</p>
    <div class="flex gap-2">
      <UButton :loading="host.busy.value" :disabled="status === 'sent'" @click="emit('sent', { number })">Send</UButton>
      <UButton v-if="pdfUrl" variant="outline" icon="i-lucide-download" @click="emit('downloaded', pdfUrl)">PDF</UButton>
      <UButton variant="ghost" @click="emit('questioned', `Why is ${number} ${total} ${currency}?`)">Ask</UButton>
    </div>
  </UCard>
</template>
```

### 3. Register the component

Add the card to both component maps:

```ts
// src/components.ts — used by the view bundle and by native hosts
export const components = { 'invoice-card': InvoiceCard, /* … */ }
```

### 4. Return it from a tool

```ts
kit.registerTool(server, 'show_invoice', { card: 'invoice-card', inputSchema: z.object({ number: z.string() }) },
  async ({ number }) => kit.result('invoice-card', await load(number), `Invoice ${number}: 240 EUR, draft.`))

kit.registerTool(server, 'send_invoice', { card: 'invoice-card', visibility: ['app'], inputSchema: z.object({ number: z.string() }) },
  async ({ number }) => kit.result('invoice-card', await send(number), `Sent invoice ${number}.`))
```

`send_invoice` answers with the same card in its new state. The view swaps it in, which is how a card shows "Sent ✓" after the click.

### 5. Build and try it

```bash
npm run dev     # rebuilds cards.json on save; open http://localhost:5173
```

Press the fixture button, edit the props live, then call the tool "as the model" and click through it in both panes.

## Rules

**Props in, events out.**

- A card never fetches, never calls a tool and never reads storage. Everything it shows arrives in props.
- Everything it wants arrives at the host as an event the manifest declared. This keeps cards trivially testable and is the security model.

**The first argument of an event is its payload:**

| Kind | First argument |
| --- | --- |
| `tool` | A plain object: the tool's arguments. |
| `link` | A URL string. |
| `notify` | A message string (optional; `fallback` otherwise). The second argument is optional data. |
| `message` / `context` | A text string. |

**Do not emit reactive state as it is.** Payloads are JSON-copied (`toPlain`) before they cross `postMessage`, so dates become strings and functions disappear. Emit plain data.

**Keep the manifest in sync.** An event the manifest does not list does nothing, silently. If a button "does nothing", check the event name first.

**`useCardHost()` is optional and read-only:**

| Field | Meaning |
| --- | --- |
| `mode` | `'native'` or `'mcp-app'`. |
| `busy` | True while one of this card's tool actions runs. Use it for `:loading`. |
| `hostContext` | Theme, locale, display mode, container size, style variables. |
| `toolInput` | The arguments the model called the tool with. |
| `streaming` | True while those arguments are still arriving (`tool-input-partial`). |

There is intentionally no `callTool` in it.

**Nuxt UI works as usual.**

- `UCard`, `UButton`, `UBadge`, `UCheckbox`, `UProgress`, `UAlert`… are auto-imported by `@nuxt/ui/vite`.
- Use semantic colours (`text-muted`, `bg-elevated`, `text-highlighted`), so host style variables mapped onto Nuxt UI tokens restyle the card.
- Icons must be bundled: `ui({ icon: { clientBundle: { scan: true } } })` plus the `@iconify-json/<set>` package. A template cannot fetch icons from the Iconify API.
- Overlays (`UModal`, `UPopover`) work inside the iframe, but the iframe is only as tall as the card. Prefer inline UI, or request `fullscreen`.

**Fixtures.** Give every card at least one fixture per state (empty, normal, done, error). They are the playground's presets and your tests' inputs.

**i18n.** `hostContext.locale` tells you the host's language (for example `es-ES`). Pick strings from it, or pass already-translated strings in props. The shell's own few words (Loading…, Done.) follow the locale; override them with `startMcpApp({ strings })`.

**Size is automatic.** The view reports its body size on every change. Do not set a fixed height, avoid `h-screen`, and let content define the height.

**Keep cards small and pure.**

- One card is one decision or one view of data.
- Big tables belong in a link to your app.
- Everything a card imports ends up in **every** template (one bundle), so watch heavy dependencies. The build reports the size.

**Never put secrets in props.** Props sit in the conversation and in the host's iframe. A one-time link is a secret: say it in text once, or keep it server-side.

## Testing a card

- **Unit:** mount it with `@vue/test-utils`, pass a fixture, click, and assert on `emitted()`. Outside a host, `useCardHost()` answers `native` with empty refs.
- **Contract:** `cardActionFor(cards, 'invoice-card', 'sent', [{ number: 'F-1' }])` should equal `{ kind: 'tool', tool: 'send_invoice', … }`.
- **Bundle freshness:** `examples/demo-cards/test/bundle.test.ts` recomputes `sourceHash` and fails when a card changed but `cards.json` was not rebuilt. Copy it into your own card package.
- **Three layers:** the playground, or Playwright through `frameLocator('iframe[title="Sandbox proxy"]').frameLocator('iframe[title="MCP App view"]')`.
- **Real hosts:** the MCP Inspector's Apps tab, ext-apps' basic-host, Claude Desktop or VS Code (see the README).
