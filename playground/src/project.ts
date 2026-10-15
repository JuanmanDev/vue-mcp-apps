/**
 * WHAT THE PLAYGROUND TESTS — the one file to change to point it at your cards.
 *
 *  - `manifest` + `components`: drawn natively in the "Native" pane, and their
 *    fixtures listed in the sidebar;
 *  - `createServer` + `bundle`: the in-browser MCP server (what the GitHub
 *    Pages demo runs; no backend). Leave `createServer` out to use only the
 *    "Remote server" mode;
 *  - `remoteUrl`: the default for "Remote server" (your server's /mcp).
 *
 * `bundle` is the built cards JSON. `npm run dev` rebuilds it on every save
 * (vite build --watch) and the playground reloads the sandboxed view.
 */
import type { Component } from 'vue'
import type { CardManifest } from '@vue-mcp-apps/core'
import { cards } from 'demo-cards/manifest'
import { components as demoComponents } from 'demo-cards/components'
import { createDemoServer } from 'demo-cards/server'
import bundle from 'demo-cards/cards.json'

export interface PlaygroundProject {
  name: string
  manifest: CardManifest
  components: Readonly<Record<string, Component>>
  /** Builds a fresh MCP server (SDK v2 `McpServer`) around the given bundle. */
  createServer?: (bundle: unknown) => { connect(transport: unknown): Promise<void> }
  bundle?: unknown
  remoteUrl: string
  /** Prompts for the "as the model" tool calls in the sidebar. */
  examples: Array<{ label: string; tool: string; args: Record<string, unknown> }>
}

export const project: PlaygroundProject = {
  name: 'demo-cards',
  manifest: cards,
  components: demoComponents,
  createServer: b => createDemoServer({ bundle: b }) as never,
  bundle,
  remoteUrl: 'http://localhost:3001/mcp',
  examples: [
    { label: 'Weather in Madrid', tool: 'get_weather', args: { city: 'Madrid' } },
    { label: 'Weather in Oslo (°F)', tool: 'get_weather', args: { city: 'Oslo', unit: 'F' } },
    {
      label: 'Propose booking changes',
      tool: 'propose_changes',
      args: {
        title: 'Update booking #4821',
        summary: 'The guest asked by email to change their stay.',
        changes: [
          { field: 'Check-in', from: '2026-11-02', to: '2026-11-03' },
          { field: 'Guests', from: '2', to: '3' },
          { field: 'Breakfast', from: 'No', to: 'Yes' },
        ],
      },
    },
    { label: 'Lunch poll', tool: 'show_poll', args: {} },
  ],
}

/** Swap in a freshly built bundle without a page reload (see main.ts). */
export function onBundleUpdate(callback: (bundle: unknown) => void): void {
  if (import.meta.hot) {
    import.meta.hot.accept('demo-cards/cards.json', (mod) => {
      if (mod) callback((mod as unknown as { default: unknown }).default)
    })
  }
}
