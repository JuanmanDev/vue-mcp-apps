/**
 * Host context → the document: theme, locale, the host's style variables.
 *
 * Hosts send their design tokens as the spec's CSS variables
 * (`--color-background-primary`, `--font-sans`, …; `hostContext.styles.variables`).
 * They are set on `:root` as they come, and — so a Nuxt UI card looks native
 * in the host without knowing the spec's names — mirrored onto the Nuxt UI
 * tokens in `NUXT_UI_TOKENS`. Pass your own map (or `{}`) to `startMcpApp`.
 */
import type { HostContext } from '@vue-mcp-apps/core'

/** Spec variable → the Nuxt UI token it feeds. */
export const NUXT_UI_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  '--color-background-primary': '--ui-bg',
  '--color-background-secondary': '--ui-bg-muted',
  '--color-background-tertiary': '--ui-bg-elevated',
  '--color-background-inverse': '--ui-bg-inverted',
  '--color-text-primary': '--ui-text-highlighted',
  '--color-text-secondary': '--ui-text',
  '--color-text-tertiary': '--ui-text-muted',
  '--color-text-disabled': '--ui-text-dimmed',
  '--color-text-inverse': '--ui-text-inverted',
  '--color-border-primary': '--ui-border',
  '--color-border-secondary': '--ui-border-muted',
  '--color-border-tertiary': '--ui-border-accented',
  '--color-border-inverse': '--ui-border-inverted',
  '--border-radius-sm': '--ui-radius',
})

let fontStyle: HTMLStyleElement | null = null
let appliedVariables: string[] = []

export function applyHostContext(
  context: HostContext,
  tokens: Readonly<Record<string, string>> = NUXT_UI_TOKENS,
  doc: Document = document,
): void {
  const root = doc.documentElement
  if (typeof context.locale === 'string' && context.locale) root.lang = context.locale
  if (context.theme === 'light' || context.theme === 'dark') {
    root.style.colorScheme = context.theme
    // Nuxt UI (and Tailwind's `dark:` variant in class mode) key off `.dark`.
    root.classList.toggle('dark', context.theme === 'dark')
    root.dataset.theme = context.theme
  }
  if (context.displayMode) root.dataset.displayMode = context.displayMode

  const variables = context.styles?.variables
  if (variables && typeof variables === 'object') {
    for (const name of appliedVariables) root.style.removeProperty(name)
    appliedVariables = []
    for (const [name, value] of Object.entries(variables)) {
      if (!name.startsWith('--') || typeof value !== 'string' || !value) continue
      root.style.setProperty(name, value)
      appliedVariables.push(name)
      const token = tokens[name]
      if (token) {
        root.style.setProperty(token, value)
        appliedVariables.push(token)
      }
    }
    const sans = variables['--font-sans']
    if (typeof sans === 'string' && sans) root.style.setProperty('font-family', sans)
  }

  const fonts = context.styles?.css?.fonts
  if (typeof fonts === 'string' && fonts) {
    fontStyle ??= doc.head.appendChild(doc.createElement('style'))
    fontStyle.textContent = fonts
  }
}
