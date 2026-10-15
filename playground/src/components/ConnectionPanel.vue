<script setup lang="ts">
import { computed } from 'vue'
import { connect, disconnect } from '../lib/connection'
import { state } from '../lib/store'
import { project } from '../project'

const modes = computed(() => [
  ...(project.createServer ? [{ label: 'In-browser', value: 'browser', description: 'Your server code, in this tab' }] : []),
  { label: 'Remote', value: 'remote', description: 'Streamable HTTP' },
])

const statusColor = computed(() => ({ idle: 'neutral', connecting: 'warning', connected: 'success', error: 'error' } as const)[state.connection.status])
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-3 space-y-3' }">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold">MCP server</p>
      <UBadge :color="statusColor" variant="subtle" size="sm">{{ state.connection.status === 'connected' ? state.connection.serverName : state.connection.status }}</UBadge>
    </div>
    <URadioGroup v-model="state.connection.mode" :items="modes" orientation="horizontal" size="sm" variant="table" />
    <UInput v-if="state.connection.mode === 'remote'" v-model="state.connection.url" size="sm" class="w-full" placeholder="http://localhost:3001/mcp" icon="i-lucide-link" />
    <div class="flex gap-2">
      <UButton size="sm" icon="i-lucide-plug" :loading="state.connection.status === 'connecting'" block @click="connect()">
        {{ state.connection.status === 'connected' ? 'Reconnect' : 'Connect' }}
      </UButton>
      <UButton v-if="state.connection.status === 'connected'" size="sm" color="neutral" variant="outline" icon="i-lucide-unplug" aria-label="Disconnect" @click="disconnect()" />
    </div>
    <p v-if="state.connection.error" class="text-xs text-error break-words">{{ state.connection.error }}</p>
    <p v-if="state.connection.mode === 'remote'" class="text-xs text-muted">
      Run <code class="text-highlighted">npm run server:http</code> for the demo server, or point at your own (CORS must allow this page).
    </p>
  </UCard>
</template>
