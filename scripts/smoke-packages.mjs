#!/usr/bin/env node
/**
 * Smoke-tests the PUBLISHED shape of the four packages — what `npm i` gives a
 * user, not the workspace sources: `npm pack` each package, install the
 * tarballs into a blank project, then import every entry point and run the
 * server kit against a real MCP SDK v2 server and client.
 *
 * Catches: a file missing from `files`, a broken `exports` map, a dependency
 * that only resolves inside the monorepo, a Node version the libraries no
 * longer run on (CI runs this on Node 20, 22 and 24).
 *
 *   npm run build:packages && node scripts/smoke-packages.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const work = mkdtempSync(join(tmpdir(), 'vma-smoke-'))
// Under `npm run`, npm_execpath is npm's own CLI: run it with this Node, no shell needed.
const run = (args, cwd) => {
  const options = { cwd, stdio: ['ignore', 'pipe', 'inherit'] }
  const out = process.env.npm_execpath
    ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], options)
    : execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { ...options, shell: process.platform === 'win32' })
  return out.toString()
}

try {
  const tarballs = {}
  for (const name of ['core', 'view', 'server', 'vite']) {
    const out = run(['pack', '--json', '--pack-destination', work], join(root, 'packages', name))
    const file = JSON.parse(out)[0].filename
    tarballs[`@vue-mcp-apps/${name}`] = `file:${join(work, file).replace(/\\/g, '/')}`
  }
  console.log('packed:', readdirSync(work).join(', '))

  writeFileSync(join(work, 'package.json'), JSON.stringify({
    name: 'smoke', private: true, type: 'module',
    dependencies: {
      ...tarballs,
      '@modelcontextprotocol/server': '^2.3.1',
      '@modelcontextprotocol/client': '^2.3.1',
      vue: '^3.5.0',
      vite: '^7.0.0',
      zod: '^4.2.0',
    },
    // npm resolves the packages' own "@vue-mcp-apps/core": "x.y.z" to the tarball too.
    overrides: { '@vue-mcp-apps/core': tarballs['@vue-mcp-apps/core'] },
  }, null, 2))
  run(['install', '--no-audit', '--no-fund', '--ignore-scripts'], work)

  writeFileSync(join(work, 'smoke.mjs'), `
import assert from 'node:assert/strict'
import * as core from '@vue-mcp-apps/core'
import * as view from '@vue-mcp-apps/view'
import * as server from '@vue-mcp-apps/server'
import * as vite from '@vue-mcp-apps/vite'
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server'
import { Client } from '@modelcontextprotocol/client'
import { z } from 'zod'

for (const [mod, names] of [
  [core, ['defineCards', 'cardActionFor', 'resultCard', 'toPlain', 'MCP_APP_MIME', 'METHODS']],
  [view, ['startMcpApp', 'McpCard', 'CardRenderer', 'McpAppBridge', 'useCardHost', 'NUXT_UI_TOKENS']],
  [server, ['createCardServerKit', 'cardTemplateHtml', 'cardResult', 'clientSupportsMcpApps']],
  [vite, ['defineCardBundleConfig', 'mcpCardBundle', 'sourceHash', 'CSS_BASELINE']],
]) for (const n of names) assert.ok(n in mod, 'missing export ' + n)

const cards = core.defineCards({ 'hello-card': { title: 'Hello', actions: { waved: { kind: 'tool', tool: 'wave' } } } })
const kit = server.createCardServerKit({ manifest: cards, bundle: { cards: ['hello-card'], script: 'void 0', css: '' } })
const mcp = new McpServer({ name: 'smoke', version: '1.0.0' })
kit.registerResources(mcp)
kit.registerTool(mcp, 'hello', { card: 'hello-card', description: 'hi', inputSchema: z.object({ name: z.string() }) },
  async ({ name }) => kit.result('hello-card', { name }, 'Hello ' + name))
const [a, b] = InMemoryTransport.createLinkedPair()
await mcp.connect(b)
const client = new Client({ name: 'smoke-host', version: '1.0.0' })
await client.connect(a)
const { tools } = await client.listTools()
assert.equal(tools[0]._meta.ui.resourceUri, 'ui://cards/hello-card')
const read = await client.readResource({ uri: 'ui://cards/hello-card' })
assert.equal(read.contents[0].mimeType, core.MCP_APP_MIME)
const result = await client.callTool({ name: 'hello', arguments: { name: 'Ada' } })
assert.deepEqual(result.structuredContent, { card: { name: 'hello-card', props: { name: 'Ada' } } })
assert.deepEqual(core.cardActionFor(cards, 'hello-card', 'waved', [{ x: 1 }]), { kind: 'tool', event: 'waved', tool: 'wave', args: { x: 1 } })
await client.close()
console.log('smoke OK on Node ' + process.version)
`)
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: work, stdio: 'inherit' })
} finally {
  rmSync(work, { recursive: true, force: true })
}
