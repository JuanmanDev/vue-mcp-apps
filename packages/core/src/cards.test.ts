import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import {
  cardActionFor,
  cardTools,
  cardUri,
  clientSupportsMcpApps,
  defineCards,
  eventListenerProp,
  resultCard,
  resultText,
  safeLinkUrl,
  toPlain,
  MCP_APP_MIME,
  MCP_APPS_EXTENSION,
} from './index'

const cards = defineCards({
  'demo-card': {
    title: 'Demo',
    actions: {
      saved: { kind: 'tool', tool: 'save_thing' },
      opened: { kind: 'link' },
      cancelled: { kind: 'notify', fallback: 'Cancelled.' },
      asked: { kind: 'message' },
      noted: { kind: 'context' },
    },
  },
  'quiet-card': { title: 'Quiet' },
})

describe('defineCards', () => {
  it('freezes the manifest so nothing can widen what a card may ask for', () => {
    expect(Object.isFrozen(cards)).toBe(true)
    expect(Object.isFrozen(cards['demo-card'].actions)).toBe(true)
    expect(() => { (cards['demo-card'].actions as Record<string, unknown>).evil = { kind: 'tool', tool: 'drop_db' } }).toThrow()
  })

  it('refuses names that are not kebab-case with a dash', () => {
    expect(() => defineCards({ Weather: { title: 'x' } })).toThrow(/kebab-case/)
    expect(() => defineCards({ weather: { title: 'x' } })).toThrow(/kebab-case/)
  })

  it('refuses unknown action kinds and tool actions without a tool', () => {
    expect(() => defineCards({ 'a-b': { title: 'x', actions: { go: { kind: 'eval' } as never } } })).toThrow(/unknown action kind/)
    expect(() => defineCards({ 'a-b': { title: 'x', actions: { go: { kind: 'tool', tool: '' } } } })).toThrow(/names its tool/)
  })

  it('lists every tool any card may call', () => {
    expect(cardTools(cards)).toEqual(['save_thing'])
  })
})

describe('cardActionFor', () => {
  it('a tool action runs the DECLARED tool, whatever the card sends', () => {
    const action = cardActionFor(cards, 'demo-card', 'saved', [{ id: 1, tool: 'drop_db' }])
    expect(action).toEqual({ kind: 'tool', event: 'saved', tool: 'save_thing', args: { id: 1, tool: 'drop_db' } })
  })

  it('ignores events the manifest does not list, and unknown cards', () => {
    expect(cardActionFor(cards, 'demo-card', 'deleted', [{}])).toBeNull()
    expect(cardActionFor(cards, 'quiet-card', 'saved', [{}])).toBeNull()
    expect(cardActionFor(cards, 'other-card', 'saved', [{}])).toBeNull()
    // Inherited keys are not events.
    expect(cardActionFor(cards, 'demo-card', 'toString', [])).toBeNull()
  })

  it('tool args are a plain object or nothing', () => {
    expect(cardActionFor(cards, 'demo-card', 'saved', ['x'])).toMatchObject({ args: {} })
    expect(cardActionFor(cards, 'demo-card', 'saved', [[1, 2]])).toMatchObject({ args: {} })
  })

  it('tool args lose their reactivity (postMessage cannot clone a Vue proxy)', () => {
    const ids = ref(['a', 'b'])
    const state = reactive({ nested: { on: true } })
    const action = cardActionFor(cards, 'demo-card', 'saved', [{ ids: ids.value, state }])
    expect(() => structuredClone(action)).not.toThrow()
    expect(action).toMatchObject({ args: { ids: ['a', 'b'], state: { nested: { on: true } } } })
  })

  it('links are http(s) only', () => {
    expect(cardActionFor(cards, 'demo-card', 'opened', ['https://example.com/a'])).toEqual({ kind: 'link', event: 'opened', url: 'https://example.com/a' })
    expect(cardActionFor(cards, 'demo-card', 'opened', ['javascript:alert(1)'])).toBeNull()
    expect(cardActionFor(cards, 'demo-card', 'opened', ['data:text/html,<script>'])).toBeNull()
    expect(cardActionFor(cards, 'demo-card', 'opened', [42])).toBeNull()
  })

  it('notify uses the message or the fallback', () => {
    expect(cardActionFor(cards, 'demo-card', 'cancelled', [])).toMatchObject({ kind: 'notify', message: 'Cancelled.' })
    expect(cardActionFor(cards, 'demo-card', 'cancelled', ['Nope', { why: 1 }])).toMatchObject({ message: 'Nope', data: { why: 1 } })
  })

  it('message and context need text', () => {
    expect(cardActionFor(cards, 'demo-card', 'asked', ['  What now?  '])).toEqual({ kind: 'message', event: 'asked', text: 'What now?' })
    expect(cardActionFor(cards, 'demo-card', 'asked', [''])).toBeNull()
    expect(cardActionFor(cards, 'demo-card', 'noted', [{ a: 1 }])).toEqual({ kind: 'context', event: 'noted', text: '{"a":1}' })
  })
})

describe('helpers', () => {
  it('safeLinkUrl', () => {
    expect(safeLinkUrl('http://x.test')).toBe('http://x.test/')
    expect(safeLinkUrl('ftp://x.test')).toBeNull()
    expect(safeLinkUrl('not a url')).toBeNull()
  })

  it('resultCard reads structuredContent.card', () => {
    expect(resultCard({ structuredContent: { card: { name: 'demo-card', props: { a: 1 } } } })).toEqual({ name: 'demo-card', props: { a: 1 } })
    expect(resultCard({ structuredContent: { card: { name: 'demo-card', props: [1] } } })).toEqual({ name: 'demo-card', props: {} })
    expect(resultCard({ structuredContent: {} })).toBeNull()
    expect(resultCard(null)).toBeNull()
  })

  it('resultText joins text blocks', () => {
    expect(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] })).toBe('a\nb')
  })

  it('eventListenerProp', () => {
    expect(eventListenerProp('approved')).toBe('onApproved')
    expect(eventListenerProp('opened-in-lh')).toBe('onOpenedInLh')
    expect(eventListenerProp('openedInLh')).toBe('onOpenedInLh')
  })

  it('cardUri', () => {
    expect(cardUri('demo-card')).toBe('ui://cards/demo-card')
    expect(cardUri('demo-card', 'ui://acme/')).toBe('ui://acme/demo-card')
  })

  it('clientSupportsMcpApps', () => {
    expect(clientSupportsMcpApps({ extensions: { [MCP_APPS_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } })).toBe(true)
    expect(clientSupportsMcpApps({ experimental: { [MCP_APPS_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } })).toBe(true)
    expect(clientSupportsMcpApps({ extensions: { [MCP_APPS_EXTENSION]: {} } })).toBe(false)
    expect(clientSupportsMcpApps(undefined)).toBe(false)
  })

  it('toPlain', () => {
    expect(toPlain(undefined)).toBeUndefined()
    expect(toPlain({ d: new Date(0) })).toEqual({ d: '1970-01-01T00:00:00.000Z' })
  })
})
