/**
 * Chrome's built-in AI: the Prompt API (`LanguageModel`), Gemini Nano running
 * on the device. Nothing leaves the browser. Needs a Chrome with built-in AI
 * (desktop, enough disk/VRAM); the model downloads once, managed by Chrome.
 * https://developer.chrome.com/docs/ai/prompt-api
 */
import { ANSWER_SCHEMA, afterToolTranscript, decisionSchema, parseAnswer, parseDecision, systemPrompt, transcript } from '../prompt'
import type { AiProvider, ProviderStatus, ToolSpec } from '../types'

interface LanguageModelSession {
  prompt(input: string, options?: { responseConstraint?: unknown; signal?: AbortSignal }): Promise<string>
  clone(): Promise<LanguageModelSession>
  destroy(): void
}
interface LanguageModelStatic {
  availability(options?: unknown): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>
  create(options?: unknown): Promise<LanguageModelSession>
}

const IO = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }

function api(): LanguageModelStatic | null {
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel ?? null
}

let base: LanguageModelSession | null = null
let baseTools = ''

async function session(tools: ToolSpec[], onStatus?: (s: ProviderStatus) => void): Promise<LanguageModelSession> {
  const LM = api()
  if (!LM) throw new Error('This browser has no Prompt API (LanguageModel).')
  const key = tools.map(t => t.name).join(',')
  if (!base || baseTools !== key) {
    base?.destroy()
    base = await LM.create({
      ...IO,
      initialPrompts: [{ role: 'system', content: systemPrompt(tools) }],
      monitor(m: EventTarget) {
        m.addEventListener('downloadprogress', (e) => onStatus?.({ state: 'downloading', progress: (e as unknown as { loaded: number }).loaded, detail: 'Chrome is downloading Gemini Nano' }))
      },
    })
    baseTools = key
  }
  // A fresh clone per decision: the transcript carries the history.
  return await base.clone()
}

let toolsForLoad: ToolSpec[] = []
export function setChromeTools(tools: ToolSpec[]): void { toolsForLoad = tools }

export const chromeProvider: AiProvider = {
  id: 'chrome',
  label: 'Chrome built-in AI',
  blurb: 'Gemini Nano on your device via the Prompt API. Private, free; Chrome desktop only.',
  async check() {
    const LM = api()
    if (!LM) return { state: 'unavailable', detail: 'No Prompt API in this browser (needs Chrome with built-in AI).' }
    try {
      const a = await LM.availability(IO)
      if (a === 'available') return { state: base ? 'ready' : 'downloadable', detail: base ? undefined : 'Model on device — click to start.' }
      if (a === 'downloadable') return { state: 'downloadable', detail: 'Chrome will download Gemini Nano (~2 GB, once).' }
      if (a === 'downloading') return { state: 'downloading', detail: 'Chrome is downloading Gemini Nano.' }
      return { state: 'unavailable', detail: 'Chrome says built-in AI is unavailable on this device.' }
    } catch (error) {
      return { state: 'unavailable', detail: error instanceof Error ? error.message : String(error) }
    }
  },
  async load(onStatus) {
    onStatus({ state: 'loading', detail: 'Starting Gemini Nano…' })
    const s = await session(toolsForLoad, onStatus)
    s.destroy()
    onStatus({ state: 'ready' })
  },
  async decide(context) {
    const s = await session(context.tools)
    try {
      const raw = await s.prompt(`${transcript(context)}\n\nYour JSON decision:`, { responseConstraint: decisionSchema(context.tools) })
      return parseDecision(raw, context.tools)
    } finally {
      s.destroy()
    }
  },
  async answerAfterTool(context) {
    const s = await session(context.tools)
    try {
      const raw = await s.prompt(afterToolTranscript(context), { responseConstraint: ANSWER_SCHEMA })
      return parseAnswer(raw)
    } finally {
      s.destroy()
    }
  },
}
