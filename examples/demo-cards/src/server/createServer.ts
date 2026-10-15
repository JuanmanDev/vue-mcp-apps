/**
 * The demo MCP server — isomorphic: the same code runs on stdio and HTTP (Node)
 * and inside the playground's browser tab (in-memory transport), which is how
 * the GitHub Pages demo works without a backend.
 *
 * Five tools, three cards:
 *   get_weather      → weather-card      (model + the card's Refresh button)
 *   propose_changes  → approval-card     (model)
 *   apply_changes    → approval-card     (ONLY the card: visibility ['app'])
 *   show_poll        → poll-card         (model)
 *   cast_vote        → poll-card         (ONLY the card)
 */
import { McpServer } from '@modelcontextprotocol/server'
import { createCardServerKit } from '@vue-mcp-apps/server'
import { z } from 'zod'
import { cards } from '../manifest'

type Change = { id: string; field: string; from?: string; to: string }
type Poll = { question: string; options: Array<{ id: string; label: string; votes: number }> }

/** What the tools remember. Share one store across requests on a stateless HTTP endpoint. */
export interface DemoStore {
  proposals: Map<string, { title: string; summary?: string; changes: Change[] }>
  polls: Map<string, Poll>
}

export function createDemoStore(): DemoStore {
  const polls = new Map<string, Poll>()
  polls.set('lunch', structuredClone(cards['poll-card'].fixtures!.lunch as Poll))
  return { proposals: new Map(), polls }
}

export interface DemoServerOptions {
  /** The parsed dist/cards.json; null runs text-only (no templates). */
  bundle: unknown
  /** Default: a fresh store per server instance. */
  store?: DemoStore
}

type Condition = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow'
const CONDITIONS: Condition[] = ['sunny', 'cloudy', 'rain', 'storm', 'snow']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Deterministic fake weather: same city + same hour → same numbers. No network. */
function fakeWeather(city: string, unit: 'C' | 'F') {
  let seed = [...`${city.toLowerCase()}|${new Date().toISOString().slice(0, 13)}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  const toUnit = (c: number) => Math.round(unit === 'F' ? c * 9 / 5 + 32 : c)
  const base = Math.round(rnd() * 30) - 3
  const today = new Date().getDay()
  return {
    city,
    unit,
    current: { temp: toUnit(base), condition: CONDITIONS[Math.floor(rnd() * 5)]!, humidity: 30 + Math.round(rnd() * 60), wind: Math.round(rnd() * 35) },
    forecast: [1, 2, 3].map(i => {
      const min = base - 4 + Math.round(rnd() * 4)
      return { day: DAYS[(today + i) % 7]!, min: toUnit(min), max: toUnit(min + 4 + Math.round(rnd() * 6)), condition: CONDITIONS[Math.floor(rnd() * 5)]! }
    }),
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(city.replace(/ /g, '_'))}`,
  }
}

export function createDemoServer(options: DemoServerOptions): McpServer {
  const server = new McpServer({ name: 'vue-mcp-apps-demo', version: '0.1.0' })
  const kit = createCardServerKit({ manifest: cards, bundle: options.bundle })
  kit.registerResources(server)

  const { proposals, polls } = options.store ?? createDemoStore()

  kit.registerTool(server, 'get_weather', {
    card: 'weather-card',
    title: 'Get weather',
    description: 'Current weather and a 3-day forecast for a city, shown as an interactive card.',
    inputSchema: z.object({
      city: z.string().describe('City name, e.g. "Madrid"'),
      unit: z.enum(['C', 'F']).optional().describe('Temperature unit (default C)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ city, unit }: { city: string; unit?: 'C' | 'F' }) => {
    const w = fakeWeather(city, unit ?? 'C')
    return kit.result('weather-card', w, `${city}: ${w.current.temp}°${w.unit}, ${w.current.condition}. Next days: ${w.forecast.map(d => `${d.day} ${d.min}–${d.max}°`).join(', ')}.`)
  })

  kit.registerTool(server, 'propose_changes', {
    card: 'approval-card',
    title: 'Propose changes',
    description: 'Show the user a list of changes to approve. Nothing is applied until the user clicks Apply on the card.',
    inputSchema: z.object({
      title: z.string(),
      summary: z.string().optional(),
      changes: z.array(z.object({ field: z.string(), from: z.string().optional(), to: z.string() })).min(1),
    }),
  }, async ({ title, summary, changes }: { title: string; summary?: string; changes: Array<{ field: string; from?: string; to: string }> }) => {
    const id = `p${proposals.size + 1}`
    const withIds = changes.map((c, i) => ({ id: `c${i + 1}`, ...c }))
    proposals.set(id, { title, summary, changes: withIds })
    return kit.result('approval-card', { id, title, summary, status: 'pending', changes: withIds },
      `Proposed ${changes.length} change(s) to "${title}". Waiting for the user to approve them on the card — nothing is applied yet.`)
  })

  kit.registerTool(server, 'apply_changes', {
    card: 'approval-card',
    visibility: ['app'],
    title: 'Apply approved changes',
    description: 'Apply the changes the user approved on the card. Only the card can call this.',
    inputSchema: z.object({ proposal: z.string(), ids: z.array(z.string()).min(1) }),
  }, async ({ proposal, ids }: { proposal: string; ids: string[] }) => {
    const found = proposals.get(proposal)
    if (!found) return { isError: true, content: [{ type: 'text' as const, text: `No proposal "${proposal}".` }] }
    const applied = found.changes.filter(c => ids.includes(c.id)).map(c => c.id)
    return kit.result('approval-card', { id: proposal, ...found, status: 'applied', applied },
      `Applied ${applied.length} of ${found.changes.length} change(s) to "${found.title}".`)
  })

  kit.registerTool(server, 'show_poll', {
    card: 'poll-card',
    title: 'Show poll',
    description: 'Show a poll the user can vote in. Without arguments shows the current lunch poll.',
    inputSchema: z.object({
      question: z.string().optional(),
      options: z.array(z.string()).min(2).max(6).optional(),
    }),
  }, async ({ question, options }: { question?: string; options?: string[] }) => {
    let id = 'lunch'
    if (question && options) {
      id = `poll${polls.size + 1}`
      polls.set(id, { question, options: options.map((label, i) => ({ id: `o${i + 1}`, label, votes: 0 })) })
    }
    const poll = polls.get(id)!
    return kit.result('poll-card', { id, ...poll }, `Poll "${poll.question}": ${poll.options.map(o => `${o.label} ${o.votes}`).join(', ')}.`)
  })

  kit.registerTool(server, 'cast_vote', {
    card: 'poll-card',
    visibility: ['app'],
    title: 'Cast vote',
    description: 'Record the user’s vote. Only the card can call this.',
    inputSchema: z.object({ poll: z.string(), option: z.string() }),
  }, async ({ poll, option }: { poll: string; option: string }) => {
    const found = polls.get(poll)
    const choice = found?.options.find(o => o.id === option)
    if (!found || !choice) return { isError: true, content: [{ type: 'text' as const, text: 'Unknown poll or option.' }] }
    choice.votes += 1
    return kit.result('poll-card', { id: poll, ...found, voted: option }, `Voted "${choice.label}". Now: ${found.options.map(o => `${o.label} ${o.votes}`).join(', ')}.`)
  })

  return server
}
