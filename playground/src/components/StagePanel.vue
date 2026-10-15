<script setup lang="ts">
import { computed } from 'vue'
import NativePane from './NativePane.vue'
import SandboxPane from './SandboxPane.vue'
import LayerDiagram from './LayerDiagram.vue'
import IntroBanner from './IntroBanner.vue'
import { state } from '../lib/store'

const statusColor = computed(() => ({ idle: 'neutral', loading: 'warning', ready: 'success', error: 'error' } as const)[state.run.status])
</script>

<template>
  <div class="space-y-4">
    <IntroBanner />

    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-base font-semibold">{{ state.run.label || 'Pick an example, a tool or a fixture' }}</h1>
      <UBadge v-if="state.run.status !== 'idle'" :color="statusColor" variant="subtle" size="sm">{{ state.run.status }}</UBadge>
      <UBadge v-if="state.run.resourceUri" color="neutral" variant="outline" size="sm" class="font-mono">{{ state.run.resourceUri }}</UBadge>
      <p v-if="state.run.error" class="text-sm text-error w-full">{{ state.run.error }}</p>
    </div>

    <LayerDiagram />

    <div class="grid gap-4 xl:grid-cols-2">
      <NativePane />
      <SandboxPane />
    </div>
  </div>
</template>
