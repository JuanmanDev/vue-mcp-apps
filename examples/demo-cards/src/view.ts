/**
 * The view bundle's entry — what runs inside the host's sandboxed iframe.
 * Built by `npm run build:cards` (vite.cards.config.ts) into dist/cards.json.
 */
import './cards.css'
import ui from '@nuxt/ui/vue-plugin'
import { startMcpApp } from '@vue-mcp-apps/view'
import { cards } from './manifest'
import { components } from './components'

startMcpApp({
  manifest: cards,
  components,
  install: app => app.use(ui),
  appInfo: { name: 'demo-cards', version: '0.1.0' },
}).catch(error => console.error('[demo-cards] could not start:', error))
