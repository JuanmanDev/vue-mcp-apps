<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { state } from '../lib/store'

const REPO = 'https://github.com/JuanmanDev/vue-mcp-apps'
const route = useRoute()

const tabs = computed(() => [
  { label: 'AI demo', icon: 'i-lucide-bot', to: '/', active: route.path === '/' },
  { label: 'Workbench', icon: 'i-lucide-layers', to: '/workbench', active: route.path === '/workbench' },
])
</script>

<template>
  <header class="border-b border-default bg-default/80 backdrop-blur sticky top-0 z-30">
    <div class="flex items-center gap-3 px-4 h-14">
      <RouterLink to="/" class="flex items-center gap-2 min-w-0">
        <div class="size-7 rounded-md bg-primary text-inverted grid place-items-center font-bold text-sm">V</div>
        <div class="min-w-0 hidden sm:block">
          <p class="font-semibold leading-tight truncate">vue-mcp-apps</p>
          <p class="text-xs text-muted leading-tight truncate">MCP Apps as native Vue components</p>
        </div>
      </RouterLink>
      <nav class="flex items-center gap-1 ms-2" aria-label="Pages">
        <UButton
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          :icon="tab.icon"
          size="sm"
          :color="tab.active ? 'primary' : 'neutral'"
          :variant="tab.active ? 'soft' : 'ghost'"
        >
          {{ tab.label }}
        </UButton>
      </nav>
      <div class="ms-auto flex items-center gap-1">
        <UBadge v-if="state.bundleVersion" color="info" variant="subtle" size="sm" icon="i-lucide-refresh-cw" class="hidden md:inline-flex">bundle v{{ state.bundleVersion + 1 }}</UBadge>
        <UTooltip :text="state.host.theme === 'dark' ? 'Light host' : 'Dark host'">
          <UButton
            color="neutral"
            variant="ghost"
            :icon="state.host.theme === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
            aria-label="Toggle host theme"
            @click="state.host.theme = state.host.theme === 'dark' ? 'light' : 'dark'"
          />
        </UTooltip>
        <UTooltip text="Documentation">
          <UButton color="neutral" variant="ghost" icon="i-lucide-book-open" :to="`${REPO}#readme`" target="_blank" aria-label="Documentation" />
        </UTooltip>
        <UTooltip text="GitHub">
          <UButton color="neutral" variant="ghost" icon="i-simple-icons-github" :to="REPO" target="_blank" aria-label="GitHub" />
        </UTooltip>
      </div>
    </div>
  </header>
</template>
