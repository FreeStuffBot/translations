#!/usr/bin/env bun
/**
 * agents/adversarial-probes.ts
 *
 * Adversarial probe harness. Stress-tests the validator engine itself and
 * independently audits the 4 target translation files against en-US.jsonc.
 *
 * Used by: agent pipelines and CI/CD for independent victory audits
 *
 * Usage:
 *   bun scripts/agents/adversarial-probes.ts [options]
 *
 * Options:
 *   --lang <code>   Audit a specific language only (e.g. de, sk.jsonc)
 *   --part <n>      Run only part 1 (engine), 2 (oracle), or 3 (tone) — default: all
 *   -h, --help      Show this help
 *
 * Exit codes: 0 = all probes passed, 1 = one or more failures
 */

import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { Command } from 'commander'
import {
  stripJsoncComments, parseJsonc, loadJsoncFile, extractVariables,
  extractMarkdownLinks, frequencies, frequenciesEqual,
} from '../lib/jsonc'
import {
  validateSchema, validateValues, validateVariables, validateMarkdownLinks,
  EXEMPT_EMPTY_KEY,
} from '../lib/validate'

const program = new Command()
program
  .name('adversarial-probes')
  .description('Adversarial stress-tests of the validator engine + independent oracle validation of repo files')
  .option('--lang <code>', 'Audit a specific language only (e.g. de, sk.jsonc)')
  .option('--part <n>', 'Run only part 1 (engine), 2 (oracle), or 3 (tone) — default: all', 'all')
  .parse()

const opts = program.opts<{ lang?: string; part: string }>()

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..')
const DISCORD_BOT_DIR = path.join(WORKSPACE_ROOT, 'discord-bot')
const BASE_FILE = path.join(DISCORD_BOT_DIR, 'en-US.jsonc')

const ALL_TARGETS: Record<string, string> = {
  de: path.join(DISCORD_BOT_DIR, 'de.jsonc'),
  'es-ES': path.join(DISCORD_BOT_DIR, 'es-ES.jsonc'),
  sk: path.join(DISCORD_BOT_DIR, 'sk.jsonc'),
  fr: path.join(DISCORD_BOT_DIR, 'fr.jsonc'),
}

// Narrow targets if --lang is given
const TARGET_FILES = opts.lang
  ? (() => {
    const code = opts.lang.replace(/\.jsonc$/, '')
    const p = ALL_TARGETS[code]
    if (!p) { console.error(`Unknown lang: ${code}`); process.exit(1) }
    return { [code]: p }
  })()
  : ALL_TARGETS

// ---------------------------------------------------------------------------
// Probe runner
// ---------------------------------------------------------------------------

let totalProbes = 0, passedProbes = 0, failedProbes = 0
const failureLog: Array<{ name: string; error: Error }> = []

function probe(name: string, fn: () => void): void {
  totalProbes++
  try {
    fn()
    passedProbes++
    console.log(`  [PASS] Probe ${totalProbes}: ${name}`)
  } catch (err) {
    failedProbes++
    failureLog.push({ name, error: err as Error })
    console.error(`  [FAIL] Probe ${totalProbes}: ${name}`)
    console.error(`         ${(err as Error).message}`)
  }
}

// ---------------------------------------------------------------------------
// Part 1: Engine adversarial stress-tests
// ---------------------------------------------------------------------------

if (opts.part === 'all' || opts.part === '1') {
  console.log('================================================================')
  console.log('PART 1: VALIDATOR ENGINE ADVERSARIAL STRESS-TESTS')
  console.log('================================================================')

  console.log('\n--- Category 1: Comment Stripping & URL Preservation ---')

  probe('1.1 http:// and https:// inside strings are preserved', () => {
    const parsed = parseJsonc('{\n  // header\n  "url": "Visit http://freestuffbot.xyz"\n}\n// trailing', 'test.jsonc')
    assert.ok(parsed['url'].includes('http://freestuffbot.xyz'))
  })

  probe('1.2 Double slash inside string values is preserved', () => {
    const parsed = parseJsonc('{\n  "path": "folder//subfolder"\n}', 'test.jsonc')
    assert.strictEqual(parsed['path'], 'folder//subfolder')
  })

  probe('1.3 Windows CRLF and trailing EOF comments are handled', () => {
    const parsed = parseJsonc('\r\n// Comment\r\n{\r\n  "key": "val"\r\n}\r\n// EOF', 'test.jsonc')
    assert.strictEqual(parsed['key'], 'val')
  })

  probe('1.4 parseJsonc throws descriptive error on malformed JSON', () => {
    assert.throws(
      () => parseJsonc('{\n  "bad": "unclosed\n}', 'bad.jsonc'),
      /JSON parse error in bad\.jsonc/
    )
  })

  console.log('\n--- Category 2: Schema & Key Parity ---')

  probe('2.1 Missing keys at start, middle, end are all detected', () => {
    const base = { k1: '1', k2: '2', k3: '3', k4: '4', k5: '5' }
    assert.strictEqual(validateSchema({ k2: '2', k3: '3', k4: '4', k5: '5' }, base).valid, false)
    assert.strictEqual(validateSchema({ k1: '1', k2: '2', k4: '4', k5: '5' }, base).valid, false)
    assert.strictEqual(validateSchema({}, base).valid, false)
  })

  probe('2.2 Extra keys are detected', () => {
    const res = validateSchema({ k1: '1', k2: '2', extra: '0' }, { k1: '1', k2: '2' })
    assert.deepStrictEqual(res.extraKeys, ['extra'])
  })

  probe('2.3 Substituted key (same count, different name) is detected', () => {
    const res = validateSchema({ a: '1', b: '2', d: '4' }, { a: '1', b: '2', c: '3' })
    assert.deepStrictEqual(res.missingKeys, ['c'])
    assert.deepStrictEqual(res.extraKeys, ['d'])
  })

  probe('2.4 Non-string types (null, bool, number, array, object) are rejected', () => {
    const target = { k1: null, k2: false, k3: 12345, k4: ['arr'], k5: { obj: true } } as never
    assert.strictEqual(validateSchema(target, { k1: 'a', k2: 'b', k3: 'c', k4: 'd', k5: 'e' }).nonStringKeys.length, 5)
  })

  console.log('\n--- Category 3: Value Validation & Boundary Cases ---')

  probe('3.1 Empty string values are detected', () => {
    const res = validateValues({ key1: 'translated', key2: '' }, { key1: 'v', key2: 'v' })
    assert.deepStrictEqual(res.emptyKeys, ['key2'])
  })

  probe('3.2 Whitespace-only strings are detected', () => {
    const res = validateValues({ k1: '   ', k2: '\t', k3: '\n\n' }, { k1: 'a', k2: 'b', k3: 'c' })
    assert.strictEqual(res.whitespaceKeys.length, 3)
  })

  probe('3.3 Leading/trailing whitespace with content is permitted', () => {
    assert.strictEqual(validateValues({ k: '\n* Bullet' }, { k: 'bullet' }).valid, true)
  })

  probe('3.4 Exempt key rules enforced: empty passes, whitespace/artifacts fail', () => {
    const base = { [EXEMPT_EMPTY_KEY]: '', n: 'hi' }
    assert.strictEqual(validateValues({ [EXEMPT_EMPTY_KEY]: '', n: 'bonjour' }, base).valid, true)
    assert.strictEqual(validateValues({ [EXEMPT_EMPTY_KEY]: '   ', n: 'bonjour' }, base).valid, false)
    assert.strictEqual(validateValues({ [EXEMPT_EMPTY_KEY]: '(falta)', n: 'bonjour' }, base).valid, false)
  })

  console.log('\n--- Category 4: Variable Extraction & Matching ---')

  probe('4.1 Single, multiple, adjacent, punctuated variables', () => {
    assert.deepStrictEqual(extractVariables('Hello {name}!'), ['name'])
    assert.deepStrictEqual(extractVariables('{a} {b} {c}'), ['a', 'b', 'c'])
    assert.deepStrictEqual(extractVariables('({user}), [{role}].'), ['user', 'role'])
    assert.deepStrictEqual(extractVariables('No vars'), [])
  })

  probe('4.2 ICU plural and select expressions extract outer variable', () => {
    assert.deepStrictEqual(extractVariables('{hours, plural, =1 {1 hour} other {# hours} }'), ['hours'])
    assert.deepStrictEqual(extractVariables('{gender, select, male {He} female {She} other {They}}'), ['gender'])
  })

  probe('4.3 Variable multiset frequency matching regardless of order', () => {
    assert.strictEqual(validateVariables({ k: '{bot}, {start} bis {end}' }, { k: 'From {start} to {end}, powered by {bot}' }).valid, true)
    assert.strictEqual(validateVariables({ k: '{start} bis {end}' }, { k: 'From {start} to {end}, powered by {bot}' }).valid, false)
  })

  probe('4.4 Variable name typo is detected ({times} vs {time})', () => {
    const res = validateVariables({ k: 'Expire dans {times} secondes' }, { k: 'Wait {time} seconds' })
    assert.deepStrictEqual(res.varMismatches[0].expected, { time: 1 })
    assert.deepStrictEqual(res.varMismatches[0].actual, { times: 1 })
  })

  console.log('\n--- Category 5: Markdown Link Extraction & Matching ---')

  probe('5.1 Link text and URL extraction', () => {
    const links = extractMarkdownLinks('Join [support]({invite}) or read [docs]({guide})!')
    assert.strictEqual(links.length, 2)
    assert.strictEqual(links[0].url, '{invite}')
    assert.strictEqual(links[1].url, '{guide}')
  })

  probe('5.2 Translated text with preserved URL passes', () => {
    assert.strictEqual(validateMarkdownLinks(
      { k: "Rejoins [serveur]({invite}) ou [guide]({guide})" },
      { k: 'Join [support]({invite}) or [guide]({guide})' }
    ).valid, true)
  })

  probe('5.3 Translated URL target is rejected', () => {
    assert.strictEqual(validateMarkdownLinks(
      { k: 'Cliquez [ici]({lienInvitation})' },
      { k: 'Click [here]({inviteLink})' }
    ).valid, false)
  })
}

// ---------------------------------------------------------------------------
// Part 2: Independent oracle validation of repo files
// ---------------------------------------------------------------------------

if (opts.part === 'all' || opts.part === '2') {
  console.log('\n================================================================')
  console.log('PART 2: INDEPENDENT ORACLE VALIDATION OF REPO FILES')
  console.log('================================================================')

  const rawBase = fs.readFileSync(BASE_FILE, 'utf8')
  const baseData = parseJsonc(rawBase, 'en-US.jsonc')
  const baseKeys = Object.keys(baseData)

  probe('2.0 en-US.jsonc baseline invariants (524 keys)', () => {
    assert.strictEqual(baseKeys.length, 524, `en-US.jsonc must have exactly 524 keys, got ${baseKeys.length}`)
  })

  for (const [langCode, filePath] of Object.entries(TARGET_FILES)) {
    const fileName = path.basename(filePath)
    console.log(`\n--- Auditing ${fileName} (${langCode}) ---`)

    probe(`${langCode}: File exists and parses cleanly`, () => {
      assert.ok(fs.existsSync(filePath), `${filePath} does not exist`)
      const data = parseJsonc(fs.readFileSync(filePath, 'utf8'), fileName)
      assert.strictEqual(typeof data, 'object')
    })

    const data = parseJsonc(fs.readFileSync(filePath, 'utf8'), fileName)
    const targetKeys = Object.keys(data)

    probe(`${langCode}: Key parity (524 keys, 0 missing, 0 extra)`, () => {
      assert.strictEqual(targetKeys.length, 524, `Expected 524, found ${targetKeys.length}`)
      assert.deepStrictEqual(baseKeys.filter(k => !(k in data)), [], 'Missing keys')
      assert.deepStrictEqual(targetKeys.filter(k => !(k in baseData)), [], 'Extra keys')
    })

    probe(`${langCode}: Key ordering matches en-US.jsonc`, () => {
      assert.deepStrictEqual(targetKeys, baseKeys)
    })

    probe(`${langCode}: Non-empty values (only exempt key may be empty)`, () => {
      const emptyKeys = targetKeys.filter(k => data[k] === '')
      assert.deepStrictEqual(emptyKeys, [EXEMPT_EMPTY_KEY], `Unexpected empty keys: ${emptyKeys.join(', ')}`)
    })

    probe(`${langCode}: No whitespace-only values`, () => {
      const ws = targetKeys.filter(k => data[k].trim() === '' && data[k].length > 0)
      assert.deepStrictEqual(ws, [])
    })

    probe(`${langCode}: No TODO/TBD/falta placeholder artifacts`, () => {
      const forbiddenPatterns = [/\b(?:TODO|TBD|FIXME)\b/, /\((?:falta|missing)\)/i]
      const found = Object.entries(data).filter(([, v]) => forbiddenPatterns.some(p => p.test(v))).map(([k]) => k)
      assert.deepStrictEqual(found, [])
    })

    probe(`${langCode}: Variable preservation across all 524 keys`, () => {
      const mismatches = baseKeys.filter(k => {
        const bf = frequencies(extractVariables(baseData[k]))
        const tf = frequencies(extractVariables(data[k]))
        return !frequenciesEqual(bf, tf)
      })
      assert.deepStrictEqual(mismatches, [], `Variable mismatches: ${mismatches.join(', ')}`)
    })

    probe(`${langCode}: Markdown link preservation across all keys`, () => {
      const mismatches = baseKeys.filter(k => {
        const bl = extractMarkdownLinks(baseData[k]).map(l => l.url).sort()
        const tl = extractMarkdownLinks(data[k]).map(l => l.url).sort()
        return JSON.stringify(bl) !== JSON.stringify(tl)
      })
      assert.deepStrictEqual(mismatches, [])
    })

    probe(`${langCode}: default_currency is 'eur'`, () => {
      assert.strictEqual(data['default_currency'], 'eur')
    })

    probe(`${langCode}: help_main_2 uses {commandFree} and {commandSettings}`, () => {
      const v = data['help_main_2']
      assert.ok(v.includes('{commandFree}'))
      assert.ok(v.includes('{commandSettings}'))
      assert.ok(!v.includes('/free'), 'Raw /free found instead of {commandFree}')
      assert.ok(!v.includes('/settings'), 'Raw /settings found instead of {commandSettings}')
    })

    probe(`${langCode}: No invisible zero-width characters`, () => {
      const hits = Object.entries(data).filter(([, v]) => /[\u200B-\u200D\uFEFF]/.test(v)).map(([k]) => k)
      assert.deepStrictEqual(hits, [])
    })
  }
}

// ---------------------------------------------------------------------------
// Part 3: Tone & register checks
// ---------------------------------------------------------------------------

if (opts.part === 'all' || opts.part === '3') {
  console.log('\n================================================================')
  console.log('PART 3: SPECIALIZED TONE & REGISTER CHECKS')
  console.log('================================================================')

  if (ALL_TARGETS['de'] && fs.existsSync(ALL_TARGETS['de'])) {
    const dataDe = parseJsonc(fs.readFileSync(ALL_TARGETS['de'], 'utf8'), 'de.jsonc')
    probe('3.1 German: no formal "Ihnen"', () => {
      const hits = Object.entries(dataDe).filter(([, v]) => /\bIhnen\b/.test(v)).map(([k]) => k)
      assert.deepStrictEqual(hits, [])
    })
  }

  if (ALL_TARGETS['es-ES'] && fs.existsSync(ALL_TARGETS['es-ES'])) {
    const dataEs = parseJsonc(fs.readFileSync(ALL_TARGETS['es-ES'], 'utf8'), 'es-ES.jsonc')
    probe('3.2 Spanish: no formal "usted/ustedes"', () => {
      const hits = Object.entries(dataEs).filter(([, v]) => /\busted\b|\bustedes\b/i.test(v)).map(([k]) => k)
      assert.deepStrictEqual(hits, [])
    })
  }

  if (ALL_TARGETS['fr'] && fs.existsSync(ALL_TARGETS['fr'])) {
    const dataFr = parseJsonc(fs.readFileSync(ALL_TARGETS['fr'], 'utf8'), 'fr.jsonc')
    probe('3.3 French: cmd_on_cooldown_2 uses {time} not {times}', () => {
      const v = dataFr['cmd_on_cooldown_2']
      assert.ok(v.includes('{time}'))
      assert.ok(!v.includes('{times}'))
    })
  }

  if (ALL_TARGETS['sk'] && fs.existsSync(ALL_TARGETS['sk'])) {
    const dataSk = parseJsonc(fs.readFileSync(ALL_TARGETS['sk'], 'utf8'), 'sk.jsonc')
    probe('3.4 Slovak: ICU plural branches are localized (not English)', () => {
      const hours = dataSk['free_recommendation_expires_hours']
      const minutes = dataSk['free_recommendation_expires_minutes']
      assert.ok(hours.includes('hodin'), `hours plural not localized: ${hours}`)
      assert.ok(!hours.includes('1 hour'))
      assert.ok(minutes.includes('minút'), `minutes plural not localized: ${minutes}`)
      assert.ok(!minutes.includes('1 minute'))
    })
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n================================================================')
console.log(`CHALLENGER PROBE SUMMARY: ${passedProbes}/${totalProbes} Passed (${failedProbes} Failed)`)
console.log('================================================================')

process.exit(failedProbes > 0 ? 1 : 0)

