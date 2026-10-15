/**
 * What a card may know about where it is drawn — read-only, the same shape in
 * every host. A card never gets a way to call a tool from here: what its
 * buttons do is the manifest's business (`@vue-mcp-apps/core` → `defineCards`).
 */
import { inject, provide, readonly, ref, type InjectionKey, type Ref } from 'vue'
import type { HostContext } from '@vue-mcp-apps/core'

export type CardHostMode = 'native' | 'mcp-app'

export interface CardHostState {
  /** `native`: mounted straight into a Vue page. `mcp-app`: inside a host's sandboxed iframe. */
  mode: CardHostMode
  /** Theme, locale, display mode, container size… (MCP Apps `hostContext`; a native host passes its own). */
  hostContext: Readonly<Ref<HostContext>>
  /** The arguments the model called the tool with — final once `ui/notifications/tool-input` arrived. */
  toolInput: Readonly<Ref<Record<string, unknown> | null>>
  /** True while the model is still streaming the arguments (`tool-input-partial`). */
  streaming: Readonly<Ref<boolean>>
  /** True while one of this card's tool actions is running. */
  busy: Readonly<Ref<boolean>>
}

const KEY: InjectionKey<CardHostState> = Symbol('vue-mcp-apps:card-host')

export interface CardHostRefs {
  mode: CardHostMode
  hostContext: Ref<HostContext>
  toolInput: Ref<Record<string, unknown> | null>
  streaming: Ref<boolean>
  busy: Ref<boolean>
}

export function createCardHostRefs(mode: CardHostMode, hostContext: HostContext = {}): CardHostRefs {
  return {
    mode,
    hostContext: ref(hostContext) as Ref<HostContext>,
    toolInput: ref(null) as Ref<Record<string, unknown> | null>,
    streaming: ref(false),
    busy: ref(false),
  }
}

export function provideCardHost(refs: CardHostRefs): void {
  provide(KEY, {
    mode: refs.mode,
    hostContext: readonly(refs.hostContext) as Readonly<Ref<HostContext>>,
    toolInput: readonly(refs.toolInput) as Readonly<Ref<Record<string, unknown> | null>>,
    streaming: readonly(refs.streaming),
    busy: readonly(refs.busy),
  })
}

/** Inside a card: where am I drawn? Outside any host (a plain page, a test) answers `native` with empty refs. */
export function useCardHost(): CardHostState {
  return inject(KEY, () => {
    const refs = createCardHostRefs('native')
    return { ...refs, hostContext: readonly(refs.hostContext), toolInput: readonly(refs.toolInput), streaming: readonly(refs.streaming), busy: readonly(refs.busy) } as CardHostState
  }, true)
}
