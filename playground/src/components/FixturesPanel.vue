<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resultCard } from '@vue-mcp-apps/core'
import { renderFixture } from '../lib/workbench'
import { state } from '../lib/store'
import { project } from '../project'

const fixtures = computed(() => Object.entries(project.manifest).flatMap(([name, spec]) =>
  Object.entries(spec.fixtures ?? {}).map(([fixture, props]) => ({ name, fixture, title: spec.title, props }))))

const current = computed(() => resultCard(state.run.result))
const propsText = ref('')
const propsError = ref('')
watch(current, card => { propsText.value = card ? JSON.stringify(card.props, null, 2) : '' }, { immediate: true })

async function apply() {
  if (!current.value) return
  try {
    const props = JSON.parse(propsText.value)
    propsError.value = ''
    await renderFixture(current.value.name, props, `${current.value.name} (edited)`)
  } catch (error) {
    propsError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-3 space-y-3' }">
    <div>
      <p class="text-sm font-semibold">Fixtures</p>
      <p class="text-xs text-muted">Draw a card from props — no tool call. From each card’s <code>fixtures</code> in the manifest.</p>
    </div>
    <div class="flex flex-wrap gap-1.5">
      <UButton
        v-for="f in fixtures"
        :key="`${f.name}/${f.fixture}`"
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-box"
        :disabled="state.connection.status !== 'connected'"
        @click="renderFixture(f.name, f.props, `${f.title} · ${f.fixture}`)"
      >
        {{ f.title }} · {{ f.fixture }}
      </UButton>
    </div>
    <div v-if="current" class="space-y-2 border-t border-default pt-3">
      <div class="flex items-center justify-between">
        <p class="text-xs font-medium">Props of <span class="font-mono">{{ current.name }}</span></p>
        <UBadge size="sm" variant="subtle" color="neutral">live edit</UBadge>
      </div>
      <UTextarea v-model="propsText" :rows="8" :maxrows="18" autoresize class="w-full" :ui="{ base: 'json' }" />
      <p v-if="propsError" class="text-xs text-error">{{ propsError }}</p>
      <UButton size="sm" block icon="i-lucide-send" color="neutral" @click="apply">Apply to both panes</UButton>
    </div>
  </UCard>
</template>
