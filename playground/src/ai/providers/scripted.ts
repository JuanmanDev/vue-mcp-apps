/**
 * No model at all: deterministic intent rules. Always available, so the demo
 * works on any device (and in CI). Labelled as what it is in the UI. Also the
 * fallback when a real model's reply cannot be used.
 */
import type { AiProvider, Decision, DecideContext, Turn } from '../types'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/\b\p{L}/gu, c => c.toUpperCase())
}

/** "in Oslo", "for New York", "weather Madrid" → the city. */
export function findCity(text: string): string | null {
  const stop = /\b(in|on|for|at|today|tomorrow|this|next|weekend|please|fahrenheit|celsius|°f|°c|degrees)\b/i
  const m = text.match(/\b(?:in|for|at)\s+([\p{L}][\p{L}\s.'-]{1,40})/u)
    ?? text.match(/\b(?:weather|forecast|temperature|tiempo|clima)\s+(?:of\s+)?([\p{L}][\p{L}\s.'-]{1,40})/iu)
  if (!m?.[1]) return null
  const words: string[] = []
  for (const w of m[1].split(/\s+/)) {
    if (!w || stop.test(w)) break
    words.push(w.replace(/[?.!,]+$/, ''))
    if (words.length === 3) break
  }
  return words.length ? titleCase(words.join(' ')) : null
}

function isoDate(text: string): string | null {
  const iso = text.match(/\b(20\d\d-\d\d-\d\d)\b/)
  if (iso) return iso[1]!
  const m = text.match(new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})\\b`, 'i'))
  if (!m) return null
  const month = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1
  return `2026-${String(month).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
}

/** "check-in Nov 3, 3 guests, add breakfast" → changes. */
export function findChanges(text: string): Array<{ field: string; from?: string; to: string }> {
  const changes: Array<{ field: string; from?: string; to: string }> = []
  const checkIn = text.match(/check[- ]?in[^,;.]*/i)
  const inDate = checkIn ? isoDate(checkIn[0]) : null
  if (inDate) changes.push({ field: 'Check-in', from: '2026-11-02', to: inDate })
  const checkOut = text.match(/check[- ]?out[^,;.]*/i)
  const outDate = checkOut ? isoDate(checkOut[0]) : null
  if (outDate) changes.push({ field: 'Check-out', from: '2026-11-06', to: outDate })
  const guests = text.match(/(\d+)\s*(guests|people|persons|adults|pax)/i)
  if (guests) changes.push({ field: 'Guests', from: '2', to: guests[1]! })
  if (/\bbreakfast\b/i.test(text)) changes.push({ field: 'Breakfast', from: 'No', to: /no breakfast|remove breakfast|without breakfast/i.test(text) ? 'No' : 'Yes' })
  if (/\bparking\b/i.test(text)) changes.push({ field: 'Parking', from: 'No', to: 'Yes' })
  const room = text.match(/\b(suite|double|single|twin)( room)?\b/i)
  if (room) changes.push({ field: 'Room', from: 'Double', to: titleCase(room[0]) })
  return changes
}

/** "Make a poll: tabs or spaces?" → question + options. */
export function findPoll(text: string): { question: string; options: string[] } | null {
  const body = text.split(/:\s*/).slice(1).join(': ').trim() || text.replace(/^.*?\bpoll\b\s*(about|on|for)?/i, '').trim()
  if (!body) return null
  const options = body.replace(/\?$/, '').split(/\s*(?:,|\bor\b|\bvs\.?\b|\/)\s*/i).map(o => o.trim()).filter(Boolean)
  if (options.length < 2) return null
  const q = body.charAt(0).toUpperCase() + body.slice(1)
  return { question: q.endsWith('?') ? q : `${q}?`, options: options.slice(0, 6).map(titleCase) }
}

function lastToolResult(turns: Turn[], tool: string): string | null {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i]!.role === 'tool' && turns[i]!.tool === tool) return turns[i]!.text
  return null
}

function packingAdvice(city: string, weather: string | null): string {
  const temp = Number(weather?.match(/(-?\d+)°([CF])/)?.[1] ?? NaN)
  const unit = weather?.match(/(-?\d+)°([CF])/)?.[2] ?? 'C'
  const celsius = unit === 'F' ? (temp - 32) * 5 / 9 : temp
  const wet = /rain|storm/i.test(weather ?? '')
  const snow = /snow/i.test(weather ?? '')
  const layers = Number.isNaN(celsius) ? 'layers you can add or remove'
    : celsius < 0 ? 'a warm coat, gloves, a hat and thermal layers'
      : celsius < 12 ? 'a warm jacket and a jumper'
        : celsius < 22 ? 'a light jacket and long sleeves'
          : 'light clothes, sunglasses and sunscreen'
  return `For ${city}, pack ${layers}${wet ? ', plus an umbrella and waterproof shoes' : ''}${snow ? ', plus boots with good grip' : ''}.`
}

export function scriptedDecision(context: DecideContext): Decision {
  const last = [...context.turns].reverse().find(t => t.role === 'user')
  const text = last?.text ?? ''
  const has = (name: string) => context.tools.some(t => t.name === name)

  // Card follow-ups first: they quote the card.
  const pack = text.match(/pack for ([\p{L}\s.'-]+?)(?: this| next|\?|$)/iu)
  if (pack) return { action: 'answer', text: packingAdvice(titleCase(pack[1]!), lastToolResult(context.turns, 'get_weather')) }
  const summary = text.match(/poll [“"](.+?)[”"] stands at (.+?)\./i)
  if (summary) {
    const scores = summary[2]!.split(/,\s*/).map(s => ({ label: s.replace(/\s+\d+$/, ''), votes: Number(s.match(/(\d+)$/)?.[1] ?? 0) }))
    const top = [...scores].sort((a, b) => b.votes - a.votes)[0]
    const total = scores.reduce((n, s) => n + s.votes, 0)
    return { action: 'answer', text: `Team update — “${summary[1]}”: ${top?.label} leads with ${top?.votes} of ${total} votes. Vote on the card if you haven't yet!` }
  }

  if (has('get_weather') && /\b(weather|forecast|temperature|rain|sunny|tiempo|clima)\b/i.test(text)) {
    const unit = /fahrenheit|°f|\bin f\b/i.test(text) ? 'F' : undefined
    return { action: 'call_tool', tool: 'get_weather', arguments: { city: findCity(text) ?? 'Madrid', ...(unit ? { unit } : {}) } }
  }
  if (has('show_poll') && /\b(poll|vote|survey|encuesta)\b/i.test(text)) {
    const poll = /\b(make|create|new|start)\b/i.test(text) ? findPoll(text) : null
    return { action: 'call_tool', tool: 'show_poll', arguments: poll ?? {} }
  }
  if (has('propose_changes') && /\b(change|update|modify|propose|move|booking|reservation)\b/i.test(text)) {
    const changes = findChanges(text)
    const ref = text.match(/#\s?(\w+)/)?.[1]
    return {
      action: 'call_tool',
      tool: 'propose_changes',
      arguments: {
        title: ref ? `Update booking #${ref}` : 'Update booking',
        summary: 'Requested in the chat.',
        changes: changes.length ? changes : [{ field: 'Check-in', from: '2026-11-02', to: '2026-11-03' }],
      },
    }
  }
  if (/^(hi|hello|hey|hola)\b/i.test(text)) return { action: 'answer', text: 'Hi! Ask me for the weather somewhere, a poll, or a change to booking #4821 — I answer with interactive cards.' }
  return {
    action: 'answer',
    text: 'I am the scripted demo assistant (no model). Try: “What’s the weather in Oslo?”, “Make a poll: tabs or spaces?”, or “Propose changing booking #4821: check-in Nov 3, 3 guests, add breakfast”.',
  }
}

export const scriptedProvider: AiProvider = {
  id: 'scripted',
  label: 'Scripted',
  blurb: 'No model: deterministic rules. Works everywhere, instantly.',
  async check() { return { state: 'ready' } },
  async load(onStatus) { onStatus({ state: 'ready' }) },
  async decide(context) { return scriptedDecision(context) },
  async answerAfterTool({ resultText, tool }) {
    if (tool === 'propose_changes') return 'Here is the proposal — nothing changes until you tick what you want and press Apply.'
    if (tool === 'show_poll') return 'Here is the poll. Vote on the card; the results update live.'
    return resultText
  },
}
