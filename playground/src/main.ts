import './style.css'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import DemoPage from './pages/DemoPage.vue'
import WorkbenchPage from './pages/WorkbenchPage.vue'
import { onBundleUpdate } from './project'
import { connect, setBundle } from './lib/connection'
import { reloadView } from './lib/workbench'
import { log, state } from './lib/store'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DemoPage, meta: { title: 'AI demo' } },
    { path: '/workbench', component: WorkbenchPage, meta: { title: 'Workbench' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const app = createApp(App)
app.use(router)
app.use(ui)
app.mount('#app')

// `npm run dev` rebuilds the card bundle on every save: swap it in, reconnect
// the in-browser server and replay the current run in a fresh view.
onBundleUpdate(async (bundle) => {
  setBundle(bundle)
  state.bundleVersion++
  log({ direction: 'host', layer: 'host', method: 'bundle rebuilt', summary: 'Card bundle changed — reloading the sandboxed view', data: null, tone: 'info' })
  if (state.connection.mode === 'browser') await connect()
  await reloadView()
})
