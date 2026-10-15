<script setup lang="ts">
/**
 * A plain Vue SFC with Nuxt UI. Nothing in here knows about MCP: it takes props
 * and emits events. What `refresh`, `opened` and `asked` do is the manifest's
 * business (src/manifest.ts).
 */
import { computed } from 'vue'
import { useCardHost } from '@vue-mcp-apps/view'

type Condition = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow'

const props = defineProps<{
  city: string
  country?: string
  unit?: 'C' | 'F'
  current: { temp: number; condition: Condition; humidity?: number; wind?: number }
  forecast?: Array<{ day: string; min: number; max: number; condition: Condition }>
  sourceUrl?: string
}>()

const emit = defineEmits<{
  refresh: [args: { city: string; unit?: 'C' | 'F' }]
  opened: [url: string]
  asked: [text: string]
}>()

const host = useCardHost()

const ICONS: Record<Condition, string> = {
  sunny: 'i-lucide-sun',
  cloudy: 'i-lucide-cloud',
  rain: 'i-lucide-cloud-rain',
  storm: 'i-lucide-cloud-lightning',
  snow: 'i-lucide-snowflake',
}

const unit = computed(() => props.unit ?? 'C')
const icon = (condition: Condition) => ICONS[condition] ?? 'i-lucide-cloud'
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-4', header: 'p-4 sm:p-4' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-lg font-semibold text-highlighted">{{ city }}<span v-if="country" class="text-muted font-normal">, {{ country }}</span></p>
          <p class="text-sm text-muted capitalize">{{ current.condition }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UIcon :name="icon(current.condition)" class="size-10 text-primary" />
          <span class="text-4xl font-bold tabular-nums text-highlighted">{{ Math.round(current.temp) }}°{{ unit }}</span>
        </div>
      </div>
    </template>

    <div class="flex flex-wrap gap-2 mb-4">
      <UBadge v-if="current.humidity !== undefined" color="neutral" variant="subtle" icon="i-lucide-droplets">{{ current.humidity }}% humidity</UBadge>
      <UBadge v-if="current.wind !== undefined" color="neutral" variant="subtle" icon="i-lucide-wind">{{ current.wind }} km/h</UBadge>
      <UBadge :color="host.mode === 'native' ? 'success' : 'info'" variant="outline" size="sm">{{ host.mode }}</UBadge>
    </div>

    <div v-if="forecast?.length" class="grid grid-cols-3 gap-2 mb-4">
      <div v-for="day in forecast" :key="day.day" class="rounded-md bg-elevated p-2 text-center">
        <p class="text-xs text-muted">{{ day.day }}</p>
        <UIcon :name="icon(day.condition)" class="size-6 my-1 text-toned" />
        <p class="text-sm tabular-nums"><span class="font-semibold">{{ day.max }}°</span> <span class="text-muted">{{ day.min }}°</span></p>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        icon="i-lucide-refresh-cw"
        size="sm"
        :loading="host.busy.value"
        @click="emit('refresh', { city, unit })"
      >
        Refresh
      </UButton>
      <UButton
        icon="i-lucide-message-circle"
        size="sm"
        color="neutral"
        variant="outline"
        @click="emit('asked', `What should I pack for ${city} this weekend?`)"
      >
        Ask what to pack
      </UButton>
      <UButton
        v-if="sourceUrl"
        icon="i-lucide-external-link"
        size="sm"
        color="neutral"
        variant="ghost"
        @click="emit('opened', sourceUrl)"
      >
        About {{ city }}
      </UButton>
    </div>
  </UCard>
</template>
