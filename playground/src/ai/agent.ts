/**
 * The demo assistant: a tiny agent loop around a provider, playing the part a
 * real MCP Apps host (Claude, VS Code…) plays.
 *
 *   user text ─▶ provider.decide ─▶ answer ──────────────────────────▶ chat
 *                                └▶ call_tool ─▶ MCP server ─▶ card in chat (sandboxed MCP App or native)
 *                                                           └▶ result TEXT ─▶ provider.answerAfterTool ─▶ chat
 *   card button ─▶ ui/message ─▶ new user turn (loop)     card ─▶ ui/update-model-context ─▶ next prompt
 *
 * The model only ever sees tools whose `_meta.ui.visibility` includes "model".
 * Tools a card alone may call (apply_changes, cast_vote) need a click.
 */
import { reactive } from 'vue'
import type { CallToolResult } from '@vue-mcp-apps/core'
import { resultText } from '@vue-mcp-apps/core'
import { callTool, readResource } from '../lib/connection'
import { log, state, toolResourceUri, toolVisibility } from '../lib/store'
import { scriptedDecision, scriptedProvider } from './providers/scripted'
import { chromeProvider, setChromeTools } from './providers/chrome'
import { webllmProvider } from './providers/webllm'
import { openaiProvider } from './providers/openai'
import type { AiProvider, Decision, ProviderId, ProviderStatus, ToolSpec, Turn } from './types'

export const PROVIDERS: Record<ProviderId, AiProvider> = {
  chrome: chromeProvider,
  webllm: webllmProvider,
  openai: openaiProvider,
  scripted: scriptedProvider,
}

export interface ChatCard {
  tool: string
  args: Record<string, unknown>
  result: CallToolResult
  uri: string
  template: { html: string; meta: Record<string, unknown> } | null
}

export interface ChatItem {
  id: number
  role: 'user' | 'assistant' | 'card' | 'note'
  text?: string
  fromCard?: boolean
  card?: ChatCard
  tone?: 'info' | 'warning' | 'error'
  provider?: ProviderId
}

export const chat = reactive({
  items: [] as ChatItem[],
  turns: [] as Turn[],
  modelContext: [] as string[],
  busy: false,
  thinking: '',
  providerId: 'scripted' as ProviderId,
  status: {
    chrome: { state: 'unavailable' },
    webllm: { state: 'unavailable' },
    openai: { state: 'unavailable' },
    scripted: { state: 'ready' },
  } as Record<ProviderId, ProviderStatus>,
  render: 'mcp-app' as 'mcp-app' | 'native',
})

let nextId = 1
function push(item: Omit<ChatItem, 'id'>): ChatItem {
  const full = { ...item, id: nextId++ }
  chat.items.push(full)
  return full
}

/** The tools the MODEL may call: visibility includes "model". */
export function modelTools(): ToolSpec[] {
  return state.connection.tools
    .filter(t => toolVisibility(t).includes('model'))
    .map(t => ({ name: t.name, description: t.description ?? t.title ?? t.name, inputSchema: JSON.parse(JSON.stringify(t.inputSchema ?? { type: 'object' })) }))
}

export async function refreshStatuses(): Promise<void> {
  setChromeTools(modelTools())
  for (const provider of Object.values(PROVIDERS)) {
    if (chat.status[provider.id].state === 'downloading' || chat.status[provider.id].state === 'loading') continue
    chat.status[provider.id] = await provider.check().catch(e => ({ state: 'error', detail: String(e) }) as ProviderStatus)
  }
}

/** Pick a provider; models that must download first wait for `loadProvider`. */
export async function selectProvider(id: ProviderId): Promise<void> {
  chat.providerId = id
  chat.status[id] = await PROVIDERS[id].check()
}

export async function loadProvider(id: ProviderId = chat.providerId): Promise<boolean> {
  const provider = PROVIDERS[id]
  setChromeTools(modelTools())
  try {
    await provider.load((s) => { chat.status[id] = s })
    chat.status[id] = { ...(await provider.check()), state: 'ready' }
    push({ role: 'note', text: `${provider.label} is ready.`, tone: 'info' })
    return true
  } catch (error) {
    chat.status[id] = { state: 'error', detail: error instanceof Error ? error.message : String(error) }
    push({ role: 'note', text: `${provider.label} could not start: ${chat.status[id].detail}`, tone: 'error' })
    return false
  }
}

/** On page load: use Chrome's on-device model when it is already there; otherwise stay scripted. */
export async function autoPick(): Promise<void> {
  await refreshStatuses()
  const LM = (globalThis as { LanguageModel?: { availability(o?: unknown): Promise<string> } }).LanguageModel
  if (LM && (await LM.availability().catch(() => 'unavailable')) === 'available') {
    chat.providerId = 'chrome'
    await loadProvider('chrome')
  }
}

const queue: Array<{ text: string; fromCard: boolean }> = []

/** A user turn: typed, or posted by a card (`ui/message`). */
export async function send(text: string, options: { fromCard?: boolean } = {}): Promise<void> {
  const clean = text.trim()
  if (!clean) return
  if (chat.busy) {
    queue.push({ text: clean, fromCard: !!options.fromCard })
    return
  }
  chat.busy = true
  try {
    push({ role: 'user', text: clean, fromCard: options.fromCard })
    chat.turns.push({ role: 'user', text: clean, fromCard: options.fromCard })
    await respond()
  } finally {
    chat.busy = false
    chat.thinking = ''
    const next = queue.shift()
    if (next) void send(next.text, { fromCard: next.fromCard })
  }
}

function providerReady(): AiProvider {
  const provider = PROVIDERS[chat.providerId]
  if (chat.status[provider.id].state !== 'ready') {
    push({ role: 'note', text: `${provider.label} is not started — the scripted assistant answers this one.`, tone: 'warning' })
    return scriptedProvider
  }
  return provider
}

async function respond(): Promise<void> {
  const provider = providerReady()
  const tools = modelTools()
  const context = { turns: chat.turns, tools, modelContext: chat.modelContext }

  chat.thinking = `${provider.label} is thinking…`
  let decision: Decision
  try {
    decision = await provider.decide(context)
  } catch (error) {
    push({ role: 'note', text: `${provider.label}: unusable reply (${error instanceof Error ? error.message : String(error)}) — the scripted rules answer instead.`, tone: 'warning' })
    decision = scriptedDecision(context)
  }
  decision = repairArguments(decision, context, provider)
  log({ direction: 'host', layer: 'host', method: 'ai decision', summary: `${provider.label}: ${decision.action === 'call_tool' ? `${decision.tool}(${JSON.stringify(decision.arguments).slice(0, 80)})` : decision.text.slice(0, 80)}`, data: decision, tone: 'info' })

  if (decision.action === 'answer') {
    push({ role: 'assistant', text: decision.text, provider: provider.id })
    chat.turns.push({ role: 'assistant', text: decision.text })
    return
  }

  // The host checks the model's call like any host would.
  const tool = state.connection.tools.find(t => t.name === decision.tool)
  if (!tool || !toolVisibility(tool).includes('model')) {
    push({ role: 'note', text: `Refused: ${decision.tool} is not a tool the model may call.`, tone: 'error' })
    return
  }
  chat.thinking = `Calling ${tool.name}…`
  let result: CallToolResult
  try {
    log({ direction: 'host', layer: 'host', method: 'tools/call (model)', summary: `${tool.name}(${JSON.stringify(decision.arguments).slice(0, 80)})`, data: decision.arguments })
    result = await callTool(tool.name, decision.arguments)
  } catch (error) {
    push({ role: 'note', text: `${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`, tone: 'error' })
    return
  }
  const uri = toolResourceUri(tool)
  const template = uri ? await readResource(uri).catch(() => null) : null
  push({ role: 'card', card: { tool: tool.name, args: decision.arguments, result, uri, template } })
  const text = resultText(result)
  chat.turns.push({ role: 'tool', tool: tool.name, text })

  chat.thinking = `${provider.label} is writing…`
  let answer = text
  try {
    answer = (await provider.answerAfterTool({ ...context, tool: tool.name, resultText: text })) || text
  } catch { /* the tool's own text is a fine answer */ }
  push({ role: 'assistant', text: answer, provider: provider.id })
  chat.turns.push({ role: 'assistant', text: answer })
}

/**
 * Small models often pick the right tool but drop arguments ("make a poll:
 * cats or dogs?" → show_poll({})). When the scripted rules reach the SAME tool
 * and found arguments the model left out, fill those in — and say so in the chat.
 */
function repairArguments(decision: Decision, context: { turns: Turn[]; tools: ToolSpec[]; modelContext: string[] }, provider: AiProvider): Decision {
  if (decision.action !== 'call_tool' || provider.id === 'scripted') return decision
  const rules = scriptedDecision(context)
  if (rules.action !== 'call_tool' || rules.tool !== decision.tool) return decision
  const missing = Object.keys(rules.arguments).filter(k => decision.arguments[k] === undefined || decision.arguments[k] === '')
  if (!missing.length) return decision
  push({ role: 'note', text: `${provider.label} left out ${missing.join(', ')} — filled from your message.`, tone: 'info' })
  return { ...decision, arguments: { ...decision.arguments, ...Object.fromEntries(missing.map(k => [k, rules.arguments[k]])) } }
}

/** A card handed the model a note (`ui/update-model-context`). */
export function addModelContext(text: string): void {
  chat.modelContext.push(text)
  push({ role: 'note', text: `Card → model context: ${text}`, tone: 'info' })
}

export function resetChat(): void {
  chat.items.splice(0)
  chat.turns.splice(0)
  chat.modelContext.splice(0)
  queue.splice(0)
}
