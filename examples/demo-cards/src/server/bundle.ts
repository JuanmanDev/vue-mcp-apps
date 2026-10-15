/** Node only: read dist/cards.json (built by `npm run build:cards`), or null when it is missing. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function readCardBundle(): unknown {
  const path = fileURLToPath(new URL('../../dist/cards.json', import.meta.url))
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    console.error(`[demo-cards] ${path} not found — run \`npm run build:cards\`. Tools answer with text only.`)
    return null
  }
}
