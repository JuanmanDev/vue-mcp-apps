/**
 * The demo assistant's contract. A provider turns the conversation into ONE
 * decision: call a tool, or answer. The agent (agent.ts) does the rest — the
 * provider never touches MCP, the host or a card.
 */

/** A tool as the model sees it: only tools whose `_meta.ui.visibility` includes "model". */
export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type Decision =
  | { action: 'call_tool'; tool: string; arguments: Record<string, unknown> }
  | { action: 'answer'; text: string }

/** One turn of the conversation, as text — what every provider can read. */
export interface Turn {
  role: 'user' | 'assistant' | 'tool'
  text: string
  /** For `tool` turns: which tool produced `text` (its `content`, never its `structuredContent`). */
  tool?: string
  /** A user turn a card posted (`ui/message`), not typed by the person. */
  fromCard?: boolean
}

export interface DecideContext {
  turns: Turn[]
  tools: ToolSpec[]
  /** Notes cards handed the model (`ui/update-model-context`), newest last. */
  modelContext: string[]
}

export type ProviderState = 'unavailable' | 'downloadable' | 'downloading' | 'loading' | 'ready' | 'error'

export interface ProviderStatus {
  state: ProviderState
  detail?: string
  /** 0..1 while downloading / loading. */
  progress?: number
}

export type ProviderId = 'chrome' | 'webllm' | 'openai' | 'scripted'

export interface AiProvider {
  id: ProviderId
  label: string
  /** One line: where the model runs and what it costs. */
  blurb: string
  /** Cheap: can this browser run it, and is it loaded? Never downloads. */
  check(): Promise<ProviderStatus>
  /** Download / start the model. May take minutes (WebLLM) — reports progress. */
  load(onStatus: (status: ProviderStatus) => void): Promise<void>
  decide(context: DecideContext): Promise<Decision>
  /** One or two sentences after a tool ran: the card is on screen, the text is what the model read. */
  answerAfterTool(context: DecideContext & { tool: string; resultText: string }): Promise<string>
}
