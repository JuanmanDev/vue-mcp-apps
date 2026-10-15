import { describe, expect, it } from 'vitest'
import { decisionSchema, extractJson, parseAnswer, parseDecision, systemPrompt, toolSignature, DecisionError } from './prompt'
import { findChanges, findCity, findPoll, scriptedDecision } from './providers/scripted'
import type { ToolSpec } from './types'

const tools: ToolSpec[] = [
  { name: 'get_weather', description: 'Weather', inputSchema: { type: 'object', properties: { city: { type: 'string' }, unit: { type: 'string', enum: ['C', 'F'] } }, required: ['city'] } },
  { name: 'show_poll', description: 'Poll', inputSchema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } } } },
  { name: 'propose_changes', description: 'Changes', inputSchema: { type: 'object', properties: { title: { type: 'string' }, changes: { type: 'array' } }, required: ['title', 'changes'] } },
]

describe('decision protocol', () => {
  it('describes tools compactly', () => {
    expect(toolSignature(tools[0]!)).toBe('get_weather(city: string, unit?: "C" | "F")')
    expect(systemPrompt(tools)).toContain('show_poll(question?: string, options?: string[])')
  })

  it('constrains the tool to the tools the model may call', () => {
    const schema = decisionSchema(tools) as { properties: { tool: { enum: string[] } } }
    expect(schema.properties.tool.enum).toEqual(['get_weather', 'show_poll', 'propose_changes'])
  })

  it('accepts valid decisions, even wrapped in prose or fences', () => {
    expect(parseDecision('```json\n{"action":"call_tool","tool":"get_weather","arguments":{"city":"Oslo"}}\n```', tools))
      .toEqual({ action: 'call_tool', tool: 'get_weather', arguments: { city: 'Oslo' } })
    expect(parseDecision('Sure! {"action":"answer","text":" Hi "}', tools)).toEqual({ action: 'answer', text: 'Hi' })
  })

  it('refuses unknown tools, missing required arguments and junk', () => {
    expect(() => parseDecision('{"action":"call_tool","tool":"apply_changes","arguments":{}}', tools)).toThrow(DecisionError)
    expect(() => parseDecision('{"action":"call_tool","tool":"get_weather","arguments":{}}', tools)).toThrow(/missing city/)
    expect(() => parseDecision('no json here', tools)).toThrow(/not JSON/)
    expect(() => parseDecision('{"action":"answer"}', tools)).toThrow(/without text/)
  })

  it('answers', () => {
    expect(parseAnswer('{"text":"Done."}')).toBe('Done.')
    expect(parseAnswer('Plain text.')).toBe('Plain text.')
    expect(extractJson('x {"a":1} y')).toBe('{"a":1}')
  })
})

describe('scripted intents', () => {
  it('finds cities', () => {
    expect(findCity('What’s the weather in Oslo?')).toBe('Oslo')
    expect(findCity('weather in new york tomorrow')).toBe('New York')
    expect(findCity('Weather in Madrid in Fahrenheit')).toBe('Madrid')
    expect(findCity('hello')).toBeNull()
  })

  it('finds booking changes', () => {
    expect(findChanges('check-in Nov 3, 3 guests, add breakfast')).toEqual([
      { field: 'Check-in', from: '2026-11-02', to: '2026-11-03' },
      { field: 'Guests', from: '2', to: '3' },
      { field: 'Breakfast', from: 'No', to: 'Yes' },
    ])
  })

  it('finds polls', () => {
    expect(findPoll('Make a poll: tabs or spaces?')).toEqual({ question: 'Tabs or spaces?', options: ['Tabs', 'Spaces'] })
    expect(findPoll('Make a poll: pizza, sushi or tacos?')?.options).toEqual(['Pizza', 'Sushi', 'Tacos'])
  })

  it('decides', () => {
    const decide = (text: string) => scriptedDecision({ turns: [{ role: 'user', text }], tools, modelContext: [] })
    expect(decide('Weather in Madrid in Fahrenheit')).toEqual({ action: 'call_tool', tool: 'get_weather', arguments: { city: 'Madrid', unit: 'F' } })
    expect(decide('Show the lunch poll')).toEqual({ action: 'call_tool', tool: 'show_poll', arguments: {} })
    expect(decide('Propose changing booking #4821: 3 guests')).toMatchObject({ tool: 'propose_changes', arguments: { title: 'Update booking #4821' } })
    expect(decide('What should I pack for Oslo this weekend?')).toMatchObject({ action: 'answer' })
    expect(decide('tell me a joke')).toMatchObject({ action: 'answer' })
  })

  it('never calls a tool the model may not call', () => {
    const decision = scriptedDecision({ turns: [{ role: 'user', text: 'What is the weather in Oslo?' }], tools: [], modelContext: [] })
    expect(decision.action).toBe('answer')
  })
})
