import { defaultClientConditions } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Workspace packages from their TypeScript sources.
    conditions: ['vue-mcp-apps:source', ...defaultClientConditions],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'examples/*/test/**/*.test.ts', 'playground/src/**/*.test.ts'],
    environment: 'node',
  },
})
