#!/usr/bin/env node
/**
 * Install the vue-mcp-apps Claude skill.
 *
 *   node scripts/install-skill.mjs                    → ~/.claude/skills/vue-mcp-apps
 *   node scripts/install-skill.mjs --project ../app   → ../app/.claude/skills/vue-mcp-apps
 *
 * Replaces an existing copy. No dependencies; works on Windows, macOS and Linux.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '..', 'skills', 'vue-mcp-apps')

const args = process.argv.slice(2)
const projectIndex = args.indexOf('--project')
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/install-skill.mjs [--project <dir>]')
  process.exit(0)
}
if (projectIndex !== -1 && !args[projectIndex + 1]) {
  console.error('--project needs a directory')
  process.exit(1)
}

const base = projectIndex !== -1
  ? join(resolve(process.cwd(), args[projectIndex + 1]), '.claude', 'skills')
  : join(homedir(), '.claude', 'skills')
const target = join(base, 'vue-mcp-apps')

if (!existsSync(join(source, 'SKILL.md'))) {
  console.error(`Skill not found at ${source}`)
  process.exit(1)
}

mkdirSync(base, { recursive: true })
if (existsSync(target)) rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
console.log(`✔ vue-mcp-apps skill installed → ${target}`)
