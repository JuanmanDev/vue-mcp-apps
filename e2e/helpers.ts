import { expect, type FrameLocator, type Page } from '@playwright/test'

/** The n-th MCP App view on the page: host → sandbox proxy iframe → view iframe. */
export function mcpView(page: Page, n = 0): FrameLocator {
  return page.locator('iframe[title="Sandbox proxy"]').nth(n).contentFrame().locator('iframe[title="MCP App view"]').contentFrame()
}

/** Wait until the in-browser MCP server is connected. */
export async function connected(page: Page): Promise<void> {
  await expect(page.locator('[data-mcp-status="connected"]')).toBeAttached()
}

/** The protocol inspector's rows (workbench). */
export function inspectorRows(page: Page) {
  return page.locator('ol li')
}

/** Skip the intro banner so it does not move the layout. */
export async function dismissIntro(page: Page): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('vma:intro-dismissed', '1') } catch { /* private mode */ } })
}
