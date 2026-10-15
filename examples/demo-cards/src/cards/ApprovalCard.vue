<script setup lang="ts">
/**
 * A human-in-the-loop card: the model PROPOSES changes, the user approves all or
 * some of them. The "Apply" button can only ever run `apply_changes` — the
 * manifest says so — and the server only accepts that tool from a card
 * (`visibility: ['app']`), so the model cannot skip the human.
 */
import { computed, ref, watch } from 'vue'
import { useCardHost } from '@vue-mcp-apps/view'

interface Change { id: string; field: string; from?: string; to: string }

const props = defineProps<{
  /** The proposal this card shows — sent back with the approval. */
  id?: string
  title: string
  summary?: string
  requestedBy?: string
  status?: 'pending' | 'applied'
  applied?: string[]
  changes: Change[]
}>()

const emit = defineEmits<{
  approved: [args: { proposal?: string; ids: string[] }]
  rejected: [message?: string]
  explained: [text: string]
}>()

const host = useCardHost()
const selected = ref<string[]>([])
watch(() => props.changes, changes => { selected.value = changes.map(c => c.id) }, { immediate: true })

const done = computed(() => props.status === 'applied')
const isApplied = (id: string) => (props.applied ?? []).includes(id)

function toggle(id: string, on: boolean | 'indeterminate') {
  selected.value = on === true ? [...new Set([...selected.value, id])] : selected.value.filter(x => x !== id)
}

function reject() {
  emit('explained', `The user rejected all ${props.changes.length} proposed changes to "${props.title}".`)
  emit('rejected', 'Changes rejected — nothing was applied.')
}
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-4', header: 'p-4 sm:p-4', footer: 'p-4 sm:p-4' }">
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="font-semibold text-highlighted">{{ title }}</p>
          <p v-if="summary" class="text-sm text-muted mt-0.5">{{ summary }}</p>
        </div>
        <UBadge :color="done ? 'success' : 'warning'" variant="subtle" :icon="done ? 'i-lucide-circle-check' : 'i-lucide-clock'">
          {{ done ? 'Applied' : 'Needs approval' }}
        </UBadge>
      </div>
    </template>

    <UAlert
      v-if="done"
      color="success"
      variant="soft"
      icon="i-lucide-circle-check"
      :title="`${(applied ?? []).length} of ${changes.length} change(s) applied`"
      class="mb-3"
    />

    <ul class="divide-y divide-default">
      <li v-for="change in changes" :key="change.id" class="flex items-center gap-3 py-2">
        <UCheckbox
          v-if="!done"
          :model-value="selected.includes(change.id)"
          :aria-label="`Apply ${change.field}`"
          @update:model-value="toggle(change.id, $event)"
        />
        <UIcon v-else :name="isApplied(change.id) ? 'i-lucide-check' : 'i-lucide-minus'" :class="isApplied(change.id) ? 'text-success' : 'text-dimmed'" class="size-4" />
        <span class="text-sm font-medium w-24 shrink-0">{{ change.field }}</span>
        <span class="text-sm text-muted line-through" v-if="change.from">{{ change.from }}</span>
        <UIcon name="i-lucide-arrow-right" class="size-4 text-dimmed" />
        <span class="text-sm text-highlighted">{{ change.to }}</span>
      </li>
    </ul>

    <p v-if="requestedBy" class="text-xs text-muted mt-3">Requested by {{ requestedBy }}</p>

    <template v-if="!done" #footer>
      <div class="flex gap-2 justify-end">
        <UButton color="neutral" variant="outline" size="sm" :disabled="host.busy.value" @click="reject">Reject</UButton>
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-check"
          :loading="host.busy.value"
          :disabled="!selected.length"
          @click="emit('approved', { proposal: id, ids: selected })"
        >
          Apply {{ selected.length }} of {{ changes.length }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>
