<script setup lang="ts">
import { computed } from 'vue'
import { state } from '../../lib/store'

const entries = computed(() => state.log
  .filter(e => e.method !== 'ui/notifications/size-changed' && e.method !== 'ping')
  .slice(-14)
  .reverse())

function arrow(direction: string) {
  return direction === 'host→view' ? '→' : direction === 'view→host' ? '←' : direction === 'policy' ? '⛨' : '•'
}
function tone(e: { direction: string; tone?: string }) {
  if (e.tone === 'error') return 'text-error'
  if (e.tone === 'warning') return 'text-warning'
  if (e.tone === 'success') return 'text-success'
  if (e.direction === 'host→view') return 'text-info'
  if (e.direction === 'view→host') return 'text-primary'
  return 'text-muted'
}
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-arrow-left-right" class="size-4 text-primary" />
        <p class="text-sm font-semibold">Live protocol</p>
        <RouterLink to="/workbench" class="ms-auto text-xs text-primary hover:underline">Full inspector →</RouterLink>
      </div>
    </template>
    <ol class="divide-y divide-default text-[11px] font-mono max-h-80 overflow-y-auto">
      <li v-for="e in entries" :key="e.n" class="px-3 py-1 flex gap-2 min-w-0">
        <span class="font-bold w-3 shrink-0" :class="tone(e)">{{ arrow(e.direction) }}</span>
        <span class="shrink-0" :class="tone(e)">{{ e.method }}</span>
        <span class="text-muted truncate">{{ e.summary }}</span>
      </li>
      <li v-if="!entries.length" class="px-3 py-4 text-center text-muted font-sans text-xs">JSON-RPC between the host and each card shows up here.</li>
    </ol>
  </UCard>
</template>
