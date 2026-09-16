#!/usr/bin/env bun
/**
 * agents/validate-translations.ts
 *
 * Programmatic 4-tier validation test suite for translation files.
 * Validates discord-bot/*.jsonc files against en-US.jsonc.
 *
 * Used by: agent pipelines, CI/CD, maintainers
 *
 * Usage:
 *   bun scripts/agents/validate-translations.ts [options]
 *
 * Options:
 *   --tier <n>       Run a specific tier only: 1, 2, 3, 4, or all (default: all)
 *   --unit           Run unit tiers only (1, 2, 3) — skip real-file Tier 4
 *   --lang <code>    Validate a single language file (e.g. de, sk.jsonc)
 *   --json           Output Tier 4 results as JSON
 *   -h, --help       Show this help
 *
 * Tiers:
 *   1  Feature Coverage   — key parity & non-empty strings
 *   2  Boundary Cases     — ICU plurals, escaped quotes, comment stripping
 *   3  Cross-Feature      — variable matching, markdown link preservation
 *   4  Real-World         — full validation of files in discord-bot/
 *
 * Exit codes: 0 = all pass, 1 = one or more failures
 */

import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { Command } from 'commander'
import { loadJsoncFile, parseJsonc, stripJsoncComments, extractVariables, extractMarkdownLinks, frequencies, frequenciesEqual } from '../lib/jsonc'
import {
  validateSchema, validateValues, validateVariables, validateMarkdownLinks,
  validateTranslation, EXEMPT_EMPTY_KEY, ValidationReport,
} from '../lib/validate'

const program = new Command()
program
  .name('validate-translations')
  .description('4-tier translation validation test suite')
  .option('--tier <n>', 'Run specific tier (1/2/3/4/all)', 'all')
  .option('--unit', 'Run unit tiers only (1, 2, 3)', false)
  .option('--lang <code>', 'Validate a single language file (e.g. de, sk.jsonc)')
  .option('--json', 'Output Tier 4 results as JSON', false)
  .parse()

const opts = program.opts<{ tier: string; unit: boolean; lang?: string; json: boolean }>()

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..')
const DISCORD_BOT_DIR = path.join(WORKSPACE_ROOT, 'discord-bot')
const BASE_FILE = 'en-US.jsonc'
const DEFAULT_TARGETS = ['de.jsonc', 'sk.jsonc', 'fr.jsonc', 'es-ES.jsonc']
const EXPECTED_KEY_COUNT = 524

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

class TestReporter {
  total = 0; passed = 0; failed = 0
  errors: Array<{ name: string; error: Error }> = []

  test(name: string, fn: () => void): void {
    this.total++
    try {
      fn()
      this.passed++
      console.log(`  ✓ ${name}`)
    } catch (err) {
      this.failed++
      this.errors.push({ name, error: err as Error })
      console.error(`  ✗ ${name}`)
      console.error(`    ${(err as Error).message}`)
    }
  }

  summary(title: string): boolean {
    console.log(`\n${title} Summary: ${this.passed}/${this.total} passed, ${this.failed} failed.`)
    return this.failed === 0
  }
}

// ---------------------------------------------------------------------------
// Tier 1 — Feature Coverage
// ---------------------------------------------------------------------------

function runTier1(): boolean {
  console.log('\n================================================================')
  console.log('Tier 1: Feature Coverage (Key Parity & Non-Empty Strings)')
  console.log('================================================================')
  const tr = new TestReporter()

  tr.test('1.1 Identical keys and string values pass', () => {
    assert.strictEqual(validateSchema({ a: 'Apfel', b: 'Banane' }, { a: 'Apple', b: 'Banana' }).valid, true)
  })
  tr.test('1.2 Missing key in target is detected', () => {
    const res = validateSchema({ a: 'Apfel' }, { a: 'Apple', b: 'Banana' })
    assert.strictEqual(res.valid, false)
    assert.deepStrictEqual(res.missingKeys, ['b'])
  })
  tr.test('1.3 Extra unexpected key in target is detected', () => {
    const res = validateSchema({ a: 'Apfel', c: 'Zitrone' }, { a: 'Apple' })
    assert.strictEqual(res.valid, false)
    assert.deepStrictEqual(res.extraKeys, ['c'])
  })
  tr.test('1.4 Non-string values are rejected', () => {
    const res = validateSchema({ a: 123, b: true, c: null } as never, { a: 'a', b: 'b', c: 'c' })
    assert.strictEqual(res.nonStringKeys.length, 3)
  })
  tr.test('1.5 Populated string values pass', () => {
    assert.strictEqual(validateValues({ a: 'Apfel', b: 'Banane' }, { a: 'Apple', b: 'Banana' }).valid, true)
  })
  tr.test('1.6 Empty string values are detected', () => {
    const res = validateValues({ a: 'Apfel', b: '' }, { a: 'Apple', b: 'Banana' })
    assert.deepStrictEqual(res.emptyKeys, ['b'])
  })

  return tr.summary('Tier 1')
}

// ---------------------------------------------------------------------------
// Tier 2 — Boundary & Corner Cases
// ---------------------------------------------------------------------------

function runTier2(): boolean {
  console.log('\n================================================================')
  console.log('Tier 2: Boundary & Corner Cases')
  console.log('================================================================')
  const tr = new TestReporter()

  tr.test('2.1 Exempt key is allowed to be empty string', () => {
    const res = validateValues({ [EXEMPT_EMPTY_KEY]: '', regular_key: 'Hallo' }, { [EXEMPT_EMPTY_KEY]: '', regular_key: 'Hello' })
    assert.strictEqual(res.valid, true)
  })
  tr.test('2.2 Exempt key: "(falta)" dummy is rejected', () => {
    const res = validateValues({ [EXEMPT_EMPTY_KEY]: '(falta)', x: 'Hola' }, { [EXEMPT_EMPTY_KEY]: '', x: 'Hello' })
    assert.strictEqual(res.valid, false)
    assert.strictEqual(res.invalidArtifacts.length, 1)
  })
  tr.test('2.3 Pure whitespace values are rejected', () => {
    const res = validateValues({ a: '   ', b: '\t\n ' }, { a: 'Hello', b: 'World' })
    assert.strictEqual(res.valid, false)
    assert.deepStrictEqual(res.whitespaceKeys, ['a', 'b'])
  })
  tr.test('2.4 ICU plural nested braces parse correctly', () => {
    assert.deepStrictEqual(extractVariables('Expires in {hours, plural, =1 {1 hour} other {# hours} }!'), ['hours'])
  })
  tr.test('2.5 Localized ICU branches preserve outer variable', () => {
    assert.deepStrictEqual(extractVariables('Vyprší za {hours, plural, =1 {1 hodinu} few {# hodiny} other {# hodín} }!'), ['hours'])
  })
  tr.test('2.6 Escaped quotes parse cleanly', () => {
    const parsed = parseJsonc('{\n  // comment\n  "k": "Missing \\"Permission\\" name"\n}', 'test.jsonc')
    assert.strictEqual(parsed['k'], 'Missing "Permission" name')
  })
  tr.test('2.7 http:// inside string values is preserved by comment stripper', () => {
    const parsed = parseJsonc('{\n  "k": "starts with `http://` or `https://`"\n}', 'test.jsonc')
    assert.ok(parsed['k'].includes('http://'))
  })
  tr.test('2.8 <{url}> embed suppression extracts variable correctly', () => {
    assert.deepStrictEqual(extractVariables('**{name}** is free!\n<{url}>').sort(), ['name', 'url'])
  })

  return tr.summary('Tier 2')
}

// ---------------------------------------------------------------------------
// Tier 3 — Cross-Feature Combinations
// ---------------------------------------------------------------------------

function runTier3(): boolean {
  console.log('\n================================================================')
  console.log('Tier 3: Cross-Feature Combinations')
  console.log('================================================================')
  const tr = new TestReporter()

  tr.test('3.1 Variable order swap passes', () => {
    assert.strictEqual(validateVariables({ k: '{next} und {prev}' }, { k: '{prev}, and {next}' }).valid, true)
  })
  tr.test('3.2 Repeated variable count mismatch detected', () => {
    const res = validateVariables({ k: '{name} ist verfügbar' }, { k: '{name} is for {name}' })
    assert.strictEqual(res.valid, false)
    assert.deepStrictEqual(res.varMismatches[0].expected, { name: 2 })
  })
  tr.test('3.3 Variable name typo ({times} vs {time}) detected', () => {
    assert.strictEqual(validateVariables({ k: 'Attendez {times} secondes.' }, { k: 'Wait {time} seconds.' }).valid, false)
  })
  tr.test('3.4 Translated link text with preserved URL passes', () => {
    assert.strictEqual(validateMarkdownLinks(
      { k: 'Klicke [hier]({inviteLink}) um beizutreten.' },
      { k: 'Click [here]({inviteLink}) to join.' }
    ).valid, true)
  })
  tr.test('3.5 Modified URL destination is rejected', () => {
    assert.strictEqual(validateMarkdownLinks(
      { k: 'Cliquez [ici]({lienInvitation}) pour rejoindre.' },
      { k: 'Click [here]({inviteLink}) to join.' }
    ).valid, false)
  })
  tr.test('3.6 Combined: links + variables + bold + newlines', () => {
    const base = { k: '**Notice:** Use `{cmd}`.\n[Support]({invite}) or [Guide]({guide}) for {user}!' }
    const target = { k: '**Hinweis:** Benutze `{cmd}`.\n[Hilfe]({invite}) oder [Anleitung]({guide}) für {user}!' }
    assert.strictEqual(validateVariables(target, base).valid, true)
    assert.strictEqual(validateMarkdownLinks(target, base).valid, true)
  })

  return tr.summary('Tier 3')
}

// ---------------------------------------------------------------------------
// Tier 4 — Real-World Repository Validation
// ---------------------------------------------------------------------------

function runTier4(targetFiles: string[], jsonOutput: boolean): { allPassed: boolean; results: Record<string, unknown> } {
  if (!jsonOutput) {
    console.log('\n================================================================')
    console.log('Tier 4: Real-World Repository Validation')
    console.log('================================================================')
  }

  const basePath = path.join(DISCORD_BOT_DIR, BASE_FILE)
  if (!fs.existsSync(basePath)) {
    console.error(`Base file not found: ${basePath}`)
    return { allPassed: false, results: {} }
  }

  const baseData = loadJsoncFile(basePath)
  const baseKeyCount = Object.keys(baseData).length
  if (!jsonOutput) {
    console.log(`Loaded ${BASE_FILE} (${baseKeyCount} keys)`)
    if (baseKeyCount !== EXPECTED_KEY_COUNT) {
      console.warn(`  ⚠ Key count ${baseKeyCount} differs from expected ${EXPECTED_KEY_COUNT}`)
    }
  }

  let allPassed = true
  const results: Record<string, unknown> = {}

  for (const file of targetFiles) {
    const filePath = path.isAbsolute(file) ? file : path.join(DISCORD_BOT_DIR, path.basename(file))
    const fileName = path.basename(filePath)
    if (!jsonOutput) console.log(`\nValidating: ${fileName}...`)

    if (!fs.existsSync(filePath)) {
      if (!jsonOutput) console.error(`  ✗ File not found: ${filePath}`)
      allPassed = false
      results[fileName] = { error: 'File not found', passed: false }
      continue
    }

    let targetData
    try { targetData = loadJsoncFile(filePath) }
    catch (err) {
      if (!jsonOutput) console.error(`  ✗ JSONC parse failure: ${(err as Error).message}`)
      allPassed = false
      results[fileName] = { error: (err as Error).message, passed: false }
      continue
    }

    const report: ValidationReport = validateTranslation(targetData, baseData, fileName)
    results[fileName] = report
    if (!report.passed) allPassed = false

    if (!jsonOutput) {
      if (report.passed) {
        console.log(`  ✓ ALL CHECKS PASSED (${report.schema.keyCount} keys)`)
      } else {
        console.log('  ✗ VALIDATION FAILURES:')
        if (report.schema.missingKeys.length > 0) console.log(`    - Missing keys (${report.schema.missingKeys.length}): ${report.schema.missingKeys.slice(0, 10).join(', ')}`)
        if (report.schema.extraKeys.length > 0) console.log(`    - Extra keys (${report.schema.extraKeys.length}): ${report.schema.extraKeys.slice(0, 10).join(', ')}`)
        if (report.values.emptyKeys.length > 0) console.log(`    - Empty values (${report.values.emptyKeys.length}): ${report.values.emptyKeys.slice(0, 10).join(', ')}`)
        if (report.values.invalidArtifacts.length > 0) report.values.invalidArtifacts.forEach(a => console.log(`    - Artifact: ${a.key}: ${a.reason}`))
        if (report.variables.varMismatches.length > 0) report.variables.varMismatches.forEach(m => console.log(`    - Var mismatch: ${m.key}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`))
        if (report.links.linkMismatches.length > 0) report.links.linkMismatches.forEach(m => console.log(`    - Link mismatch: ${m.key}: ${m.reason}`))
      }
    }
  }

  if (!jsonOutput) {
    console.log('\n' + '='.repeat(72))
    console.log(`${'File'.padEnd(20)}${'Status'.padEnd(10)}${'Keys'.padEnd(8)}${'Missing'.padEnd(10)}${'Empty'.padEnd(8)}${'VarErr'.padEnd(8)}${'LinkErr'}`)
    console.log('-'.repeat(72))
    for (const file of targetFiles) {
      const fileName = path.basename(file)
      const rep = results[fileName] as ValidationReport & { error?: string }
      if (!rep || rep.error) {
        console.log(`${fileName.padEnd(20)}ERROR`)
      } else {
        console.log(
          fileName.padEnd(20) +
          (rep.passed ? 'PASS' : 'FAIL').padEnd(10) +
          String(rep.schema.keyCount).padEnd(8) +
          String(rep.schema.missingKeys.length).padEnd(10) +
          String(rep.values.emptyKeys.length + rep.values.invalidArtifacts.length).padEnd(8) +
          String(rep.variables.varMismatches.length).padEnd(8) +
          String(rep.links.linkMismatches.length)
        )
      }
    }
    console.log('='.repeat(72))
  }

  return { allPassed, results }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function main() {
  if (opts.lang) {
    const lang = opts.lang.endsWith('.jsonc') ? opts.lang : opts.lang + '.jsonc'
    const { allPassed, results } = runTier4([lang], opts.json)
    if (opts.json) console.log(JSON.stringify(results, null, 2))
    process.exit(allPassed ? 0 : 1)
  }

  if (opts.unit) {
    const ok = runTier1() && runTier2() && runTier3()
    process.exit(ok ? 0 : 1)
  }

  if (opts.tier !== 'all') {
    const t = Number(opts.tier)
    const ok = t === 1 ? runTier1() : t === 2 ? runTier2() : t === 3 ? runTier3() : runTier4(DEFAULT_TARGETS, opts.json).allPassed
    process.exit(ok ? 0 : 1)
  }

  const t1 = runTier1(), t2 = runTier2(), t3 = runTier3()
  const { allPassed: t4, results } = runTier4(DEFAULT_TARGETS, opts.json)

  if (opts.json) {
    console.log(JSON.stringify({ tier1: t1, tier2: t2, tier3: t3, tier4: results, overallPassed: t1 && t2 && t3 && t4 }, null, 2))
  } else {
    console.log('\nFINAL SUITE SUMMARY')
    console.log('='.repeat(40))
    console.log(`Unit Tiers (1-3):    ${t1 && t2 && t3 ? 'PASSED' : 'FAILED'}`)
    console.log(`Repo Validation (4): ${t4 ? 'PASSED' : 'FAILED'}`)
    console.log(`Overall:             ${t1 && t2 && t3 && t4 ? 'SUCCESS (0)' : 'FAILURE (1)'}`)
  }

  process.exit(t1 && t2 && t3 && t4 ? 0 : 1)
}

main()

