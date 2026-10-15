<script setup lang="ts">
import { ref, watch } from 'vue'
import { runTool } from '../lib/workbench'
import { state, toolResourceUri, toolVisibility, type ToolInfo } from '../lib/store'
import { project } from '../project'

const selected = ref<ToolInfo | null>(null)
const argsText = ref('{}')
const argsError = ref('')
const running = ref(false)

/** A starting object from the tool's JSON Schema: required keys with typed placeholders. */
function skeleton(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const props = (schema?.properties ?? {}) as Record<string, { type?: string; enum?: unknown[] }>
  const required = new Set((schema?.required as string[] | undefined) ?? [])
  const out: Record<string, unknown> = {}
  for (const [key, s] of Object.entries(props)) {
    if (!required.has(key)) continue
    out[key] = s.enum?.[0] ?? (s.type === 'number' || s.type === 'integer' ? 0 : s.type === 'boolean' ? false : s.type === 'array' ? [] : s.type === 'object' ? {} : '')
  }
  return out
}

function pick(tool: ToolInfo) {
  selected.value = tool
  const example = project.examples.find(e => e.tool === tool.name)
  argsText.value = JSON.stringify(example?.args ?? skeleton(tool.inputSchema), null, 2)
  argsError.value = ''
}

watch(() => state.connection.tools, () => { selected.value = null })

async function run(name: string, args: Record<string, unknown>, label = '') {
  running.value = true
  try {
    await runTool(name, args, label)
  } finally {
    running.value = false
  }
}

async function runSelected() {
  if (!selected.value) return
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsText.value || '{}')
    argsError.value = ''
  } catch (error) {
    argsError.value = error instanceof Error ? error.message : String(error)
    return
  }
  await run(selected.value.name, args)
}
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-3 space-y-3' }">
    <div>
      <p class="text-sm font-semibold">Play the model</p>
      <p class="text-xs text-muted">Call a tool the way an assistant would.</p>
    </div>

    <div v-if="project.examples.length && state.connection.status === 'connected'" class="flex flex-wrap gap-1.5">
      <UButton
        v-for="example in project.examples"
        :key="example.label"
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-sparkles"
        :disabled="running"
        @click="run(example.tool, example.args, example.label)"
      >
        {{ example.label }}
      </UButton>
    </div>

    <ul class="space-y-1">
      <li v-for="tool in state.connection.tools" :key="tool.name">
        <button
          class="w-full text-left rounded-md px-2 py-1.5 hover:bg-elevated transition-colors flex items-center gap-2"
          :class="selected?.name === tool.name ? 'bg-elevated' : ''"
          @click="pick(tool)"
        >
          <span class="font-mono text-xs truncate flex-1">{{ tool.name }}</span>
          <UBadge v-if="toolResourceUri(tool)" color="primary" variant="subtle" size="sm">UI</UBadge>
          <UTooltip v-if="!toolVisibility(tool).includes('model')" text="visibility: ['app'] — only a card may call it">
            <UBadge color="warning" variant="subtle" size="sm">app-only</UBadge>
          </UTooltip>
        </button>
      </li>
      <li v-if="!state.connection.tools.length" class="text-xs text-muted px-2">Not connected.</li>
    </ul>

    <div v-if="selected" class="space-y-2 border-t border-default pt-3">
      <p class="text-xs text-muted">{{ selected.description }}</p>
      <UTextarea v-model="argsText" :rows="6" autoresize class="w-full" :ui="{ base: 'json' }" />
      <p v-if="argsError" class="text-xs text-error">{{ argsError }}</p>
      <UButton
        size="sm"
        block
        icon="i-lucide-play"
        :loading="running"
        :disabled="!toolVisibility(selected).includes('model')"
        @click="runSelected"
      >
        {{ toolVisibility(selected).includes('model') ? `Call ${selected.name}` : 'App-only: a card calls it' }}
      </UButton>
    </div>
  </UCard>
</template>
