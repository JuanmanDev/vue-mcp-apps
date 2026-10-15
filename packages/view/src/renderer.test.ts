// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { defineCards, type CardAction } from '@vue-mcp-apps/core'
import { CardRenderer } from './renderer'
import { McpCard } from './McpCard'
import { useCardHost } from './context'

const cards = defineCards({
  'button-card': {
    title: 'Button',
    actions: {
      saved: { kind: 'tool', tool: 'save_thing' },
      opened: { kind: 'link' },
    },
  },
})

/** A card that emits whatever we tell it to, and shows where it is drawn. */
const ButtonCard = defineComponent({
  props: { label: String },
  emits: ['saved', 'opened', 'deleted'],
  setup(props, { emit, expose }) {
    const host = useCardHost()
    expose({ emit })
    return () => h('button', { 'data-mode': host.mode }, props.label)
  },
})

function mount(component: Parameters<typeof createApp>[0]) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(component)
  app.mount(el)
  return { el, app }
}

describe('CardRenderer', () => {
  it('passes props and turns listed events into actions — with the declared tool', async () => {
    const actions: CardAction[] = []
    const card = ref<{ emit: (...a: unknown[]) => void } | null>(null)
    const { el } = mount(() => h(CardRenderer, {
      manifest: cards,
      components: { 'button-card': ButtonCard },
      name: 'button-card',
      cardProps: { label: 'Save', ref: card },
      onAction: (a: CardAction) => actions.push(a),
    }))
    await nextTick()
    expect(el.querySelector('button')?.textContent).toBe('Save')
    card.value!.emit('saved', { id: 7 })
    card.value!.emit('deleted', { id: 7 })
    card.value!.emit('opened', 'javascript:alert(1)')
    card.value!.emit('opened', 'https://example.com/')
    expect(actions).toEqual([
      { kind: 'tool', event: 'saved', tool: 'save_thing', args: { id: 7 } },
      { kind: 'link', event: 'opened', url: 'https://example.com/' },
    ])
  })

  it('says so for an unknown card', async () => {
    const { el } = mount(() => h(CardRenderer, { manifest: cards, components: {}, name: 'nope-card' }))
    await nextTick()
    expect(el.textContent).toContain('Unknown card "nope-card"')
  })
})

describe('McpCard (native host)', () => {
  it('draws the card a tool result carries, in native mode', async () => {
    const { el } = mount(() => h(McpCard, {
      manifest: cards,
      components: { 'button-card': ButtonCard },
      result: { content: [], structuredContent: { card: { name: 'button-card', props: { label: 'Hi' } } } },
    }))
    await nextTick()
    const button = el.querySelector('button')!
    expect(button.textContent).toBe('Hi')
    expect(button.dataset.mode).toBe('native')
  })
})
