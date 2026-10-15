import { defaultClientConditions, defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

export default defineConfig({
  // GitHub Pages serves the repo under /<repo>/; PLAYGROUND_BASE sets it in CI.
  base: process.env.PLAYGROUND_BASE ?? '/',
  plugins: [
    vue(),
    ui({
      icon: { clientBundle: { scan: true } },
      ui: { colors: { primary: 'indigo', neutral: 'zinc' } },
    }),
  ],
  resolve: {
    // Workspace packages straight from their TypeScript sources: edits hot-reload.
    conditions: ['vue-mcp-apps:source', ...defaultClientConditions],
  },
  server: {
    // Bound on 127.0.0.1 so the page can use http://localhost:5173 as the HOST
    // origin and http://127.0.0.1:5173 as the SANDBOX PROXY origin — two origins,
    // one server, like a real web host (see src/lib/sandboxHost.ts).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The proxy (and an opaque-origin view) fetch nothing from us, but Vite's
    // client may: allow both origins.
    cors: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
})
