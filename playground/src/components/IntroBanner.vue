<script setup lang="ts">
import { ref } from 'vue'
import { runTool } from '../lib/workbench'
import { state } from '../lib/store'

const KEY = 'vma:intro-dismissed'
function read(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
const dismissed = ref(read())
function dismiss() {
  dismissed.value = true
  try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
}

const steps = [
  { icon: 'i-lucide-component', title: 'One Vue component', text: 'A plain .vue file with Nuxt UI: props in, events out. No MCP code in it.' },
  { icon: 'i-lucide-layers', title: 'Two hosts', text: 'Mounted natively in your Vue app (left) and as a sandboxed MCP App, like Claude or VS Code draw it (right).' },
  { icon: 'i-lucide-shield-check', title: 'Actions are data', text: 'A button can only run the tool its manifest names. The host checks it again (visibility).' },
  { icon: 'i-lucide-arrow-left-right', title: 'Every message', text: 'The inspector shows each JSON-RPC message between host and view, and each host decision.' },
]
</script>

<template>
  <UCard v-if="!dismissed && !state.run.label" :ui="{ body: 'p-4 sm:p-4' }" class="bg-gradient-to-br from-primary/10 to-transparent">
    <div class="flex items-start gap-3">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-highlighted">Write MCP Apps as native Vue components — and watch them run in three layers.</p>
        <p class="text-sm text-muted mt-1">
          This page is an MCP Apps host. The demo MCP server runs <strong>in this tab</strong>; its card templates are drawn
          through a sandbox proxy on another origin, driven by the official <code>AppBridge</code>.
        </p>
      </div>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Dismiss" @click="dismiss" />
    </div>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-4">
      <div v-for="step in steps" :key="step.title" class="flex gap-2">
        <UIcon :name="step.icon" class="size-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-medium">{{ step.title }}</p>
          <p class="text-xs text-muted">{{ step.text }}</p>
        </div>
      </div>
    </div>
    <div class="flex flex-wrap gap-2 mt-4">
      <UButton size="sm" icon="i-lucide-play" :disabled="state.connection.status !== 'connected'" @click="runTool('get_weather', { city: 'Madrid' }, 'Weather in Madrid')">Try it: weather in Madrid</UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-check-check"
        :disabled="state.connection.status !== 'connected'"
        @click="runTool('propose_changes', { title: 'Update booking #4821', changes: [{ field: 'Check-in', from: '2026-11-02', to: '2026-11-03' }, { field: 'Guests', from: '2', to: '3' }] }, 'Propose booking changes')"
      >
        Human-in-the-loop approval
      </UButton>
    </div>
  </UCard>
</template>
