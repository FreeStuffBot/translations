#!/usr/bin/env bun
/**
 * sync.ts
 *
 * Syncs all translation files in a package folder against en-US.jsonc:
 *   - Adds missing keys (with empty string values) to every non-base file
 *   - Removes keys that no longer exist in en-US.jsonc
 *   - Re-renders every file with en-US comments above each key for translator context
 *   - Sorts keys alphabetically to match en-US.jsonc ordering
 *
 * Used by: maintainers, CI/CD after adding new keys to en-US.jsonc
 *
 * Usage:
 *   bun sync.ts --package discord-bot
 *   bun sync.ts -p discord-bot --dry-run
 */

import fs from 'fs'
import path from 'path'
import { Command } from 'commander'
import { stripJsoncComments, TranslationMap } from './lib/jsonc'

const program = new Command()

program
  .name('sync')
  .description('Sync all translation files against en-US.jsonc (add missing keys, remove stale keys, re-render comments)')
  .requiredOption('-p, --package <dir>', 'Package folder to sync (e.g. discord-bot)')
  .option('--dry-run', 'Print what would change without writing files', false)
  .parse()

const opts = program.opts<{ package: string; dryRun: boolean }>()

const packageDir = path.resolve(__dirname, '..', opts.package)
const BASE_FILE = 'en-US.jsonc'

function readJsonc(filePath: string): TranslationMap {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(stripJsoncComments(raw))
}

function sorted(obj: TranslationMap, baseContent: TranslationMap): Record<string, unknown> {
  return Object.keys(obj)
    .filter(k => !k.startsWith('//') && !k.startsWith('_'))
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[`//${key}`] = baseContent[key] ?? '(missing)'
      acc[key] = obj[key]
      return acc
    }, {})
}

function renderJsonc(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2)
    .replace(/"\/\/.*?": ?"(.*?)",?\n/g, '\n  // $1\n')
    .replace(/^\s+$/gm, '')
    .replace('{\n\n', '{\n')
}

const baseContent = readJsonc(path.join(packageDir, BASE_FILE))

for (const file of fs.readdirSync(packageDir)) {
  if (!file.endsWith('.jsonc')) continue

  const filePath = path.join(packageDir, file)

  if (file === BASE_FILE) {
    // Sort base file and strip orphan comment keys
    const rendered = JSON.stringify(sorted(baseContent, baseContent), null, 2)
      .replace(/"\/\/.*?": ?"(.*?)",?\n/g, '')
      .replace(/^\s+$/gm, '')
      .replace('{\n\n', '{\n')
    if (!opts.dryRun) fs.writeFileSync(filePath, rendered)
    else console.log(`[dry-run] Would reformat base file: ${file}`)
    continue
  }

  const content = readJsonc(filePath)
  let added = 0
  let removed = 0

  for (const key of Object.keys(baseContent)) {
    if (key.startsWith('//') || key.startsWith('_')) continue
    if (!(key in content)) { content[key] = ''; added++ }
  }
  for (const key of Object.keys(content)) {
    if (key.startsWith('//') || key.startsWith('_')) continue
    if (!(key in baseContent)) { delete content[key]; removed++ }
  }

  const rendered = renderJsonc(sorted(content, baseContent))

  if (opts.dryRun) {
    console.log(`[dry-run] ${file}: would add ${added} keys, remove ${removed} keys`)
  } else {
    fs.writeFileSync(filePath, rendered)
    console.log(`Updated ${file}: added ${added} keys, removed ${removed} keys`)
  }
}

