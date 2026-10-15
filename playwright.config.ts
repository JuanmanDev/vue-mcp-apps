/**
 * End-to-end tests of the playground's PRODUCTION build — what GitHub Pages
 * serves: the in-browser MCP server, the three layers (host → sandbox proxy →
 * view) with the official AppBridge, the native pane and the AI demo.
 *
 *   npm run build && npm run test:e2e
 *
 * The page is opened on http://localhost:4173 and the preview server listens on
 * 127.0.0.1, so the sandbox proxy (127.0.0.1) is a real second origin.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
  webServer: {
    command: 'npm run preview -w playground -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
