<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import ChatCardView from './ChatCardView.vue'
import { chat, PROVIDERS, resetChat, send } from '../../ai/agent'
import { state } from '../../lib/store'

const input = ref('')
const scroller = ref<HTMLElement | null>(null)

interface Example { label: string; prompt: string; icon: string }
const EXAMPLES: Example[] = [
  { label: 'Weather in Oslo', prompt: 'What’s the weather in Oslo?', icon: 'i-lucide-cloud-sun' },
  { label: 'Madrid in °F', prompt: 'Weather in Madrid in Fahrenheit', icon: 'i-lucide-thermometer' },
  { label: 'Approve booking changes', prompt: 'Propose changing booking #4821: check-in Nov 3, 3 guests, add breakfast', icon: 'i-lucide-check-check' },
  { label: 'Lunch poll', prompt: 'Show the lunch poll', icon: 'i-lucide-vote' },
  { label: 'New poll', prompt: 'Make a poll: tabs or spaces?', icon: 'i-lucide-list-plus' },
]

async function submit(text = input.value) {
  if (!text.trim() || state.connection.status !== 'connected') return
  input.value = ''
  await send(text)
}

watch(() => chat.items.length, async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
})

const toneClass = { info: 'text-info', warning: 'text-warning', error: 'text-error' } as const
</script>

<template>
  <UCard :ui="{ root: 'flex flex-col', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }" class="h-[min(78vh,900px)] min-h-[520px]">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-bot" class="size-5 text-primary" />
        <p class="font-semibold">Chat</p>
        <UBadge color="neutral" variant="subtle" size="sm">{{ PROVIDERS[chat.providerId].label }}</UBadge>
        <div class="ms-auto flex items-center gap-2">
          <span class="text-xs text-muted hidden sm:inline">Cards as</span>
          <UFieldGroup size="xs">
            <UButton :color="chat.render === 'mcp-app' ? 'primary' : 'neutral'" :variant="chat.render === 'mcp-app' ? 'soft' : 'outline'" icon="i-lucide-shield-check" @click="chat.render = 'mcp-app'">MCP App</UButton>
            <UButton :color="chat.render === 'native' ? 'primary' : 'neutral'" :variant="chat.render === 'native' ? 'soft' : 'outline'" icon="i-lucide-component" @click="chat.render = 'native'">Native</UButton>
          </UFieldGroup>
          <UTooltip text="Clear the chat">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-eraser" aria-label="Clear the chat" @click="resetChat" />
          </UTooltip>
        </div>
      </div>
    </template>

    <div ref="scroller" class="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4" data-testid="chat-log">
      <div v-if="!chat.items.length" class="h-full grid place-items-center text-center">
        <div class="max-w-md space-y-3">
          <UIcon name="i-lucide-sparkles" class="size-8 text-primary mx-auto" />
          <p class="font-medium">Ask for something a card can show.</p>
          <p class="text-sm text-muted">The assistant picks a tool on the MCP server running in this tab. The tool’s card appears right here — as a sandboxed MCP App, exactly how Claude or VS Code draw it. Buttons on the card talk back to the assistant.</p>
        </div>
      </div>

      <template v-for="item in chat.items" :key="item.id">
        <div v-if="item.role === 'user'" class="flex justify-end">
          <div class="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-inverted px-3.5 py-2 text-sm">
            <p v-if="item.fromCard" class="text-[10px] uppercase tracking-wide opacity-80 mb-0.5 flex items-center gap-1"><UIcon name="i-lucide-mouse-pointer-click" class="size-3" /> from a card button (ui/message)</p>
            {{ item.text }}
          </div>
        </div>
        <div v-else-if="item.role === 'assistant'" class="flex gap-2">
          <UAvatar icon="i-lucide-bot" size="sm" class="shrink-0" />
          <div class="max-w-[85%] rounded-2xl rounded-tl-sm bg-elevated px-3.5 py-2 text-sm" data-testid="assistant-message">{{ item.text }}</div>
        </div>
        <div v-else-if="item.role === 'card' && item.card" class="flex gap-2">
          <div class="w-8 shrink-0" />
          <ChatCardView :card="item.card" />
        </div>
        <p v-else-if="item.role === 'note'" class="text-xs text-center" :class="toneClass[item.tone ?? 'info']">{{ item.text }}</p>
      </template>

      <div v-if="chat.busy" class="flex gap-2 items-center">
        <UAvatar icon="i-lucide-bot" size="sm" />
        <UChatShimmer :text="chat.thinking || 'Thinking…'" class="text-sm" />
      </div>
    </div>

    <template #footer>
      <div class="space-y-2">
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="example in EXAMPLES"
            :key="example.label"
            size="xs"
            color="neutral"
            variant="outline"
            :icon="example.icon"
            :disabled="state.connection.status !== 'connected'"
            @click="submit(example.prompt)"
          >
            {{ example.label }}
          </UButton>
        </div>
        <UChatPrompt
          v-model="input"
          :placeholder="state.connection.status === 'connected' ? 'Ask for the weather, a poll, or a booking change…' : 'Starting the in-browser MCP server…'"
          :disabled="state.connection.status !== 'connected'"
          variant="subtle"
          @submit="submit()"
        >
          <UChatPromptSubmit :status="chat.busy ? 'submitted' : 'ready'" @click="submit()" />
        </UChatPrompt>
      </div>
    </template>
  </UCard>
</template>
