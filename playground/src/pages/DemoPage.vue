<script setup lang="ts">
/**
 * The public demo: a small AI that runs in the browser calls the MCP server
 * that also runs in the browser, and its cards appear in the chat as real MCP
 * Apps (host → sandbox proxy → view) or as native Vue components.
 */
import { onMounted, watch } from 'vue'
import ChatPanel from '../components/demo/ChatPanel.vue'
import AiProviderPanel from '../components/demo/AiProviderPanel.vue'
import MiniLog from '../components/demo/MiniLog.vue'
import { autoPick, refreshStatuses } from '../ai/agent'
import { state } from '../lib/store'

const REPO = 'https://github.com/JuanmanDev/vue-mcp-apps'

const FEATURES = [
  { icon: 'i-lucide-component', title: 'Plain Vue cards', text: 'A card is a .vue file with Nuxt UI: props in, events out. No MCP code inside.' },
  { icon: 'i-lucide-shield-check', title: 'Real MCP Apps', text: 'Each card is a ui:// template drawn through a sandbox proxy by the official AppBridge — like Claude, VS Code, Goose, ChatGPT.' },
  { icon: 'i-lucide-mouse-pointer-click', title: 'Buttons talk back', text: 'A click runs the tool its manifest names, asks the assistant (ui/message) or tells the model what happened.' },
  { icon: 'i-lucide-lock', title: 'Nothing leaves your browser', text: 'The MCP server and the AI both run in this tab (except the endpoint you type for an OpenAI-compatible model).' },
]

let picked = false
watch(() => state.connection.status, (status) => {
  if (status === 'connected' && !picked) {
    picked = true
    void autoPick()
  }
}, { immediate: true })
onMounted(() => { void refreshStatuses() })
</script>

<template>
  <div class="px-4 pb-10">
    <section class="max-w-6xl mx-auto pt-8 pb-6 text-center">
      <UBadge color="primary" variant="subtle" icon="i-lucide-sparkles" class="mb-3">MCP Apps spec 2026-01-26 · Vue 3 · Nuxt UI 4</UBadge>
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-highlighted">Interactive MCP cards, written as Vue components</h1>
      <p class="mt-3 text-muted max-w-2xl mx-auto">
        Chat with an AI that runs in your browser. It calls tools on an MCP server that also runs here, and every result
        comes back as an interactive card — rendered exactly the way Claude, VS Code or Goose render MCP Apps.
      </p>
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <UButton :to="`${REPO}#quick-start`" target="_blank" icon="i-lucide-rocket">Quick start</UButton>
        <UButton to="/workbench" color="neutral" variant="outline" icon="i-lucide-layers">Open the workbench</UButton>
        <UButton :to="REPO" target="_blank" color="neutral" variant="ghost" icon="i-simple-icons-github">GitHub</UButton>
      </div>
    </section>

    <section class="max-w-7xl mx-auto grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <ChatPanel />
      <aside class="space-y-4 min-w-0">
        <AiProviderPanel />
        <MiniLog />
      </aside>
    </section>

    <section class="max-w-7xl mx-auto mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="f in FEATURES" :key="f.title" class="rounded-xl border border-default p-4">
        <UIcon :name="f.icon" class="size-5 text-primary" />
        <p class="mt-2 font-medium">{{ f.title }}</p>
        <p class="text-sm text-muted mt-1">{{ f.text }}</p>
      </div>
    </section>

    <section class="max-w-7xl mx-auto mt-8 rounded-xl border border-default p-5">
      <p class="font-semibold">What happens when you send a message</p>
      <ol class="mt-3 grid gap-3 md:grid-cols-5 text-sm">
        <li><span class="text-primary font-semibold">1 · Decide.</span> <span class="text-muted">The model sees only tools with <code>visibility: "model"</code> and picks one, as JSON.</span></li>
        <li><span class="text-primary font-semibold">2 · Call.</span> <span class="text-muted">The host calls the tool on the MCP server (in this tab, in-memory transport).</span></li>
        <li><span class="text-primary font-semibold">3 · Frame.</span> <span class="text-muted">The host reads the tool’s <code>ui://</code> template and frames it: proxy on another origin → view.</span></li>
        <li><span class="text-primary font-semibold">4 · Render.</span> <span class="text-muted">The view gets <code>tool-result</code> and draws <code>structuredContent.card</code>; the model reads <code>content</code>.</span></li>
        <li><span class="text-primary font-semibold">5 · Click.</span> <span class="text-muted">Apply / Vote run app-only tools; “Ask what to pack” posts a <code>ui/message</code> back to the chat.</span></li>
      </ol>
    </section>
  </div>
</template>
