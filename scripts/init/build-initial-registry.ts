#!/usr/bin/env bun
/**
 * init/build-initial-registry.ts
 *
 * ONE-TIME USE. Walks the full git history of discord-bot/*.jsonc (oldest
 * commit first) and attributes each key to the commit that last meaningfully
 * changed it. Writes the result to authorship-registry.json.
 *
 * Run once from the repo root after first setting up the authorship system:
 *   bun scripts/init/build-initial-registry.ts
 *
 * Safe to re-run: fully overwrites any existing registry.
 *
 * Used by: maintainers (one-time setup)
 *
 * Options:
 *   --package <dir>   Package folder to scan (default: discord-bot)
 *   --dry-run         Print attribution counts without writing the registry
 */

import path from 'path'
import { Command } from 'commander'
import { parseJsonc, TranslationMap } from '../lib/jsonc'
import { saveRegistry, AuthorshipRegistry, formatAuthorEntry } from '../lib/registry'
import { logCommitsForPath, filesChangedInCommit, showFileAtRef } from '../lib/git'

const program = new Command()

program
  .name('build-initial-registry')
  .description('ONE-TIME: Build authorship-registry.json from full git history')
  .option('-p, --package <dir>', 'Package folder to scan', 'discord-bot')
  .option('--dry-run', 'Print what would be written without saving', false)
  .parse()

const opts = program.opts<{ package: string; dryRun: boolean }>()

const PACKAGE_DIR = opts.package
const SOURCE_OF_TRUTH = 'en-US.jsonc'

function safeParseJsonc(src: string | null, fileName: string): TranslationMap {
  if (!src) return {}
  try {
    return parseJsonc(src, fileName)
  } catch {
    return {}
  }
}

console.log(`Building initial authorship registry from full git history (${PACKAGE_DIR})...\n`)

const registry: AuthorshipRegistry = {}
const allCommits = logCommitsForPath(`${PACKAGE_DIR}/*.jsonc`)
console.log(`Found ${allCommits.length} commit(s) that touched ${PACKAGE_DIR}/*.jsonc\n`)

for (const commit of allCommits) {
  const skipAuthors = commit.subject.includes('[skip-authors]')
  const authorEntry = formatAuthorEntry(commit.authorName, commit.authorEmail, commit.shortHash)
  const touchedFiles = filesChangedInCommit(commit.hash)
    .filter(f => f.startsWith(PACKAGE_DIR + '/') && f.endsWith('.jsonc') && path.basename(f) !== SOURCE_OF_TRUTH)

  if (touchedFiles.length === 0) continue

  for (const filePath of touchedFiles) {
    const fileName = path.basename(filePath)
    if (!registry[fileName]) registry[fileName] = {}

    const currentSrc = showFileAtRef(commit.hash, filePath)
    if (!currentSrc) continue

    const parentSrc = showFileAtRef(`${commit.hash}~1`, filePath)
    const currentJson = safeParseJsonc(currentSrc, fileName)
    const prevJson = safeParseJsonc(parentSrc, fileName)

    for (const key of Object.keys(currentJson)) {
      const prevValue = prevJson[key]
      const currValue = currentJson[key]

      const keyIsNew = !(key in prevJson)
      const valueChanged = prevValue !== currValue
      const nowHasContent = currValue !== '' && currValue !== null && currValue !== undefined

      if (!skipAuthors && (keyIsNew || (valueChanged && nowHasContent))) {
        registry[fileName][key] = authorEntry
      } else if (skipAuthors && keyIsNew && !registry[fileName][key]) {
        // For [skip-authors] commits, only attribute genuinely new keys with a note
        registry[fileName][key] = authorEntry + ' [formatting]'
      }
    }
  }

  const tag = skipAuthors ? ' [skip-authors]' : ''
  console.log(`  ✓ ${commit.shortHash}  ${commit.authorName}${tag}`)
}

const totalFiles = Object.keys(registry).length
const totalKeys = Object.values(registry).reduce((sum, f) => sum + Object.keys(f).length, 0)

if (opts.dryRun) {
  console.log(`\n[dry-run] Would write ${totalKeys} key attribution(s) across ${totalFiles} file(s).`)
} else {
  saveRegistry(registry)
  console.log(`\nDone. Wrote ${totalKeys} key attribution(s) across ${totalFiles} file(s) to authorship-registry.json`)
}
