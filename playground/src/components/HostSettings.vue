<script setup lang="ts">
import { watch } from 'vue'
import { activeView, hostContext, reloadView, STYLE_PRESETS } from '../lib/workbench'
import { state } from '../lib/store'

const locales = ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-PT', 'ja-JP']
const presets = Object.entries(STYLE_PRESETS).map(([value, p]) => ({ label: p.label, value }))

// Every change goes to the view as `ui/notifications/host-context-changed` (only the changed fields).
watch(
  () => [state.host.theme, state.host.locale, state.host.stylePreset, state.host.displayMode],
  () => { void activeView.value?.setHostContext(hostContext()) },
)
// These change how the view is FRAMED: re-create it.
watch(() => [state.host.proxyOrigin, state.host.viewSandbox], () => { void reloadView() })
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-3 space-y-3' }">
    <div>
      <p class="text-sm font-semibold">Host</p>
      <p class="text-xs text-muted">What the host tells the view (<code>hostContext</code>) and how it frames it.</p>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <UFormField label="Theme" size="xs">
        <USelect v-model="state.host.theme" :items="['light', 'dark']" size="sm" class="w-full" />
      </UFormField>
      <UFormField label="Locale" size="xs">
        <USelect v-model="state.host.locale" :items="locales" size="sm" class="w-full" />
      </UFormField>
      <UFormField label="Host styles" size="xs" class="col-span-2" help="Sent as style variables; mapped onto Nuxt UI tokens.">
        <USelect v-model="state.host.stylePreset" :items="presets" size="sm" class="w-full" />
      </UFormField>
      <UFormField label="Display mode" size="xs">
        <USelect v-model="state.host.displayMode" :items="['inline', 'fullscreen']" size="sm" class="w-full" />
      </UFormField>
      <UFormField label="Proxy origin" size="xs">
        <USelect v-model="state.host.proxyOrigin" :items="[{ label: 'auto', value: 'auto' }, { label: 'cross-origin', value: 'cross-origin' }, { label: 'opaque', value: 'opaque' }]" size="sm" class="w-full" />
      </UFormField>
      <UFormField label="View sandbox" size="xs" class="col-span-2">
        <USelect
          v-model="state.host.viewSandbox"
          :items="[{ label: 'standard — allow-scripts allow-same-origin allow-forms', value: 'standard' }, { label: 'strict — allow-scripts allow-forms (no storage)', value: 'strict' }]"
          size="sm"
          class="w-full"
        />
      </UFormField>
    </div>
    <USwitch v-model="state.host.streamInput" label="Stream tool input (tool-input-partial)" size="sm" />
    <USwitch v-model="state.host.autoApproveAppCalls" label="Auto-approve tool calls from cards" size="sm" />
  </UCard>
</template>
