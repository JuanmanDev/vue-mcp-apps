/**
 * The decision protocol for models without native tool calling (Chrome's
 * built-in Gemini Nano, small WebLLM models): the model answers with ONE JSON
 * object, constrained by a JSON Schema whose `tool` is an enum of the tools it
 * may call. Everything it returns is validated here before the agent acts.
 */
import type { Decision, DecideContext, ToolSpec, Turn } from './types'

/** Compact signature for the prompt: `get_weather(city: string, unit?: "C" | "F")`. */
export function toolSignature(tool: ToolSpec): string {
  const props = (tool.inputSchema.properties ?? {}) as Record<string, { type?: string; enum?: unknown[]; items?: { type?: string } }>
  const required = new Set((tool.inputSchema.required as string[] | undefined) ?? [])
  const args = Object.entries(props).map(([name, s]) => {
    const type = s.enum ? s.enum.map(v => JSON.stringify(v)).join(' | ') : s.type === 'array' ? `${s.items?.type ?? 'object'}[]` : (s.type ?? 'any')
    return `${name}${required.has(name) ? '' : '?'}: ${type}`
  })
  return `${tool.name}(${args.join(', ')})`
}

export function systemPrompt(tools: ToolSpec[]): string {
  return [
    'You are the assistant of a demo chat. You can show interactive cards by calling tools.',
    'Tools:',
    ...tools.map(t => `- ${toolSignature(t)} — ${t.description}`),
    '',
    'Reply with ONE JSON object and nothing else:',
    '{"action":"call_tool","tool":"<tool name>","arguments":{...}} to call a tool, or',
    '{"action":"answer","text":"<your reply>"} to answer in words.',
    'Call a tool when the user asks for weather, a poll, or changes to something (propose_changes: the user approves on the card).',
    'For propose_changes use arguments {"title": "...", "changes": [{"field": "...", "from": "...", "to": "..."}]}.',
    'For a new poll use show_poll with {"question": "...", "options": ["...", "..."]}; for the existing lunch poll use {}.',
    'Answers: friendly, at most two sentences. Never invent tool results.',
    '',
    'Examples:',
    ...examples(tools),
  ].join('\n')
}

/** Few-shot examples, only for the tools on offer — small models copy the shape. */
function examples(tools: ToolSpec[]): string[] {
  const has = (name: string) => tools.some(t => t.name === name)
  const lines: string[] = []
  if (has('get_weather')) lines.push('USER: weather in Paris → {"action":"call_tool","tool":"get_weather","arguments":{"city":"Paris"}}')
  if (has('show_poll')) {
    lines.push('USER: Make a poll: red or blue? → {"action":"call_tool","tool":"show_poll","arguments":{"question":"Red or blue?","options":["Red","Blue"]}}')
    lines.push('USER: show the lunch poll → {"action":"call_tool","tool":"show_poll","arguments":{}}')
  }
  if (has('propose_changes')) lines.push('USER: Change booking #12: 2 guests, add breakfast → {"action":"call_tool","tool":"propose_changes","arguments":{"title":"Update booking #12","changes":[{"field":"Guests","to":"2"},{"field":"Breakfast","from":"No","to":"Yes"}]}}')
  lines.push('USER: thanks! → {"action":"answer","text":"You are welcome!"}')
  return lines
}

/** The conversation as one block of text (Gemini Nano and small models follow it better than many short turns). */
export function transcript(context: DecideContext, maxTurns = 8): string {
  const lines: string[] = []
  if (context.modelContext.length) {
    lines.push('Notes from cards the user interacted with:')
    for (const note of context.modelContext.slice(-3)) lines.push(`- ${note}`)
    lines.push('')
  }
  for (const turn of context.turns.slice(-maxTurns)) lines.push(turnLine(turn))
  const last = latestUserText(context)
  if (last) lines.push('', `Decide for the LAST user message only: "${last}"`)
  return lines.join('\n')
}

export function latestUserText(context: DecideContext): string {
  for (let i = context.turns.length - 1; i >= 0; i--) if (context.turns[i]!.role === 'user') return context.turns[i]!.text
  return ''
}

/** After a tool ran, small models do best with just the request and the result — no older turns to echo. */
export function afterToolTranscript(context: DecideContext & { tool: string; resultText: string }): string {
  return `USER: ${latestUserText(context)}\n${afterToolPrompt(context.tool, context.resultText)}`
}

function turnLine(turn: Turn): string {
  if (turn.role === 'tool') return `TOOL ${turn.tool} RESULT: ${turn.text}`
  if (turn.role === 'assistant') return `ASSISTANT: ${turn.text}`
  return turn.fromCard ? `USER (clicked a button on a card): ${turn.text}` : `USER: ${turn.text}`
}

/** The JSON Schema the model's reply must match. */
export function decisionSchema(tools: ToolSpec[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['call_tool', 'answer'] },
      tool: { type: 'string', enum: tools.map(t => t.name) },
      arguments: { type: 'object' },
      text: { type: 'string' },
    },
    required: ['action'],
    additionalProperties: false,
  }
}

export const ANSWER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
}

export function afterToolPrompt(tool: string, resultText: string): string {
  return `TOOL ${tool} RESULT: ${resultText}\nA card with this result is now on screen. Reply to the user directly ("you"), in one or two short sentences, with the key facts from the result. Do not describe the card. Reply as {"text": "..."}.`
}

export class DecisionError extends Error {}

/** Parse and validate a model's reply. Throws `DecisionError` with the reason. */
export function parseDecision(raw: string, tools: ToolSpec[]): Decision {
  let value: unknown
  try {
    value = JSON.parse(extractJson(raw))
  } catch {
    throw new DecisionError(`not JSON: ${raw.slice(0, 120)}`)
  }
  const v = value as { action?: unknown; tool?: unknown; arguments?: unknown; text?: unknown }
  if (v.action === 'answer') {
    if (typeof v.text !== 'string' || !v.text.trim()) throw new DecisionError('answer without text')
    return { action: 'answer', text: v.text.trim() }
  }
  if (v.action === 'call_tool') {
    const tool = tools.find(t => t.name === v.tool)
    if (!tool) throw new DecisionError(`unknown tool ${JSON.stringify(v.tool)}`)
    const args = v.arguments && typeof v.arguments === 'object' && !Array.isArray(v.arguments) ? v.arguments as Record<string, unknown> : {}
    const missing = ((tool.inputSchema.required as string[] | undefined) ?? []).filter(k => args[k] === undefined || args[k] === '')
    if (missing.length) throw new DecisionError(`${tool.name} is missing ${missing.join(', ')}`)
    return { action: 'call_tool', tool: tool.name, arguments: args }
  }
  throw new DecisionError(`unknown action ${JSON.stringify(v.action)}`)
}

/** Models sometimes wrap JSON in prose or ```fences```: take the outermost object. */
export function extractJson(raw: string): string {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw
}

export function parseAnswer(raw: string): string {
  try {
    const v = JSON.parse(extractJson(raw)) as { text?: unknown }
    if (typeof v.text === 'string' && v.text.trim()) return v.text.trim()
  } catch { /* plain text is fine too */ }
  return raw.trim()
}
