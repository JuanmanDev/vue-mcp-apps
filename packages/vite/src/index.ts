/**
 * Build your Vue cards into ONE self-contained MCP Apps bundle — a JSON file
 * holding one classic script (Vue, your cards, their libraries, the protocol
 * bridge) and one stylesheet (Tailwind / Nuxt UI, compiled). The server inlines
 * both into every card template (`@vue-mcp-apps/server`), so a template fetches
 * nothing, declares no CSP domains and needs no public URL: a desktop client on
 * stdio draws it as well as claude.ai over HTTP.
 *
 *   // vite.cards.config.ts
 *   import { defineCardBundleConfig } from '@vue-mcp-apps/vite'
 *   import vue from '@vitejs/plugin-vue'
 *   import ui from '@nuxt/ui/vite'
 *   import { cards } from './src/manifest'
 *
 *   export default defineCardBundleConfig({
 *     entry: 'src/view.ts',
 *     outFile: 'dist/cards.json',
 *     cards: Object.keys(cards),
 *     plugins: [vue(), ui({ router: false, colorMode: false })],
 *   })
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Plugin, PluginOption, UserConfig } from 'vite'

export interface McpCardBundleOptions {
  /** Where to write the bundle JSON (relative to the Vite root). */
  outFile: string
  /** The card names the bundle draws — usually `Object.keys(manifest)`. */
  cards: readonly string[]
  /** Fail the build when the script grows past this (kB). Default 2048. */
  maxSizeKb?: number
  /** Log size and sources. Default true. */
  verbose?: boolean
}

/** `</script`, `</style` and `<!--` cannot appear raw inside inline tags. */
export function inlineSafe(code: string): string {
  return code.replace(/<\/(script|style)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
}

/** sha256 over the sources (CRLF → LF, so a Windows checkout hashes the same) and the key versions. */
export function sourceHash(root: string, sources: readonly string[], versions: Record<string, string>): string {
  const hash = createHash('sha256')
  for (const [name, version] of Object.entries(versions).sort()) hash.update(`${name}@${version}\n`)
  for (const source of [...sources].sort()) {
    hash.update(`${source}\n`)
    hash.update(readFileSync(resolve(root, source), 'utf8').replace(/\r\n/g, '\n'))
    hash.update('\n')
  }
  return hash.digest('hex')
}

function packageVersion(root: string, name: string): string | null {
  try {
    return (JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')) as { version: string }).version
  } catch {
    return null
  }
}

function findVersion(root: string, name: string): string | null {
  let dir = root
  for (let i = 0; i < 6; i++) {
    const v = packageVersion(dir, name)
    if (v) return v
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return null
}

/** The Rollup half: turns the one-chunk build into the bundle JSON. */
export function mcpCardBundle(options: McpCardBundleOptions): Plugin {
  let root = process.cwd()
  return {
    name: 'vue-mcp-apps:card-bundle',
    apply: 'build',
    // After Vite's own CSS plugin has emitted the stylesheet.
    enforce: 'post',
    configResolved(config) {
      root = config.root
    },
    generateBundle(_output, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk')
      if (chunks.length !== 1) this.error(`A card bundle is one script; got ${chunks.length} chunks. Avoid dynamic import() in cards.`)
      const assets = Object.values(bundle).filter(item => item.type === 'asset')
      const css = assets
        .filter(asset => asset.fileName.endsWith('.css'))
        .map(asset => String((asset as { source: string | Uint8Array }).source instanceof Uint8Array
          ? Buffer.from((asset as { source: Uint8Array }).source).toString('utf8')
          : (asset as { source: string }).source))
        .join('\n')
      const other = assets.filter(asset => !asset.fileName.endsWith('.css'))
      if (other.length) {
        this.warn(`Not inlined (a template fetches nothing): ${other.map(a => a.fileName).join(', ')}. Import small assets as data URLs (?inline) instead.`)
      }

      const sources = [...new Set([...this.getModuleIds()]
        .map(id => id.split('?')[0]!)
        .filter(id => !id.startsWith('\0') && !id.includes(`${sep}node_modules${sep}`) && !id.includes('/node_modules/') && isAbsolute(id))
        .map(id => relative(root, id).split(sep).join('/'))
        .filter(id => !id.startsWith('/') && !/^[A-Za-z]:/.test(id)))]
        .sort()
      const readable = sources.filter((source) => {
        try { readFileSync(resolve(root, source)); return true } catch { return false }
      })
      const versions: Record<string, string> = {}
      for (const name of ['vue', '@nuxt/ui', 'tailwindcss', '@vue-mcp-apps/view']) {
        const v = findVersion(root, name)
        if (v) versions[name] = v
      }

      const chunk = chunks[0] as { code: string }
      const script = inlineSafe(chunk.code.trim())
      const sizeKb = (script.length + css.length) / 1024
      if (sizeKb > (options.maxSizeKb ?? 2048)) this.error(`Card bundle is ${sizeKb.toFixed(0)} kB, over maxSizeKb ${options.maxSizeKb ?? 2048}.`)

      const json = {
        generatedBy: '@vue-mcp-apps/vite',
        versions,
        sourceHash: sourceHash(root, readable, versions),
        sources: readable,
        cards: [...options.cards],
        script,
        css: inlineSafe(css),
      }
      const outFile = resolve(root, options.outFile)
      mkdirSync(dirname(outFile), { recursive: true })
      writeFileSync(outFile, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
      for (const name of Object.keys(bundle)) delete bundle[name]
      if (options.verbose !== false) {
        console.log(`\n✔ MCP App card bundle → ${relative(process.cwd(), outFile)}`)
        console.log(`  ${options.cards.length} card(s): ${options.cards.join(', ')}`)
        console.log(`  script ${(script.length / 1024).toFixed(0)} kB + css ${(css.length / 1024).toFixed(0)} kB, ${readable.length} sources, hash ${json.sourceHash.slice(0, 12)}`)
      }
    },
  }
}

export interface CardBundleConfigOptions extends McpCardBundleOptions {
  /** The view entry: calls `startMcpApp({ manifest, components, install })`. */
  entry: string
  /** Your plugins: `vue()`, `ui({ router: false, colorMode: false })`, … */
  plugins?: PluginOption[]
  /** Merged last. */
  config?: UserConfig
}

/**
 * A complete Vite config for the card bundle: IIFE, one chunk, CSS collected,
 * production Vue flags, nothing written but the JSON.
 */
export function defineCardBundleConfig(options: CardBundleConfigOptions): UserConfig {
  const { entry, plugins = [], config = {}, ...bundleOptions } = options
  return {
    ...config,
    plugins: [...plugins, mcpCardBundle(bundleOptions), ...(config.plugins ?? [])],
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      'process.env.NODE_ENV': JSON.stringify('production'),
      ...(config.define ?? {}),
    },
    build: {
      outDir: 'node_modules/.cache/vue-mcp-apps',
      emptyOutDir: true,
      cssCodeSplit: false,
      minify: 'esbuild',
      target: 'es2020',
      ...(config.build ?? {}),
      lib: {
        entry,
        name: 'VueMcpAppsCards',
        formats: ['iife'],
        fileName: () => 'cards.js',
      },
      rollupOptions: {
        ...(config.build?.rollupOptions ?? {}),
        output: { inlineDynamicImports: true },
      },
    },
  }
}
