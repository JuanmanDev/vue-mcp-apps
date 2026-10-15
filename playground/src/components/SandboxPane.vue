<script setup lang="ts">
/**
 * Layers 1 → 2 → 3 — the card as an MCP App: this page (host) frames the
 * sandbox proxy (another origin), which frames the view (the card bundle's
 * template, read from the server as `ui://…`). Driven by the official
 * `AppBridge` (lib/sandboxHost.ts).
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { AppViewHost } from '../lib/sandboxHost'
import { activeView, hostContext, pendingTemplate } from '../lib/workbench'
import { log, state } from '../lib/store'

const container = ref<HTMLElement | null>(null)
const fullscreen = ref(false)
const height = ref(0)

async function recreate() {
  const previous = activeView.value
  activeView.value = null
  if (previous) await previous.destroy()
  height.value = 0
  const template = pendingTemplate.value
  if (!template || !container.value) return
  const view = new AppViewHost(container.value, {
    html: template.html,
    meta: template.meta,
    hostContext: hostContext(),
    onSize: h => { height.value = Math.ceil(h) },
    onDisplayMode: (mode) => {
      fullscreen.value = mode === 'fullscreen'
      log({ direction: 'policy', layer: 'host', method: 'display mode', summary: `granted ${mode}`, data: { mode }, tone: 'info' })
    },
  })
  activeView.value = view
  await view.start()
}

watch(() => state.run.viewKey, () => { void recreate() })
watch(() => state.host.displayMode, (mode) => { fullscreen.value = mode === 'fullscreen' })
onBeforeUnmount(() => { void activeView.value?.destroy() })

async function teardown() {
  await activeView.value?.teardown()
}
async function cancel() {
  await activeView.value?.bridge?.sendToolCancelled({ reason: 'Cancelled from the playground' })
}
</script>

<template>
  <div :class="fullscreen ? 'fixed inset-4 z-50 shadow-2xl' : ''">
    <UCard :ui="{ header: 'px-3 py-2 sm:px-3', body: 'p-3 sm:p-3' }" :class="fullscreen ? 'h-full overflow-auto' : ''">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-shield-check" class="size-4 text-info" />
          <p class="text-sm font-semibold">MCP App</p>
          <span class="text-xs text-muted truncate">host → sandbox proxy → view</span>
          <div class="ms-auto flex items-center gap-1">
            <UBadge v-if="height" color="neutral" variant="outline" size="sm" class="tabular-nums">{{ height }}px</UBadge>
            <UTooltip text="ui/notifications/tool-cancelled">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-circle-slash" :disabled="!activeView" aria-label="Cancel tool" @click="cancel" />
            </UTooltip>
            <UTooltip text="ui/resource-teardown">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-power" :disabled="!activeView" aria-label="Teardown view" @click="teardown" />
            </UTooltip>
            <UTooltip v-if="fullscreen" text="Back to inline">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-minimize-2" aria-label="Exit fullscreen" @click="fullscreen = false; state.host.displayMode = 'inline'" />
            </UTooltip>
          </div>
        </div>
      </template>
      <div ref="container" class="rounded-md" />
      <p v-if="!pendingTemplate" class="text-sm text-muted">
        {{ state.run.result ? 'This result has no ui:// template — a host would show the text only.' : 'The same card appears here inside two iframes, exactly as Claude or VS Code would draw it.' }}
      </p>
    </UCard>
  </div>
</template>
