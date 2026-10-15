/**
 * `startMcpApp` — the runtime of a card template inside an MCP Apps host's
 * sandboxed iframe.
 *
 * Flow: handshake (`ui/initialize`) → apply the host context (theme, locale,
 * style variables) → wait for the tool result → draw the card it carries in
 * `structuredContent.card` (or, for a result without one, the template's own
 * card with `structuredContent` as its props) → turn the card's events into
 * `tools/call` (proxied by the host to your server), `ui/open-link`,
 * `ui/message`, `ui/update-model-context` or a line under the card. A tool call
 * that answers with another card swaps it in. The view reports its size on
 * every change (`ui/notifications/size-changed`).
 *
 * The card components are your plain `.vue` files — Nuxt UI or any other
 * library works, because the iframe is a whole document of its own: install the
 * plugin in `install(app)` and let the build inline the CSS.
 */
import { createApp, defineComponent, h, ref, type App, type Ref } from 'vue'
import {
  plainObject,
  resultCard,
  resultText,
  type CallToolResult,
  type CardAction,
  type CardManifest,
  type CardPayload,
  type DisplayMode,
  type HostContext,
} from '@vue-mcp-apps/core'
import { McpAppBridge } from './bridge.js'
import { CardRenderer, type CardComponents } from './renderer.js'
import { createCardHostRefs, provideCardHost } from './context.js'
import { applyHostContext, NUXT_UI_TOKENS } from './theme.js'

export interface ShellStrings {
  loading: string
  working: string
  done: string
  failed: string
  cancelled: string
  noCard: string
}

const STRINGS: Record<string, ShellStrings> = {
  en: { loading: 'Loading…', working: 'Working…', done: 'Done.', failed: 'Did not work:', cancelled: 'Cancelled.', noCard: 'Nothing to show.' },
  es: { loading: 'Cargando…', working: 'Procesando…', done: 'Hecho.', failed: 'No ha funcionado:', cancelled: 'Cancelado.', noCard: 'Nada que mostrar.' },
  fr: { loading: 'Chargement…', working: 'En cours…', done: 'Terminé.', failed: 'Échec :', cancelled: 'Annulé.', noCard: 'Rien à afficher.' },
  de: { loading: 'Wird geladen…', working: 'Wird ausgeführt…', done: 'Erledigt.', failed: 'Fehlgeschlagen:', cancelled: 'Abgebrochen.', noCard: 'Nichts anzuzeigen.' },
  it: { loading: 'Caricamento…', working: 'In corso…', done: 'Fatto.', failed: 'Non riuscito:', cancelled: 'Annullato.', noCard: 'Niente da mostrare.' },
  pt: { loading: 'A carregar…', working: 'A processar…', done: 'Feito.', failed: 'Não funcionou:', cancelled: 'Cancelado.', noCard: 'Nada para mostrar.' },
}

export function shellStrings(locale: string | undefined, overrides?: Record<string, Partial<ShellStrings>>): ShellStrings {
  const lang = (locale ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en'
  return { ...STRINGS.en!, ...(STRINGS[lang] ?? {}), ...(overrides?.[lang] ?? {}) }
}

export interface StartMcpAppOptions {
  manifest: CardManifest
  components: CardComponents
  /** Install plugins on the Vue app — `app.use(ui)` for Nuxt UI, i18n, Pinia… */
  install?: (app: App) => void
  appInfo?: { name: string; version: string }
  /** The element to mount into. Default: `[data-mcp-card]`, then `#app`. */
  root?: string | HTMLElement
  /** The card this template is for. Default: the root's `data-mcp-card` attribute. */
  card?: string
  /** Host style variable → your design token. Default `NUXT_UI_TOKENS`; `{}` to set only the spec's variables. */
  tokens?: Readonly<Record<string, string>>
  /** Per-language overrides of the shell's few words. */
  strings?: Record<string, Partial<ShellStrings>>
  displayModes?: DisplayMode[]
  /** Hand the model a line after each tool click (`ui/update-model-context`). Default true. */
  reportClicksToModel?: boolean
}

export interface McpAppHandle {
  bridge: McpAppBridge
  app: App
  /** The card on screen, reactive. */
  card: Ref<CardPayload | null>
  unmount(): void
}

const MAX_CONTEXT_TEXT = 4000

function resolveRoot(root: StartMcpAppOptions['root']): HTMLElement {
  if (root instanceof HTMLElement) return root
  const found = typeof root === 'string'
    ? document.querySelector<HTMLElement>(root)
    : document.querySelector<HTMLElement>('[data-mcp-card]') ?? document.getElementById('app')
  if (!found) throw new Error('startMcpApp: no root element (add <div data-mcp-card="your-card"></div>)')
  return found
}

export async function startMcpApp(options: StartMcpAppOptions): Promise<McpAppHandle> {
  const { manifest, components } = options
  const rootElement = resolveRoot(options.root)
  const templateCard = options.card ?? rootElement.dataset.mcpCard ?? rootElement.dataset.card ?? ''
  const tokens = options.tokens ?? NUXT_UI_TOKENS

  const refs = createCardHostRefs('mcp-app')
  const card = ref<CardPayload | null>(null) as Ref<CardPayload | null>
  const status = ref('')
  const S = () => shellStrings(refs.hostContext.value.locale, options.strings)
  status.value = S().loading

  const show = (next: CardPayload) => {
    card.value = next
    status.value = ''
  }

  /** The card a result asks for, or null. A template draws its own card; a click may swap in any card it ships. */
  const cardFrom = (result: CallToolResult, initial: boolean): CardPayload | null => {
    const carried = resultCard(result)
    if (carried) return components[carried.name] && manifest[carried.name] && (!initial || !templateCard || carried.name === templateCard) ? carried : null
    if (initial && templateCard && plainObject(result.structuredContent)) return { name: templateCard, props: result.structuredContent }
    return null
  }

  const bridge = new McpAppBridge({
    onToolInput(args) {
      refs.toolInput.value = args
      refs.streaming.value = false
    },
    onToolInputPartial(args) {
      refs.toolInput.value = args
      refs.streaming.value = true
    },
    onToolResult(result) {
      refs.streaming.value = false
      const next = cardFrom(result, true)
      if (next && !result.isError) show(next)
      else status.value = result.isError ? `${S().failed} ${resultText(result)}` : (resultText(result) || S().noCard)
    },
    onToolCancelled() {
      refs.streaming.value = false
      if (!card.value) status.value = S().cancelled
    },
    onHostContextChanged(context) {
      refs.hostContext.value = { ...context }
      applyHostContext(context, tokens)
    },
    onTeardown() {
      card.value = null
    },
  }, { availableDisplayModes: options.displayModes })

  async function onAction(action: CardAction): Promise<void> {
    switch (action.kind) {
      case 'link':
        try {
          await bridge.openLink(action.url)
        } catch {
          window.open(action.url, '_blank', 'noopener,noreferrer')
        }
        return
      case 'notify':
        status.value = action.message
        return
      case 'message':
        try {
          await bridge.sendMessage(action.text)
        } catch (error) {
          status.value = `${S().failed} ${error instanceof Error ? error.message : String(error)}`
        }
        return
      case 'context':
        bridge.updateModelContext(action.text).catch(() => { /* a host may refuse */ })
        return
      case 'tool': {
        refs.busy.value = true
        status.value = S().working
        let result: CallToolResult
        try {
          result = await bridge.callTool(action.tool, action.args)
        } catch (error) {
          status.value = `${S().failed} ${error instanceof Error ? error.message : String(error)}`
          return
        } finally {
          refs.busy.value = false
        }
        const text = resultText(result)
        const next = cardFrom(result, false)
        if (!result.isError && next) show(next)
        else status.value = result.isError ? `${S().failed} ${text}` : (text ? `${S().done} ${text}` : S().done)
        if (options.reportClicksToModel !== false && bridge.hostCapabilities.updateModelContext) {
          const summary = `The user clicked "${action.event}" on the card, which ran ${action.tool}${result.isError ? ' and failed' : ''}: ${text}`
          bridge.updateModelContext(summary.slice(0, MAX_CONTEXT_TEXT)).catch(() => { /* the card already says it */ })
        }
        return
      }
    }
  }

  const Shell = defineComponent({
    name: 'McpAppShell',
    setup() {
      provideCardHost(refs)
      return () => h('div', { class: 'vma-shell', 'data-mode': 'mcp-app' }, [
        card.value
          ? h(CardRenderer, { manifest, components, name: card.value.name, cardProps: card.value.props, onAction })
          : null,
        status.value
          ? h('p', { class: 'vma-status', role: 'status', style: 'margin:6px 2px 0;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;opacity:.8;white-space:pre-wrap' }, status.value)
          : null,
      ])
    },
  })

  const app = createApp(Shell)
  app.config.errorHandler = (err, _vm, info) => {
    console.error('[vue-mcp-apps] card error:', err, info)
    bridge.log('error', { message: err instanceof Error ? err.message : String(err), info })
  }
  options.install?.(app)
  app.mount(rootElement)

  // Size: the body, not the document — the document is at least as tall as the
  // frame the host gave us, so it could only ever grow.
  let lastSize = ''
  const measure = () => {
    const rect = document.body.getBoundingClientRect()
    const width = Math.ceil(rect.width)
    const height = Math.ceil(rect.height)
    if (`${width}x${height}` === lastSize) return
    lastSize = `${width}x${height}`
    bridge.sizeChanged(width, height)
  }

  const init = await bridge.connect(options.appInfo ?? { name: 'vue-mcp-apps', version: '0.1.0' })
  refs.hostContext.value = { ...(init?.hostContext ?? {}) }
  applyHostContext(refs.hostContext.value, tokens)
  if (!card.value) status.value = S().loading
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(document.body)
  measure()

  return {
    bridge,
    app,
    card,
    unmount() {
      app.unmount()
      bridge.close()
    },
  }
}
