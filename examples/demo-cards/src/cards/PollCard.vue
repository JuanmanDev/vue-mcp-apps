<script setup lang="ts">
import { computed } from 'vue'
import { useCardHost } from '@vue-mcp-apps/view'

const props = defineProps<{
  id: string
  question: string
  options: Array<{ id: string; label: string; votes: number }>
  voted?: string
}>()

const emit = defineEmits<{
  voted: [args: { poll: string; option: string }]
  discussed: [text: string]
}>()

const host = useCardHost()
const total = computed(() => props.options.reduce((sum, o) => sum + o.votes, 0))
const leader = computed(() => [...props.options].sort((a, b) => b.votes - a.votes)[0])
const pct = (votes: number) => (total.value ? Math.round((votes / total.value) * 100) : 0)
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-4' }">
    <p class="font-semibold text-highlighted mb-3">{{ question }}</p>
    <div class="space-y-3">
      <div v-for="option in options" :key="option.id">
        <div class="flex items-center justify-between gap-2 mb-1">
          <UButton
            size="xs"
            :variant="voted === option.id ? 'solid' : 'outline'"
            :color="voted === option.id ? 'primary' : 'neutral'"
            :icon="voted === option.id ? 'i-lucide-check' : 'i-lucide-vote'"
            :disabled="!!voted || host.busy.value"
            @click="emit('voted', { poll: id, option: option.id })"
          >
            {{ option.label }}
          </UButton>
          <span class="text-xs text-muted tabular-nums">{{ option.votes }} · {{ pct(option.votes) }}%</span>
        </div>
        <UProgress :model-value="pct(option.votes)" size="sm" :color="option.id === leader?.id ? 'primary' : 'neutral'" />
      </div>
    </div>
    <div class="flex items-center justify-between mt-4">
      <span class="text-xs text-muted">{{ total }} votes</span>
      <UButton
        size="xs"
        variant="ghost"
        icon="i-lucide-messages-square"
        @click="emit('discussed', `The poll “${question}” stands at ${options.map(o => `${o.label} ${o.votes}`).join(', ')}. Summarise it for the team.`)"
      >
        Summarise for the team
      </UButton>
    </div>
  </UCard>
</template>
