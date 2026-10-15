/**
 * `<CardRenderer>` — draws one card component and turns its Vue events into
 * `CardAction`s through the manifest. Every host uses it: the MCP App shell
 * inside the iframe and `<McpCard>` in a native page, so a click means the
 * same thing in both.
 */
import { defineComponent, h, type Component, type PropType } from 'vue'
import { cardActionFor, eventListenerProp, type CardAction, type CardManifest } from '@vue-mcp-apps/core'

export type CardComponents = Readonly<Record<string, Component>>

export const CardRenderer = defineComponent({
  name: 'CardRenderer',
  props: {
    manifest: { type: Object as PropType<CardManifest>, required: true },
    components: { type: Object as PropType<CardComponents>, required: true },
    name: { type: String, required: true },
    cardProps: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
  },
  emits: {
    action: (_action: CardAction) => true,
  },
  setup(props, { emit }) {
    return () => {
      const component = props.components[props.name]
      const spec = props.manifest[props.name]
      if (!component || !spec) {
        return h('p', { class: 'vma-unknown', role: 'alert' }, `Unknown card "${props.name}".`)
      }
      // One listener per event the manifest lists; anything else the card emits goes nowhere.
      const listeners: Record<string, (...args: unknown[]) => void> = {}
      for (const event of Object.keys(spec.actions ?? {})) {
        listeners[eventListenerProp(event)] = (...args: unknown[]) => {
          const action = cardActionFor(props.manifest, props.name, event, args)
          if (action) emit('action', action)
        }
      }
      return h(component, { ...props.cardProps, ...listeners })
    }
  },
})
