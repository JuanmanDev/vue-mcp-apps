/**
 * `<McpCard>` — a card mounted NATIVELY in your own Vue app: no iframe, no
 * bundle, your plugins (Nuxt UI, i18n, Pinia…) and your styles apply.
 *
 *   <McpCard :manifest="cards" :components="components" :result="toolResult"
 *            :call-tool="(name, args) => mcpClient.callTool({ name, arguments: args })"
 *            @action="onAction" />
 *
 * Give it a tool result (`structuredContent.card`) or a `{ name, props }` card.
 * Every listed card event comes out as `action` (`CardAction`). When `callTool`
 * is given, tool actions run through it and a result that carries another card
 * swaps it in — the same behaviour as the MCP App shell. Links open in a new tab
 * unless you set `handle-links` to false. Nothing else is done for you: a notice,
 * a message to the model or a context update is the host's call.
 */
import { computed, defineComponent, h, ref, watch, type PropType } from 'vue'
import { resultCard, resultText, type CallToolResult, type CardAction, type CardManifest, type CardPayload, type HostContext } from '@vue-mcp-apps/core'
import { CardRenderer, type CardComponents } from './renderer.js'
import { createCardHostRefs, provideCardHost } from './context.js'

export const McpCard = defineComponent({
  name: 'McpCard',
  props: {
    manifest: { type: Object as PropType<CardManifest>, required: true },
    components: { type: Object as PropType<CardComponents>, required: true },
    /** A tool result carrying `structuredContent.card`. */
    result: { type: Object as PropType<CallToolResult | null>, default: null },
    /** Or the card itself. Wins over `result`. */
    card: { type: Object as PropType<CardPayload | null>, default: null },
    hostContext: { type: Object as PropType<HostContext>, default: () => ({}) },
    callTool: { type: Function as PropType<(name: string, args: Record<string, unknown>) => Promise<CallToolResult>>, default: undefined },
    handleLinks: { type: Boolean, default: true },
    /** Show a one-line status under the card (tool running, its answer, notices). */
    showStatus: { type: Boolean, default: true },
  },
  emits: {
    action: (_action: CardAction) => true,
    result: (_payload: { action: CardAction; result: CallToolResult }) => true,
    error: (_payload: { action: CardAction; error: unknown }) => true,
  },
  setup(props, { emit }) {
    const refs = createCardHostRefs('native', props.hostContext)
    provideCardHost(refs)
    watch(() => props.hostContext, value => { refs.hostContext.value = value ?? {} }, { deep: true })

    const given = computed<CardPayload | null>(() => props.card ?? resultCard(props.result))
    const swapped = ref<CardPayload | null>(null)
    watch(given, () => { swapped.value = null })
    const current = computed(() => swapped.value ?? given.value)
    const status = ref('')

    async function onAction(action: CardAction) {
      emit('action', action)
      switch (action.kind) {
        case 'link':
          if (props.handleLinks) window.open(action.url, '_blank', 'noopener,noreferrer')
          return
        case 'notify':
          status.value = action.message
          return
        case 'tool': {
          if (!props.callTool) return
          refs.busy.value = true
          status.value = '…'
          try {
            const result = await props.callTool(action.tool, action.args)
            const next = resultCard(result)
            if (!result.isError && next && props.manifest[next.name]) {
              swapped.value = next
              status.value = ''
            } else {
              status.value = resultText(result) || (result.isError ? 'Failed.' : 'Done.')
            }
            emit('result', { action, result })
          } catch (error) {
            status.value = error instanceof Error ? error.message : String(error)
            emit('error', { action, error })
          } finally {
            refs.busy.value = false
          }
          return
        }
        default:
      }
    }

    return () => h('div', { class: 'vma-card', 'data-mode': 'native' }, [
      current.value
        ? h(CardRenderer, {
            manifest: props.manifest,
            components: props.components,
            name: current.value.name,
            cardProps: current.value.props,
            onAction,
          })
        : h('p', { class: 'vma-empty' }, 'No card.'),
      props.showStatus && status.value
        ? h('p', { class: 'vma-status', role: 'status', style: 'margin:6px 2px 0;font-size:13px;opacity:.8;white-space:pre-wrap' }, status.value)
        : null,
    ])
  },
})
