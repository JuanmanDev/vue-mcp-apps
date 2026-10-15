/**
 * The committed card bundle must match its sources: change a card, the card
 * host or the bridge and forget `npm run build:cards`, and this fails — without
 * rebuilding a minified script byte for byte in CI.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceHash } from '@vue-mcp-apps/vite'
import { cards } from '../src/manifest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = resolve(ROOT, 'dist/cards.json')

describe.skipIf(!existsSync(BUNDLE))('dist/cards.json', () => {
  const bundle = existsSync(BUNDLE) ? JSON.parse(readFileSync(BUNDLE, 'utf8')) as {
    sourceHash: string; sources: string[]; versions: Record<string, string>; cards: string[]; script: string; css: string
  } : null

  it('is built from the current sources (run `npm run build:cards`)', () => {
    expect(sourceHash(ROOT, bundle!.sources, bundle!.versions)).toBe(bundle!.sourceHash)
  })

  it('draws every card of the manifest', () => {
    expect([...bundle!.cards].sort()).toEqual(Object.keys(cards).sort())
  })

  it('fetches nothing: no remote URLs in the stylesheet, no import() in the script', () => {
    expect(bundle!.css).not.toMatch(/url\(\s*['"]?https?:/)
    expect(bundle!.script).not.toMatch(/\bimport\(/)
    expect(bundle!.css.length).toBeGreaterThan(1000)
  })
})
