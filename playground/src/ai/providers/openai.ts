/**
 * Any OpenAI-compatible chat endpoint with native tool calling: Ollama
 * (`http://localhost:11434/v1`, start it with OLLAMA_ORIGINS set to this page's
 * origin), LM Studio (`http://localhost:1234/v1`), OpenAI, OpenRouter…
 * The key lives in this tab's memory only — never stored, never sent anywhere
 * but the endpoint you typed.
 */
import { reactive } from 'vue'
import { transcript } from '../prompt'
import type { AiProvider, DecideContext } from '../types'

export const openaiConfig = reactive({
  baseUrl: 'http://localhost:11434/v1',
  model: 'qwen2.5:3b',
  apiKey: '',
})

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

/** The endpoint/model last checked by load(); changing either asks for a new check. */
let verified = ''
const configKey = () => openaiConfig.baseUrl + '|' + openaiConfig.model + '|' + openaiConfig.apiKey

const SYSTEM = 'You are the assistant of a demo chat that shows interactive cards. Use a tool when the user asks for weather, a poll, or changes to a booking (propose_changes — the user approves on the card). Answer in at most two short sentences. Never invent tool results.'

function messages(context: DecideContext): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: transcript(context) },
  ]
}

async function complete(body: Record<string, unknown>): Promise<ChatMessage> {
  const response = await fetch(`${openaiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(openaiConfig.apiKey ? { authorization: `Bearer ${openaiConfig.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: openaiConfig.model, temperature: 0.2, ...body }),
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 200)}`)
  const json = await response.json() as { choices?: Array<{ message?: ChatMessage }> }
  const message = json.choices?.[0]?.message
  if (!message) throw new Error('The endpoint returned no message.')
  return message
}

export const openaiProvider: AiProvider = {
  id: 'openai',
  label: 'OpenAI-compatible',
  blurb: 'Ollama, LM Studio, OpenAI… with native tool calling. Your endpoint, your key (kept in memory).',
  async check() {
    if (!openaiConfig.baseUrl || !openaiConfig.model) return { state: 'unavailable', detail: 'Set a base URL and a model.' }
    return verified === configKey()
      ? { state: 'ready', detail: `${openaiConfig.model} @ ${openaiConfig.baseUrl}` }
      : { state: 'downloadable', detail: 'Click Connect to check the endpoint.' }
  },
  async load(onStatus) {
    onStatus({ state: 'loading', detail: 'Checking the endpoint…' })
    const response = await fetch(`${openaiConfig.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: openaiConfig.apiKey ? { authorization: `Bearer ${openaiConfig.apiKey}` } : {},
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    verified = configKey()
    onStatus({ state: 'ready', detail: `${openaiConfig.model} @ ${openaiConfig.baseUrl}` })
  },
  async decide(context) {
    const message = await complete({
      messages: messages(context),
      tools: context.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
      tool_choice: 'auto',
    })
    const call = message.tool_calls?.[0]
    if (call) {
      const tool = context.tools.find(t => t.name === call.function.name)
      if (!tool) throw new Error(`The model called an unknown tool: ${call.function.name}`)
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch { throw new Error('The model sent arguments that are not JSON.') }
      return { action: 'call_tool', tool: tool.name, arguments: args }
    }
    return { action: 'answer', text: (message.content ?? '').trim() || '…' }
  },
  async answerAfterTool(context) {
    const message = await complete({
      messages: [
        ...messages(context),
        { role: 'user', content: `TOOL ${context.tool} RESULT: ${context.resultText}\nA card with this result is now on screen. Reply to the user directly, in one or two short sentences, with the key facts. Do not describe the card.` },
      ],
    })
    return (message.content ?? '').trim()
  },
}
