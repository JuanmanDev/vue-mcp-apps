/**
 * What the workbench does, independent of its panes:
 *
 *  - `runTool`: play the MODEL calling a tool — the host reads the tool's `ui://`
 *    template, frames it (3 layers), streams the arguments
 *    (`tool-input-partial`), sends `tool-input`, calls the server and hands the
 *    result to both panes (`tool-result` for the sandbox, props for native);
 *  - `renderFixture`: skip the server — draw a card from the manifest's
 *    fixtures (or edited props) in both panes;
 *  - `callFromCard`: a native card's click, through the same host policy as a
 *    sandboxed one.
 */
import { shallowRef } from 'vue'
import { cardUri, type CallToolResult, type HostContext } from '@vue-mcp-apps/core'
import { callTool, readResource } from './connection'
import { findTool, log, state, toolResourceUri, toolVisibility, type StylePreset } from './store'
import type { AppViewHost } from './sandboxHost'

/** The host's design tokens, as MCP Apps style variables (`hostContext.styles.variables`). */
export const STYLE_PRESETS: Record<StylePreset, { label: string; light: Record<string, string>; dark: Record<string, string> }> = {
  none: { label: 'None (card’s own theme)', light: {}, dark: {} },
  warm: {
    label: 'Warm paper',
    light: {
      '--color-background-primary': '#faf9f5', '--color-background-secondary': '#f0eee6', '--color-background-tertiary': '#e8e6dc',
      '--color-text-primary': '#141413', '--color-text-secondary': '#3d3d3a', '--color-text-tertiary': '#73726c',
      '--color-border-primary': '#dedcd1', '--color-border-secondary': '#e8e6dc', '--font-sans': 'Georgia, "Times New Roman", serif',
    },
    dark: {
      '--color-background-primary': '#262624', '--color-background-secondary': '#30302e', '--color-background-tertiary': '#3a3a37',
      '--color-text-primary': '#faf9f5', '--color-text-secondary': '#c2c0b6', '--color-text-tertiary': '#9c9a92',
      '--color-border-primary': '#4a4a46', '--color-border-secondary': '#3a3a37', '--font-sans': 'Georgia, "Times New Roman", serif',
    },
  },
  ocean: {
    label: 'Ocean',
    light: {
      '--color-background-primary': '#f4f9fd', '--color-background-secondary': '#e3f0fa', '--color-background-tertiary': '#d2e6f6',
      '--color-text-primary': '#0b2540', '--color-text-secondary': '#24435f', '--color-text-tertiary': '#4f6b85',
      '--color-border-primary': '#bcd6ec', '--color-border-secondary': '#d2e6f6',
    },
    dark: {
      '--color-background-primary': '#0b1a2a', '--color-background-secondary': '#11263b', '--color-background-tertiary': '#18324c',
      '--color-text-primary': '#e6f1fb', '--color-text-secondary': '#b5cde3', '--color-text-tertiary': '#86a3bf',
      '--color-border-primary': '#24435f', '--color-border-secondary': '#18324c',
    },
  },
  mono: {
    label: 'Monochrome',
    light: { '--color-background-primary': '#ffffff', '--color-text-primary': '#000000', '--color-border-primary': '#000000', '--font-sans': 'ui-monospace, Menlo, Consolas, monospace', '--border-radius-sm': '0px' },
    dark: { '--color-background-primary': '#000000', '--color-text-primary': '#ffffff', '--color-border-primary': '#ffffff', '--font-sans': 'ui-monospace, Menlo, Consolas, monospace', '--border-radius-sm': '0px' },
  },
}

export function styleVariables(): Record<string, string> {
  const preset = STYLE_PRESETS[state.host.stylePreset]
  return state.host.theme === 'dark' ? preset.dark : preset.light
}

/** The host context the playground sends — the same object for both panes. */
export function hostContext(): HostContext {
  const variables = styleVariables()
  const tool = findTool(state.run.tool)
  return plain({
    theme: state.host.theme,
    locale: state.host.locale,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    displayMode: state.host.displayMode,
    availableDisplayModes: ['inline', 'fullscreen'],
    platform: 'web',
    userAgent: 'vue-mcp-apps-playground',
    deviceCapabilities: { touch: false, hover: true },
    containerDimensions: { maxHeight: 2000, width: 640 },
    ...(Object.keys(variables).length ? { styles: { variables } } : {}),
    ...(tool ? { toolInfo: { tool: { name: tool.name, description: tool.description, inputSchema: tool.inputSchema ?? {} } } } : {}),
  })
}

/** The sandboxed view currently on screen (SandboxPane owns it). */
export const activeView = shallowRef<AppViewHost | null>(null)

/** The template the sandbox pane should load next. */
export const pendingTemplate = shallowRef<{ html: string; meta: Record<string, unknown> } | null>(null)

/** postMessage clones its payload: Vue's reactive proxies cannot be cloned. Send plain JSON. */
export function plain<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function loadTemplate(uri: string): Promise<boolean> {
  state.run.resourceUri = uri
  if (!uri) {
    pendingTemplate.value = null
    state.run.viewKey++
    return false
  }
  try {
    const template = await readResource(uri)
    log({ direction: 'host', layer: 'host', method: 'resources/read', summary: `${uri} — ${template.html.length} chars`, data: { uri, meta: template.meta } })
    pendingTemplate.value = template
    state.run.viewKey++
    return true
  } catch (error) {
    pendingTemplate.value = null
    state.run.viewKey++
    log({ direction: 'host', layer: 'host', method: 'resources/read failed', summary: `${uri}: ${error instanceof Error ? error.message : String(error)}`, data: String(error), tone: 'warning' })
    return false
  }
}

async function viewReady(): Promise<AppViewHost | null> {
  // The pane creates the view on the next tick.
  for (let i = 0; i < 20 && !activeView.value; i++) await sleep(25)
  const view = activeView.value
  if (!view) return null
  const timeout = sleep(10_000).then(() => 'timeout' as const)
  const outcome = await Promise.race([view.whenReady().then(() => 'ready' as const), timeout])
  if (outcome === 'timeout') {
    log({ direction: 'host', layer: 'host', method: 'view not ready', summary: 'No ui/notifications/initialized after 10 s — is the template an MCP App?', data: null, tone: 'error' })
    return null
  }
  return view
}

/** Play the model: call `name` with `args`, the way a host does it. */
export async function runTool(name: string, args: Record<string, unknown>, label = ''): Promise<void> {
  const tool = findTool(name)
  if (!tool) throw new Error(`No tool "${name}"`)
  if (!toolVisibility(tool).includes('model')) {
    log({ direction: 'policy', layer: 'host', method: 'model call refused', summary: `${name} is app-only (_meta.ui.visibility: ["app"]) — only a card may call it`, data: tool._meta, tone: 'warning' })
    return
  }
  Object.assign(state.run, { label: label || name, tool: name, args, result: null, status: 'loading', error: '' })
  const hasView = await loadTemplate(toolResourceUri(tool))
  const view = hasView ? await viewReady() : null

  if (view?.bridge) {
    if (state.host.streamInput) {
      // Stream the arguments the way a model writes them: key by key.
      const keys = Object.keys(args)
      for (let i = 1; i < keys.length; i++) {
        await view.bridge.sendToolInputPartial({ arguments: plain(Object.fromEntries(keys.slice(0, i).map(k => [k, args[k]]))) })
        await sleep(120)
      }
    }
    await view.bridge.sendToolInput({ arguments: plain(args) })
  }

  log({ direction: 'host', layer: 'host', method: 'tools/call (model)', summary: `${name}(${JSON.stringify(args).slice(0, 80)})`, data: args })
  let result: CallToolResult
  try {
    result = await callTool(name, args)
  } catch (error) {
    state.run.status = 'error'
    state.run.error = error instanceof Error ? error.message : String(error)
    await view?.bridge?.sendToolCancelled({ reason: state.run.error })
    return
  }
  state.run.result = result
  state.run.status = 'ready'
  await view?.bridge?.sendToolResult(plain(result) as never)
}

/** Draw a card from props, no server call: fixtures and the props editor. */
export async function renderFixture(name: string, props: Record<string, unknown>, label = ''): Promise<void> {
  const result: CallToolResult = {
    content: [{ type: 'text', text: `(fixture) ${name}` }],
    structuredContent: { card: { name, props } },
  }
  Object.assign(state.run, { label: label || name, tool: '', args: {}, result, status: 'loading', error: '' })
  const uri = cardUri(name)
  const sameView = state.run.resourceUri === uri && activeView.value?.initialized
  const view = sameView ? activeView.value : ((await loadTemplate(uri)) ? await viewReady() : null)
  if (view?.bridge) {
    if (!sameView) await view.bridge.sendToolInput({ arguments: {} })
    await view.bridge.sendToolResult(plain(result) as never)
  }
  state.run.status = 'ready'
}

/** Re-send the current result (after editing its props). */
export async function resendResult(): Promise<void> {
  const result = state.run.result
  if (!result) return
  await activeView.value?.bridge?.sendToolResult(plain(result) as never)
}

/** Re-create the sandboxed view and replay input + result (after a bundle rebuild). */
export async function reloadView(): Promise<void> {
  const uri = state.run.resourceUri
  const result = state.run.result
  if (!uri) return
  if (!(await loadTemplate(uri))) return
  const view = await viewReady()
  if (!view?.bridge) return
  await view.bridge.sendToolInput({ arguments: plain(state.run.args) })
  if (result) await view.bridge.sendToolResult(plain(result) as never)
}

/** A NATIVE card's tool click: same policy as the sandbox's `oncalltool`. */
export async function callFromCard(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const tool = findTool(name)
  if (!tool || !toolVisibility(tool).includes('app')) {
    const why = !tool ? 'unknown tool' : 'tool is not visible to apps'
    log({ direction: 'policy', layer: 'native', method: 'tools/call refused', summary: `${name}: ${why}`, data: args, tone: 'error' })
    return { isError: true, content: [{ type: 'text', text: `Refused by host: ${why}.` }] }
  }
  log({ direction: 'policy', layer: 'native', method: 'tools/call allowed', summary: `${name}(${JSON.stringify(args).slice(0, 80)})`, data: args, tone: 'success' })
  return await callTool(name, args)
}
