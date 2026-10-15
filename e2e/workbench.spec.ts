/**
 * The workbench: one card, two hosts (native + MCP App through three layers),
 * every message checked in the inspector.
 */
import { expect, test } from '@playwright/test'
import { connected, dismissIntro, inspectorRows, mcpView } from './helpers'

test.beforeEach(async ({ page }) => {
  await dismissIntro(page)
  await page.goto('#/workbench')
  await connected(page)
})

test('a tool call renders the same card natively and as a sandboxed MCP App', async ({ page }) => {
  await page.getByRole('button', { name: 'Weather in Madrid' }).click()

  // Layer 3: inside two iframes, the bundle drew the card.
  const view = mcpView(page)
  await expect(view.getByText('Madrid', { exact: true })).toBeVisible()
  await expect(view.getByText('mcp-app', { exact: true })).toBeVisible()

  // Layer 0: the same component, mounted natively.
  await expect(page.getByText('native', { exact: true })).toBeVisible()

  // The handshake, in order, as the official AppBridge saw it.
  const log = (await inspectorRows(page).allInnerTexts()).join('\n')
  for (const method of ['sandbox-proxy-ready', 'sandbox-resource-ready', 'ui/initialize', 'ui/notifications/initialized', 'ui/notifications/tool-input', 'ui/notifications/tool-result']) {
    expect(log).toContain(method)
  }

  // The proxy lives on another origin than the host.
  const proxySrc = await page.locator('iframe[title="Sandbox proxy"]').getAttribute('src')
  expect(new URL(proxySrc!).origin).not.toBe(new URL(page.url()).origin)
})

test('a card button runs its declared tool through the host policy', async ({ page }) => {
  await page.getByRole('button', { name: 'Weather in Madrid' }).click()
  await mcpView(page).getByRole('button', { name: 'Refresh' }).click()
  await expect(inspectorRows(page).filter({ hasText: 'tools/call allowed' }).first()).toBeVisible()
  await expect(inspectorRows(page).filter({ hasText: 'ui/update-model-context' }).first()).toBeVisible()
})

test('an app-only tool is reachable from the card, not from the model', async ({ page }) => {
  await page.getByRole('button', { name: 'Propose booking changes' }).click()
  const view = mcpView(page)
  await view.getByRole('button', { name: /Apply 3 of 3/ }).click()
  await expect(view.getByText('3 of 3 change(s) applied')).toBeVisible()
  await expect(inspectorRows(page).filter({ hasText: 'apply_changes (visibility: app)' }).first()).toBeVisible()

  // "Play the model" refuses it.
  await page.getByText('apply_changes', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'App-only: a card calls it' })).toBeDisabled()
})

test('host context reaches the view: dark theme', async ({ page }) => {
  await page.getByRole('button', { name: 'Lunch poll' }).click()
  const view = mcpView(page)
  await expect(view.getByText('Where do we go for lunch on Friday?')).toBeVisible()
  await page.getByRole('button', { name: 'Toggle host theme' }).click()
  await expect(view.locator('html')).toHaveClass(/dark/)
  await expect(inspectorRows(page).filter({ hasText: 'host-context-changed' }).first()).toBeVisible()
})

test('fixtures draw a card without a tool call, in both panes', async ({ page }) => {
  await page.getByRole('button', { name: 'Weather · oslo' }).click()
  await expect(mcpView(page).getByText(/^Oslo, NO$/)).toBeVisible()
  await expect(page.getByText(/^Oslo, NO$/).first()).toBeVisible()
})

test('works with an opaque-origin proxy (single-origin hosts such as GitHub Pages)', async ({ page }) => {
  await page.getByRole('combobox').filter({ hasText: /^auto$/ }).click()
  await page.getByRole('option', { name: 'opaque' }).click()
  await page.getByRole('button', { name: 'Lunch poll' }).click()
  const proxy = page.locator('iframe[title="Sandbox proxy"]')
  await expect(proxy).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
  const view = mcpView(page)
  await view.getByRole('button', { name: /Ramen place/ }).click()
  await expect(view.getByText(/^7 · /)).toBeVisible()
})
