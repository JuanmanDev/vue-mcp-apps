<script setup lang="ts">
import { computed, ref } from 'vue'
import { clearLog, state, type LogEntry } from '../lib/store'

const filter = ref<'all' | 'bridge' | 'host' | 'native'>('all')
const hidePings = ref(true)
const open = ref<number | null>(null)

const entries = computed(() => state.log
  .filter(e => filter.value === 'all' || e.layer === filter.value)
  .filter(e => !hidePings.value || !(e.method === 'ui/notifications/size-changed' || e.method === 'ping'))
  .slice()
  .reverse())

const tabs = [
  { label: 'Protocol', slot: 'log', icon: 'i-lucide-arrow-left-right' },
  { label: 'Conversation', slot: 'chat', icon: 'i-lucide-messages-square' },
  { label: 'Model context', slot: 'context', icon: 'i-lucide-brain' },
  { label: 'Result', slot: 'result', icon: 'i-lucide-braces' },
]

function arrow(e: LogEntry) {
  return e.direction === 'host→view' ? '→' : e.direction === 'view→host' ? '←' : e.direction === 'policy' ? '⛨' : '•'
}
function tone(e: LogEntry) {
  if (e.tone === 'error') return 'text-error'
  if (e.tone === 'warning') return 'text-warning'
  if (e.tone === 'success') return 'text-success'
  if (e.direction === 'host→view') return 'text-info'
  if (e.direction === 'view→host') return 'text-primary'
  return 'text-muted'
}
const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour12: false }) + `.${String(at % 1000).padStart(3, '0')}`
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }" class="2xl:sticky 2xl:top-18">
    <UTabs :items="tabs" variant="link" size="sm" :ui="{ list: 'px-3', content: 'p-0' }">
      <template #log>
        <div class="flex items-center gap-2 px-3 py-2 border-b border-default">
          <USelect v-model="filter" :items="['all', 'bridge', 'host', 'native']" size="xs" class="w-28" />
          <UCheckbox v-model="hidePings" label="hide size/ping" size="xs" />
          <span class="ms-auto text-xs text-muted tabular-nums">{{ entries.length }}</span>
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" aria-label="Clear log" @click="clearLog" />
        </div>
        <ol class="max-h-[70vh] overflow-auto divide-y divide-default">
          <li v-for="e in entries" :key="e.n" class="px-3 py-1.5 text-xs cursor-pointer hover:bg-elevated/50" @click="open = open === e.n ? null : e.n">
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-dimmed tabular-nums shrink-0">{{ time(e.at) }}</span>
              <span class="font-bold w-3 shrink-0" :class="tone(e)">{{ arrow(e) }}</span>
              <span class="font-mono shrink-0" :class="tone(e)">{{ e.method }}</span>
              <span v-if="e.id !== undefined" class="text-dimmed shrink-0">#{{ e.id }}</span>
              <span class="text-muted truncate">{{ e.summary }}</span>
              <UBadge v-if="e.layer !== 'bridge'" size="sm" variant="outline" color="neutral" class="ms-auto shrink-0">{{ e.layer }}</UBadge>
            </div>
            <pre v-if="open === e.n" class="json mt-1.5 p-2 rounded bg-elevated max-h-80 overflow-auto">{{ JSON.stringify(e.data, null, 2) }}</pre>
          </li>
          <li v-if="!entries.length" class="px-3 py-6 text-center text-sm text-muted">Every JSON-RPC message between host and view shows up here.</li>
        </ol>
        <p class="px-3 py-2 border-t border-default text-[11px] text-muted">
          <span class="text-info font-bold">→</span> host→view ·
          <span class="text-primary font-bold">←</span> view→host ·
          <span class="font-bold">⛨</span> host policy decision
        </p>
      </template>

      <template #chat>
        <div class="p-3 space-y-2 max-h-[70vh] overflow-auto">
          <div v-for="(m, i) in state.conversation" :key="i" class="flex" :class="m.from === 'card' ? 'justify-end' : ''">
            <div class="rounded-lg px-3 py-2 text-sm max-w-[85%]" :class="m.from === 'card' ? 'bg-primary/10' : 'bg-elevated text-muted italic'">
              <p class="text-[10px] uppercase tracking-wide text-dimmed mb-0.5">{{ m.from === 'card' ? 'ui/message from the card' : 'host' }}</p>
              {{ m.text }}
            </div>
          </div>
          <p v-if="!state.conversation.length" class="text-sm text-muted text-center py-6">Messages a card posts to the chat (<code>ui/message</code>).</p>
          <p v-else class="text-xs text-muted text-center pt-2">A real host sends each of these to the model, which answers in the chat.</p>
        </div>
      </template>

      <template #context>
        <div class="p-3">
          <template v-if="state.modelContext">
            <p class="text-xs text-muted mb-1">{{ time(state.modelContext.at) }} — what the model will see on its next turn</p>
            <pre class="json p-2 rounded bg-elevated">{{ state.modelContext.text }}</pre>
          </template>
          <p v-else class="text-sm text-muted text-center py-6">Context a card hands the model (<code>ui/update-model-context</code>).</p>
        </div>
      </template>

      <template #result>
        <div class="p-3">
          <p class="text-xs text-muted mb-1"><code>content</code> is what the model reads; <code>structuredContent</code> is what the view draws.</p>
          <pre class="json p-2 rounded bg-elevated max-h-[65vh] overflow-auto">{{ state.run.result ? JSON.stringify(state.run.result, null, 2) : '—' }}</pre>
        </div>
      </template>
    </UTabs>
  </UCard>
</template>
