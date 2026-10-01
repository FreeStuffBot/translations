#!/usr/bin/env bun
/**
 * init/import.ts
 *
 * ONE-TIME USE. Imports a bulk JSON export (array of language objects with
 * an `_id` field) and writes each language as a separate .jsonc file.
 *
 * Used by: maintainers when migrating from a legacy database export
 *
 * Usage:
 *   bun scripts/init/import.ts --input <file.json> --package <dir>
 *
 * Options:
 *   -i, --input <file>    Path to the JSON array export file (required)
 *   -p, --package <dir>   Target package folder (default: discord-bot)
 */

import fs from 'fs'
import path from 'path'
import { Command } from 'commander'

const program = new Command()

program
  .name('import')
  .description('ONE-TIME: Import a bulk JSON language export into separate .jsonc files')
  .requiredOption('-i, --input <file>', 'Path to the JSON array export file')
  .option('-p, --package <dir>', 'Target package folder', 'discord-bot')
  .parse()

const opts = program.opts<{ input: string; package: string }>()

const inputPath = path.resolve(opts.input)
const outputDir = path.resolve(__dirname, '..', '..', opts.package)

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`)
  process.exit(1)
}

if (!fs.existsSync(outputDir)) {
  console.error(`Output directory not found: ${outputDir}`)
  process.exit(1)
}

const raw = fs.readFileSync(inputPath, 'utf8')
const languages: Array<Record<string, unknown>> = JSON.parse(raw)

let count = 0
for (const lang of languages) {
  if (typeof lang._id !== 'string') {
    console.warn(`Skipping entry without _id: ${JSON.stringify(lang).slice(0, 80)}`)
    continue
  }
  const outFile = path.join(outputDir, `${lang._id}.jsonc`)
  fs.writeFileSync(outFile, JSON.stringify(lang, null, 4))
  console.log(`  Written: ${outFile}`)
  count++
}

console.log(`\nDone. Imported ${count} language file(s).`)

