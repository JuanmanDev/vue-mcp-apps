<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { chat, loadProvider, PROVIDERS, refreshStatuses, selectProvider } from '../../ai/agent'
import { openaiConfig } from '../../ai/providers/openai'
import { setWebLlmModel, webLlmModel, WEBLLM_MODELS } from '../../ai/providers/webllm'
import type { ProviderId } from '../../ai/types'

const ORDER: ProviderId[] = ['chrome', 'webllm', 'openai', 'scripted']
const ICONS: Record<ProviderId, string> = { chrome: 'i-simple-icons-googlechrome', webllm: 'i-lucide-cpu', openai: 'i-lucide-server', scripted: 'i-lucide-list-checks' }
const STATE_COLOR = { unavailable: 'neutral', downloadable: 'info', downloading: 'warning', loading: 'warning', ready: 'success', error: 'error' } as const

const current = computed(() => chat.status[chat.providerId])
const needsStart = computed(() => ['downloadable', 'error'].includes(current.value.state))
const busy = computed(() => ['downloading', 'loading'].includes(current.value.state))

const model = computed({
  get: () => webLlmModel() as (typeof WEBLLM_MODELS)[number]["id"],
  set: (id: (typeof WEBLLM_MODELS)[number]['id']) => { setWebLlmModel(id); void selectProvider('webllm') },
})

onMounted(() => { void refreshStatuses() })
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-3 space-y-3' }">
    <div>
      <p class="text-sm font-semibold">Assistant model</p>
      <p class="text-xs text-muted">Runs in your browser. Pick one — the cards and the MCP server are the same.</p>
    </div>

    <div class="space-y-1.5" role="radiogroup" aria-label="AI provider">
      <button
        v-for="id in ORDER"
        :key="id"
        role="radio"
        :aria-checked="chat.providerId === id"
        class="w-full text-left rounded-lg border px-2.5 py-2 transition-colors flex gap-2.5 items-start"
        :class="chat.providerId === id ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated/60'"
        @click="selectProvider(id)"
      >
        <UIcon :name="ICONS[id]" class="size-4 mt-0.5 shrink-0" :class="chat.providerId === id ? 'text-primary' : 'text-muted'" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ PROVIDERS[id].label }}</span>
            <UBadge :color="STATE_COLOR[chat.status[id].state]" variant="subtle" size="sm" class="ms-auto">{{ chat.status[id].state }}</UBadge>
          </span>
          <span class="block text-xs text-muted">{{ PROVIDERS[id].blurb }}</span>
        </span>
      </button>
    </div>

    <USelect v-if="chat.providerId === 'webllm'" v-model="model" :items="WEBLLM_MODELS.map(m => ({ label: m.label, value: m.id }))" size="sm" class="w-full" />

    <div v-if="chat.providerId === 'openai'" class="space-y-2">
      <UInput v-model="openaiConfig.baseUrl" size="sm" class="w-full" placeholder="http://localhost:11434/v1" icon="i-lucide-link" aria-label="Base URL" />
      <UInput v-model="openaiConfig.model" size="sm" class="w-full" placeholder="qwen2.5:3b" icon="i-lucide-box" aria-label="Model" />
      <UInput v-model="openaiConfig.apiKey" size="sm" class="w-full" type="password" placeholder="API key (optional, kept in memory)" icon="i-lucide-key-round" aria-label="API key" />
      <p class="text-[11px] text-muted">Ollama: <code>OLLAMA_ORIGINS=&lt;this page's origin&gt; ollama serve</code>. Needs a model with tool calling (qwen2.5, llama3.1+).</p>
    </div>

    <div v-if="busy || current.detail" class="space-y-1">
      <UProgress v-if="busy" :model-value="current.progress !== undefined ? Math.round(current.progress * 100) : null" size="sm" />
      <p class="text-xs text-muted break-words">{{ current.detail }}</p>
    </div>

    <UButton
      v-if="chat.providerId !== 'scripted' && (needsStart || busy)"
      block
      size="sm"
      icon="i-lucide-power"
      :loading="busy"
      :disabled="current.state === 'unavailable'"
      @click="loadProvider()"
    >
      {{ chat.providerId === 'webllm' ? 'Download & start the model' : chat.providerId === 'chrome' ? 'Start Gemini Nano' : 'Connect' }}
    </UButton>
  </UCard>
</template>
