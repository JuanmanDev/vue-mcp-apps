/**
 * WebLLM: an open model compiled to WebGPU, downloaded once into the browser's
 * Cache Storage and run on your GPU, in a Web Worker. Nothing leaves the
 * browser. The library (~6 MB) is loaded only when you pick this provider.
 * https://github.com/mlc-ai/web-llm
 */
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { ANSWER_SCHEMA, afterToolTranscript, decisionSchema, parseAnswer, parseDecision, systemPrompt, transcript } from '../prompt'
import type { AiProvider } from '../types'

export const WEBLLM_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B (best, ~1.6 GB)' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B (~0.9 GB)' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B (fastest, ~0.9 GB)' },
] as const

let modelId: string = WEBLLM_MODELS[0].id
let engine: WebWorkerMLCEngine | null = null
let loadedModel = ''

export function setWebLlmModel(id: string): void { modelId = id }
export function webLlmModel(): string { return modelId }

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

async function chat(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<string> {
  if (!engine) throw new Error('WebLLM model not loaded')
  const reply = await engine.chat.completions.create({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object', schema: JSON.stringify(schema) },
    temperature: 0.1,
    max_tokens: maxTokens,
  })
  return reply.choices[0]?.message?.content ?? ''
}

export const webllmProvider: AiProvider = {
  id: 'webllm',
  label: 'WebLLM (WebGPU)',
  blurb: 'An open model on your GPU (Qwen / Llama). Private; downloads ~1 GB once.',
  async check() {
    if (!hasWebGpu()) return { state: 'unavailable', detail: 'No WebGPU in this browser (try Chrome / Edge desktop).' }
    if (engine && loadedModel === modelId) return { state: 'ready' }
    return { state: 'downloadable', detail: `Downloads ${WEBLLM_MODELS.find(m => m.id === modelId)?.label ?? modelId} into the browser cache.` }
  },
  async load(onStatus) {
    if (engine && loadedModel === modelId) return onStatus({ state: 'ready' })
    onStatus({ state: 'downloading', progress: 0, detail: 'Loading WebLLM…' })
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
    const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' })
    if (engine) await engine.unload().catch(() => {})
    engine = await CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (report) => onStatus({ state: 'downloading', progress: report.progress, detail: report.text }),
    })
    loadedModel = modelId
    onStatus({ state: 'ready' })
  },
  async decide(context) {
    const raw = await chat(systemPrompt(context.tools), `${transcript(context)}\n\nYour JSON decision:`, decisionSchema(context.tools), 400)
    return parseDecision(raw, context.tools)
  },
  async answerAfterTool(context) {
    const raw = await chat(systemPrompt(context.tools), afterToolTranscript(context), ANSWER_SCHEMA, 160)
    return parseAnswer(raw)
  },
}
