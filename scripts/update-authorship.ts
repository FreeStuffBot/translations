#!/usr/bin/env bun
/**
 * update-authorship.ts
 *
 * CI script. Runs after every push to main that touches discord-bot/*.jsonc.
 * Diffs HEAD against HEAD~1, finds which keys changed, and writes the
 * author + git hash to authorship-registry.json.
 *
 * Used by: GitHub Actions (track-authorship.yml) — not meant for manual use.
 *
 * Usage (injected by CI):
 *   AUTHOR_NAME="Jane" AUTHOR_EMAIL="jane@example.com" GIT_HASH="abc1234" bun update-authorship.ts
 *
 * Options (all via env vars, injected by CI):
 *   AUTHOR_NAME   Display name of the commit author
 *   AUTHOR_EMAIL  Email of the commit author
 *   GIT_HASH      Full or short git hash of the triggering commit
 */

import path from 'path'
import fs from 'fs'
import { Command } from 'commander'
import { parseJsonc } from './lib/jsonc'
import { loadRegistry, saveRegistry, formatAuthorEntry } from './lib/registry'
import { changedFilesBetween, showFileAtRef, shortHash as getShortHash, REPO_ROOT } from './lib/git'

const program = new Command()

program
  .name('update-authorship')
  .description('Update authorship-registry.json based on the diff of the most recent commit (CI use only)')
  .option('--author-name <name>', 'Commit author display name', process.env.AUTHOR_NAME ?? 'Unknown')
  .option('--author-email <email>', 'Commit author email', process.env.AUTHOR_EMAIL ?? 'unknown@unknown')
  .option('--git-hash <hash>', 'Git hash of the triggering commit', process.env.GIT_HASH)
  .parse()

const opts = program.opts<{ authorName: string; authorEmail: string; gitHash?: string }>()

const DISCORD_BOT_DIR = 'discord-bot'
const gitHash = opts.gitHash ?? getShortHash()
const authorEntry = formatAuthorEntry(opts.authorName, opts.authorEmail, gitHash)

const changedFiles = changedFilesBetween('HEAD~1', 'HEAD').filter(
  f => f.startsWith(DISCORD_BOT_DIR + '/') && f.endsWith('.jsonc')
)

if (changedFiles.length === 0) {
  console.log('No discord-bot/*.jsonc files changed — nothing to do.')
  process.exit(0)
}

const registry = loadRegistry()
let totalUpdated = 0

for (const filePath of changedFiles) {
  const fileName = path.basename(filePath)
  if (!registry[fileName]) registry[fileName] = {}

  const fullPath = path.resolve(REPO_ROOT, filePath)
  const currentSrc = fs.readFileSync(fullPath, 'utf8')
  const currentJson = parseJsonc(currentSrc, fileName)

  const prevSrc = showFileAtRef('HEAD~1', filePath)
  const prevJson = prevSrc ? parseJsonc(prevSrc, fileName) : {}

  let fileUpdates = 0

  for (const key of Object.keys(currentJson)) {
    const prevValue = prevJson[key]
    const currValue = currentJson[key]

    const keyIsNew = !(key in prevJson)
    const valueChanged = prevValue !== currValue
    const nowHasContent = currValue !== '' && currValue !== null && currValue !== undefined

    if (keyIsNew || (valueChanged && nowHasContent)) {
      registry[fileName][key] = authorEntry
      fileUpdates++
      totalUpdated++
    }
  }

  console.log(`  ${fileName}: ${fileUpdates} key(s) attributed to "${opts.authorName}"`)
}

saveRegistry(registry)
console.log(`\nDone. ${totalUpdated} total key(s) updated in authorship-registry.json`)
