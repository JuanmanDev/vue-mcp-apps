<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useColorMode } from '@vueuse/core'
import AppHeader from './components/AppHeader.vue'
import { connect } from './lib/connection'
import { state } from './lib/store'

// One theme switch drives both the playground page and `hostContext.theme`.
const mode = useColorMode()
state.host.theme = mode.value === 'dark' ? 'dark' : 'light'
watch(() => state.host.theme, theme => { mode.value = theme })

onMounted(() => {
  if (state.connection.mode === 'browser') void connect()
})
</script>

<template>
  <UApp :tooltip="{ delayDuration: 200 }">
    <div class="min-h-full flex flex-col" :data-mcp-status="state.connection.status">
      <AppHeader />
      <RouterView v-slot="{ Component }">
        <!-- Kept alive: switching pages must not tear down live MCP App views. -->
        <KeepAlive>
          <component :is="Component" class="flex-1" />
        </KeepAlive>
      </RouterView>
    </div>
  </UApp>
</template>
