# The AI demo

The playground's home page (`#/`) is a chat whose assistant runs **in your browser** and uses the tools of the demo MCP server — which also runs in your browser. It shows MCP Apps the way a user meets them: you ask, a tool runs, an interactive card appears in the conversation, and your clicks on the card flow back to the assistant.

Code: `playground/src/ai/` (`types.ts`, `prompt.ts`, `agent.ts`, `providers/*.ts`) and the demo page in `playground/src/pages/`.

- [What happens in one turn](#what-happens-in-one-turn)
- [Providers](#providers)
- [The decision protocol](#the-decision-protocol)
- [Safety](#safety)
- [Cards in the chat](#cards-in-the-chat)
- [Adding a provider](#adding-a-provider)
- [Running it locally](#running-it-locally)
- [Limits of small models](#limits-of-small-models)

## What happens in one turn

```
you type ──▶ agent.send(text)
              │ turns + model-visible tools + notes from cards
              ▼
          provider.decide(context) ──▶ { action: 'call_tool', tool, arguments }   or   { action: 'answer', text }
              │  invalid / unknown tool / missing args → scripted rules answer, and the chat says so
              ▼
          host check: tool exists and its visibility includes "model"
              ▼
          tools/call on the MCP server  ──▶ result { content (text), structuredContent.card }
              ▼
          card in the chat: resources/read ui://cards/<name> → host → sandbox proxy → view   (or <McpCard> natively)
              ▼
          provider.answerAfterTool(context + tool text) ──▶ one or two sentences
```

Then the card is live:

- a **tool** button (`Refresh`, `Apply 2 of 3`, a vote) goes through the host's `oncalltool` check and may swap the card;
- a **message** button (`Ask what to pack`, `Summarise for the team`) posts `ui/message` → it becomes the next user turn (`fromCard: true`) and the assistant answers it;
- a **context** action (rejecting the approval card) posts `ui/update-model-context` → the text is added to `modelContext` and the model reads it on its next turn ("Notes from cards the user interacted with").

## Providers

| Id | Label | Runs | Needs | Notes |
| --- | --- | --- | --- | --- |
| `chrome` | Chrome built-in AI | Gemini Nano, on-device, via the Prompt API (`LanguageModel` global) | Desktop Chrome with built-in AI available; the model downloads once (Chrome manages it) | Auto-selected on load when `LanguageModel.availability()` is `"available"`. Uses `responseConstraint` (JSON Schema) for structured output. |
| `webllm` | WebLLM (WebGPU) | An open model compiled to WebGPU, in a Web Worker | WebGPU; ~1–2 GB of disk and VRAM | Models: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (default, ~1.6 GB VRAM), `Llama-3.2-1B-Instruct-q4f16_1-MLC` (~0.9 GB), `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (~0.9 GB). Downloaded to Cache Storage on first load (explicit click), then instant. `response_format: { type: 'json_object', schema }`. |
| `openai` | OpenAI-compatible | Any `/v1/chat/completions` endpoint with tool calling | Base URL, model, optional key | Defaults: `http://localhost:11434/v1`, `qwen2.5:3b` (Ollama). Uses native `tools` + `tool_choice: 'auto'`. The key lives in the tab's memory only. |
| `scripted` | Scripted | Deterministic intent rules | nothing | Always available; the default when nothing else is (e.g. GitHub Pages on a browser without built-in AI). Also the fallback for unusable model replies. Labelled honestly in the UI. |

Status states (`ProviderState`): `unavailable`, `downloadable`, `downloading`, `loading`, `ready`, `error`, with an optional `progress` (0..1) shown in the side panel.

### Enabling Chrome's built-in AI

Recent desktop Chrome ships the Prompt API. If `LanguageModel` is missing or reports `unavailable`, check `chrome://on-device-internals` (model status) and Chrome's built-in AI documentation for your version's flags and hardware requirements. The first `create()` triggers the download; the side panel shows its progress.

### Ollama / LM Studio

```bash
# Ollama: allow the page's origin, then pull a model with tool calling
OLLAMA_ORIGINS="http://localhost:5173,https://juanmandev.github.io" ollama serve
ollama pull qwen2.5:3b
# LM Studio: start the local server (http://localhost:1234/v1) and enable CORS in its settings
```

## The decision protocol

Models without native tool calling (Gemini Nano, small WebLLM models) answer **one JSON object**, constrained by a JSON Schema built from the model-visible tools (`decisionSchema(tools)` in `prompt.ts`):

```json
{
  "type": "object",
  "properties": {
    "action": { "type": "string", "enum": ["call_tool", "answer"] },
    "tool": { "type": "string", "enum": ["get_weather", "propose_changes", "show_poll"] },
    "arguments": { "type": "object" },
    "text": { "type": "string" }
  },
  "required": ["action"],
  "additionalProperties": false
}
```

Valid replies:

```json
{"action":"call_tool","tool":"get_weather","arguments":{"city":"Oslo","unit":"F"}}
{"action":"answer","text":"Pack a warm coat and waterproof boots."}
```

After a tool runs, `afterToolPrompt` asks for `{"text": "…"}` (`ANSWER_SCHEMA`): one or two sentences about the card, without repeating every number.

### The prompt

`systemPrompt(tools)` lists each tool as a compact signature (`toolSignature`: `get_weather(city: string, unit?: "C" | "F") — description`) plus short rules (when to call which tool, the shape of `propose_changes` and `show_poll` arguments, answer length) and **few-shot examples** — one per offered tool (`USER: weather in Paris → {"action":"call_tool",…}`). `transcript(context)` renders the last 8 turns as text — `USER:`, `USER (clicked a button on a card):`, `ASSISTANT:`, `TOOL <name> RESULT:` — preceded by up to three notes from cards, and ends with *Decide for the LAST user message only: "…"*. Small models follow one block of text better than many short chat turns.

After a tool ran, `afterToolTranscript` sends **only** the latest request and the tool result — with the whole transcript, a 1.5 B model kept re-describing the previous card.

### Argument repair

Small models often pick the right tool but drop arguments (`"Make a poll: cats or dogs?"` → `show_poll({"question": …})` without `options`). When the scripted rules reach the **same** tool and found arguments the model left out, the agent fills them in (`repairArguments` in `agent.ts`) and says so in the chat: *"WebLLM (WebGPU) left out options — filled from your message."* It never changes the tool the model chose, and it never adds a tool call the model did not make.

### Validation (`parseDecision`)

1. Take the outermost `{…}` (models sometimes add prose or code fences — `extractJson`).
2. `answer` needs non-empty `text`.
3. `call_tool` needs a tool **from the model-visible list** and every `required` argument of its input schema.
4. Anything else throws `DecisionError` → the agent notes *"unusable reply (…) — the scripted rules answer instead"* and uses `scriptedDecision`.

The server validates arguments again (zod), and the host re-checks visibility before calling.

## Safety

- **The model sees only model-visible tools.** `modelTools()` filters on `_meta.ui.visibility` including `"model"`; `apply_changes` and `cast_vote` (`visibility: ['app']`) are never offered to it, and the host refuses them if a model names them anyway.
- **Card-only tools need a human click.** The approval card's *Apply* runs `apply_changes` because the manifest maps `approved → apply_changes`; the host's `oncalltool` allows it because its visibility includes `"app"`. Turn off *Auto-approve tool calls from cards* in the workbench to confirm each one.
- **Cards cannot widen their powers.** Whatever a card emits, a tool action runs the declared tool.
- **Everything stays in the browser** for the Chrome, WebLLM and Scripted providers. The OpenAI-compatible provider sends the conversation to the endpoint you typed, and only there; its key is held in memory and never stored.
- **Cards run sandboxed.** In MCP App mode each card is the real three-layer setup (other-origin proxy, `srcdoc` view, CSP from `_meta.ui.csp`).

## Cards in the chat

Each tool call that returns a card adds a chat item `{ role: 'card', card: { tool, args, result, uri, template } }`. The demo renders it:

- **MCP App** (default): an `AppViewHost` (`playground/src/lib/sandboxHost.ts`) per card — official `AppBridge`, sandbox proxy, `tool-input` then `tool-result`; its `onmessage` / `onupdatemodelcontext` are wired to `agent.send(text, { fromCard: true })` / `agent.addModelContext(text)`.
- **Native**: `<McpCard>` with the same result; `message` / `context` actions are wired the same way.

Toggle *Cards as: MCP App | Native* to compare. The side panel's mini log shows the same JSON-RPC messages as the workbench inspector.

## Adding a provider

Implement `AiProvider` (`playground/src/ai/types.ts`) and register it in `PROVIDERS` (`agent.ts`):

```ts
import type { AiProvider } from '../types'
import { afterToolPrompt, ANSWER_SCHEMA, decisionSchema, parseAnswer, parseDecision, systemPrompt, transcript } from '../prompt'

export const myProvider: AiProvider = {
  id: 'mine' as never,             // add the id to ProviderId
  label: 'My model',
  blurb: 'Where it runs and what it costs, in one line.',
  async check() { return { state: 'downloadable' } },            // cheap; never downloads
  async load(onStatus) { onStatus({ state: 'loading' }); /* … */ onStatus({ state: 'ready' }) },
  async decide(context) {
    const raw = await myModel.generate(systemPrompt(context.tools), transcript(context), decisionSchema(context.tools))
    return parseDecision(raw, context.tools)                       // throws DecisionError → scripted fallback
  },
  async answerAfterTool(context) {
    const raw = await myModel.generate('', `${transcript(context)}\n${afterToolPrompt(context.tool, context.resultText)}`, ANSWER_SCHEMA)
    return parseAnswer(raw)
  },
}
```

A provider never touches MCP, the host or a card: it only turns text into a `Decision`.

## Running it locally

```bash
npm install
npm run dev                         # http://localhost:5173  (#/ = AI demo)
```

- Use `http://localhost:5173`, not `127.0.0.1` (the proxy needs the other one).
- WebLLM: click *Load* on the provider; the first download takes minutes; later loads come from cache.
- To point the demo at your own server, edit `playground/src/project.ts` — the assistant uses whatever model-visible tools the server lists. Good tool `description`s matter more than anything else for small models.

## Verified runs (2026-10-15, AMD RDNA 3 GPU, Chrome, production build)

| Provider / model | Prompt | Tool call | Notes |
| --- | --- | --- | --- |
| WebLLM · Qwen2.5-1.5B-Instruct (load from cache ≈ 2 s, first download ≈ 20 s on a fast line) | What is the weather in Tokyo? | `get_weather({"city":"Tokyo"})` | ~7 s per turn; answer quoted the result correctly |
| WebLLM · Qwen2.5-1.5B-Instruct | Make a poll: cats or dogs? | `show_poll` — model wrote the question, rules filled `options` | Card: *Which is your favorite, cats or dogs?* |
| WebLLM · Qwen2.5-1.5B-Instruct | Propose changing booking #77: 4 guests and add parking | `propose_changes` with both changes | Approve on the card |
| Ollama · qwen3.5:9b (OpenAI-compatible, native tools) | What is the weather like in Lisbon? Use Fahrenheit. | `get_weather({"city":"Lisbon","unit":"F"})` | ~35 s cold start |
| Chrome built-in AI | — | — | Covered by an e2e test with a mocked `LanguageModel` (same API shape); the real model was not available on the test machine |

## Limits of small models

- 0.5–1.5 B models confuse arguments (e.g. put the whole sentence in `city`). Schemas, enums and short descriptions help; the scripted fallback catches the rest.
- Gemini Nano has a small context: the transcript keeps 8 turns and 3 card notes.
- Answers after a tool are deliberately short; the card carries the data.
- The scripted provider recognises the demo's intents only (weather, polls, booking changes, the cards' messages). It exists so the demo never dead-ends, not as an assistant.
