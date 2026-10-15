<script setup lang="ts">
/**
 * One card in the AI chat — drawn the way a real host draws it: as an MCP App
 * through the three layers (host → sandbox proxy → view, official AppBridge),
 * or natively with <McpCard>. The card's `ui/message` becomes the next user
 * turn; its `ui/update-model-context` goes into the assistant's context.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { McpCard, type CardAction } from '@vue-mcp-apps/view'
import { AppViewHost } from '../../lib/sandboxHost'
import { callFromCard, hostContext, plain } from '../../lib/workbench'
import { state } from '../../lib/store'
import { project } from '../../project'
import { addModelContext, chat, send, type ChatCard } from '../../ai/agent'

const props = defineProps<{ card: ChatCard }>()

const container = ref<HTMLElement | null>(null)
const height = ref(0)
const ready = ref(false)
let view: AppViewHost | null = null

const native = computed(() => chat.render === 'native' || !props.card.template)
const cardName = computed(() => (props.card.result.structuredContent as { card?: { name?: string } } | undefined)?.card?.name ?? '')

async function mountSandbox() {
  if (!container.value || !props.card.template) return
  view = new AppViewHost(container.value, {
    html: props.card.template.html,
    meta: props.card.template.meta,
    hostContext: hostContext(),
    onSize: h => { height.value = Math.ceil(h) },
    onMessage: text => { void send(text, { fromCard: true }) },
    onModelContext: text => addModelContext(text),
  })
  await view.start()
  await view.whenReady()
  ready.value = true
  await view.bridge?.sendToolInput({ arguments: plain(props.card.args) })
  await view.bridge?.sendToolResult(plain(props.card.result) as never)
}

async function unmountSandbox() {
  ready.value = false
  await view?.destroy()
  view = null
}

onMounted(() => { if (!native.value) void mountSandbox() })
onBeforeUnmount(() => { void unmountSandbox() })
watch(native, async (isNative) => {
  if (isNative) await unmountSandbox()
  else {
    await new Promise(r => setTimeout(r, 0))
    await mountSandbox()
  }
})
watch(() => [state.host.theme, state.host.locale, state.host.stylePreset], () => { void view?.setHostContext(hostContext()) })

function onNativeAction(action: CardAction) {
  if (action.kind === 'message') void send(action.text, { fromCard: true })
  if (action.kind === 'context') addModelContext(action.text)
}
</script>

<template>
  <div class="w-full max-w-xl">
    <div class="flex items-center gap-1.5 mb-1 text-[11px] text-muted">
      <UIcon :name="native ? 'i-lucide-component' : 'i-lucide-shield-check'" class="size-3.5" :class="native ? 'text-success' : 'text-info'" />
      <span class="font-mono">{{ card.tool }}</span>
      <span>→</span>
      <span class="font-mono">{{ cardName || 'text' }}</span>
      <span class="ms-1">{{ native ? '· native McpCard (no iframe)' : `· MCP App ${card.uri}` }}</span>
      <span v-if="!native && height" class="ms-auto tabular-nums">{{ height }}px</span>
    </div>
    <McpCard
      v-if="native && cardName"
      :manifest="project.manifest"
      :components="project.components"
      :result="card.result"
      :host-context="hostContext()"
      :call-tool="callFromCard"
      @action="onNativeAction"
    />
    <div v-else-if="!native" ref="container" class="rounded-lg" :class="ready ? '' : 'min-h-24 animate-pulse bg-elevated/50'" />
    <p v-else class="text-sm text-muted">This tool returned no card.</p>
  </div>
</template>
