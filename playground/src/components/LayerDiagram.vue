<script setup lang="ts">
import { computed } from 'vue'
import { proxyTarget } from '../lib/sandboxHost'
import { activeView } from '../lib/workbench'
import { state } from '../lib/store'

const proxy = computed(() => {
  void state.host.proxyOrigin
  void state.run.viewKey
  const { url, opaque } = proxyTarget()
  return { origin: opaque ? 'opaque (null)' : new URL(url).origin, opaque }
})

const seen = computed(() => {
  const methods = new Set(state.log.filter(e => e.layer === 'bridge').slice(-200).map(e => e.method))
  return {
    proxy: methods.has('ui/notifications/sandbox-proxy-ready'),
    view: methods.has('ui/initialize'),
    ready: !!activeView.value?.initialized || methods.has('ui/notifications/initialized'),
  }
})

const layers = computed(() => [
  {
    n: 1,
    title: 'Host',
    detail: window.location.origin,
    note: 'AppBridge (ext-apps) · MCP client',
    on: state.connection.status === 'connected',
  },
  {
    n: 2,
    title: 'Sandbox proxy',
    detail: proxy.value.origin,
    note: proxy.value.opaque ? 'sandbox="allow-scripts allow-forms"' : 'sandbox="allow-scripts allow-same-origin allow-forms"',
    on: seen.value.proxy,
  },
  {
    n: 3,
    title: 'View',
    detail: 'srcdoc · CSP from _meta.ui.csp',
    note: state.host.viewSandbox === 'strict' ? 'sandbox="allow-scripts allow-forms"' : 'sandbox="allow-scripts allow-same-origin allow-forms"',
    on: seen.value.ready,
  },
])
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-3">
    <div
      v-for="layer in layers"
      :key="layer.n"
      class="relative rounded-lg border p-2.5 transition-colors"
      :class="layer.on ? 'border-primary/50 bg-primary/5' : 'border-default'"
    >
      <div class="flex items-center gap-2">
        <span class="size-5 rounded-full grid place-items-center text-[11px] font-bold" :class="layer.on ? 'bg-primary text-inverted' : 'bg-elevated text-muted'">{{ layer.n }}</span>
        <p class="text-sm font-semibold">{{ layer.title }}</p>
        <span class="ms-auto size-2 rounded-full" :class="layer.on ? 'bg-success' : 'bg-accented'" />
      </div>
      <p class="text-xs font-mono mt-1 truncate" :title="layer.detail">{{ layer.detail }}</p>
      <p class="text-[11px] text-muted truncate" :title="layer.note">{{ layer.note }}</p>
    </div>
  </div>
</template>
