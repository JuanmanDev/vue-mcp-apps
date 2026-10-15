<script setup lang="ts">
/** The three-layer workbench: native pane, sandboxed MCP App pane, protocol inspector. */
import ConnectionPanel from '../components/ConnectionPanel.vue'
import ToolsPanel from '../components/ToolsPanel.vue'
import FixturesPanel from '../components/FixturesPanel.vue'
import HostSettings from '../components/HostSettings.vue'
import StagePanel from '../components/StagePanel.vue'
import InspectorPanel from '../components/InspectorPanel.vue'
</script>

<template>
  <div class="grid gap-4 p-4 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_440px]">
    <aside class="space-y-4 min-w-0">
      <ConnectionPanel />
      <ToolsPanel />
      <FixturesPanel />
      <HostSettings />
    </aside>
    <main class="min-w-0">
      <StagePanel />
    </main>
    <section class="min-w-0 lg:col-span-2 2xl:col-span-1">
      <InspectorPanel />
    </section>
  </div>
</template>
