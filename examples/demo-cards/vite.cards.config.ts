/**
 * Builds the three cards into dist/cards.json — the one file the MCP server
 * inlines into every card template.   npm run build:cards
 */
import { defaultClientConditions, defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { defineCardBundleConfig } from '@vue-mcp-apps/vite'
import { cards } from './src/manifest'

export default defineConfig(defineCardBundleConfig({
  entry: 'src/view.ts',
  outFile: 'dist/cards.json',
  cards: Object.keys(cards),
  plugins: [
    vue(),
    ui({
      // No vue-router inside a card; links are actions (`kind: 'link'`).
      router: false,
      // The host decides light/dark (`hostContext.theme`), not localStorage.
      colorMode: false,
      // Icons are bundled: a template fetches nothing (the host's CSP forbids it).
      icon: { clientBundle: { scan: true } },
      ui: { colors: { primary: 'indigo', neutral: 'zinc' } },
    }),
  ],
  config: {
    resolve: { conditions: ['vue-mcp-apps:source', ...defaultClientConditions] },
  },
}))
