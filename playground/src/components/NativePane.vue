<script setup lang="ts">
/**
 * Layer 0 — the card mounted NATIVELY in this page: the same `.vue` component
 * the MCP App bundle runs, drawn with `<McpCard>` straight into the DOM, with
 * the page's own Nuxt UI. No iframe, no protocol: what your own chat does.
 */
import { computed } from 'vue'
import { McpCard, NUXT_UI_TOKENS, type CardAction, type CallToolResult } from '@vue-mcp-apps/view'
import { callFromCard, hostContext, styleVariables } from '../lib/workbench'
import { log, state } from '../lib/store'
import { project } from '../project'

/** The host's style variables, mapped onto Nuxt UI tokens the same way the view does. */
const tokenStyle = computed(() => {
  const style: Record<string, string> = {}
  for (const [name, value] of Object.entries(styleVariables())) {
    style[name] = value
    const token = NUXT_UI_TOKENS[name]
    if (token) style[token] = value
    if (name === '--font-sans') style.fontFamily = value
  }
  return style
})

const context = computed(() => hostContext())

function onAction(action: CardAction) {
  const summary = action.kind === 'tool' ? `${action.tool}(${JSON.stringify(action.args).slice(0, 80)})`
    : action.kind === 'link' ? action.url
      : action.kind === 'notify' ? action.message
        : action.text
  log({ direction: 'host', layer: 'native', method: `action: ${action.kind}`, summary: `${action.event} → ${summary}`, data: action, tone: 'info' })
  if (action.kind === 'message') {
    state.conversation.push({ at: Date.now(), from: 'card', text: action.text })
  }
  if (action.kind === 'context') state.modelContext = { at: Date.now(), text: action.text }
}

function onResult({ result }: { result: CallToolResult }) {
  log({ direction: 'host', layer: 'native', method: 'tool result', summary: result.isError ? 'isError' : 'ok', data: result, tone: result.isError ? 'error' : 'success' })
}

const knows = computed(() => {
  const name = (state.run.result?.structuredContent as { card?: { name?: string } } | undefined)?.card?.name
  return !name || !!project.components[name]
})
</script>

<template>
  <UCard :ui="{ header: 'px-3 py-2 sm:px-3', body: 'p-3 sm:p-3' }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-component" class="size-4 text-success" />
        <p class="text-sm font-semibold">Native</p>
        <span class="text-xs text-muted truncate">&lt;McpCard&gt; in this page — no iframe</span>
      </div>
    </template>
    <div class="rounded-md" :class="state.host.stylePreset !== 'none' ? 'p-2' : ''" :style="{ ...tokenStyle, background: tokenStyle['--ui-bg'] }">
      <McpCard
        v-if="state.run.result && knows"
        :manifest="project.manifest"
        :components="project.components"
        :result="state.run.result"
        :host-context="context"
        :call-tool="callFromCard"
        @action="onAction"
        @result="onResult"
      />
      <p v-else-if="state.run.result" class="text-sm text-muted">This card has no native component in <code>project.ts</code> — only the sandboxed pane can draw it.</p>
      <p v-else class="text-sm text-muted">The card appears here, mounted as a plain Vue component.</p>
    </div>
  </UCard>
</template>
