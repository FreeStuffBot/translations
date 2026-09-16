/**
 * lib/validate.ts
 * Core validation engines for translation files.
 * Ported from agents/validate-translations.js (originally written by the agent team).
 */

import {
  TranslationMap,
  extractVariables,
  extractMarkdownLinks,
  frequencies,
  frequenciesEqual,
} from './jsonc'

export const EXEMPT_EMPTY_KEY = 'settings_botprofile_name_description'

// ---------------------------------------------------------------------------
// Individual validation engines
// ---------------------------------------------------------------------------

export interface SchemaResult {
  missingKeys: string[]
  extraKeys: string[]
  nonStringKeys: string[]
  keyCount: number
  valid: boolean
}

export function validateSchema(target: TranslationMap, base: TranslationMap): SchemaResult {
  const baseKeys = Object.keys(base)
  const targetKeys = Object.keys(target)
  const missingKeys = baseKeys.filter(k => !(k in target))
  const extraKeys = targetKeys.filter(k => !(k in base))
  const nonStringKeys = targetKeys.filter(k => typeof target[k] !== 'string')
  const valid =
    missingKeys.length === 0 &&
    extraKeys.length === 0 &&
    nonStringKeys.length === 0 &&
    targetKeys.length === baseKeys.length
  return { missingKeys, extraKeys, nonStringKeys, keyCount: targetKeys.length, valid }
}

export interface ValuesResult {
  emptyKeys: string[]
  whitespaceKeys: string[]
  invalidArtifacts: Array<{ key: string; value: string; reason: string }>
  valid: boolean
}

export function validateValues(target: TranslationMap, _base: TranslationMap): ValuesResult {
  const emptyKeys: string[] = []
  const whitespaceKeys: string[] = []
  const invalidArtifacts: ValuesResult['invalidArtifacts'] = []

  for (const [k, v] of Object.entries(target)) {
    if (typeof v !== 'string') continue
    if (k === EXEMPT_EMPTY_KEY) {
      if (v === '') continue
      if (v.trim() === '' && v.length > 0) { whitespaceKeys.push(k); continue }
      if (/^\(falta\)$/i.test(v) || /^\(missing/i.test(v)) {
        invalidArtifacts.push({ key: k, value: v, reason: `Exempt key must be empty string "", got sync artifact "${v}"` })
        continue
      }
      invalidArtifacts.push({ key: k, value: v, reason: `Exempt key must be empty string ""` })
      continue
    }
    if (v === '') emptyKeys.push(k)
    else if (v.trim() === '') whitespaceKeys.push(k)
  }

  return {
    emptyKeys,
    whitespaceKeys,
    invalidArtifacts,
    valid: emptyKeys.length === 0 && whitespaceKeys.length === 0 && invalidArtifacts.length === 0,
  }
}

export interface VariablesResult {
  varMismatches: Array<{ key: string; expected: Record<string, number>; actual: Record<string, number> }>
  valid: boolean
}

export function validateVariables(target: TranslationMap, base: TranslationMap): VariablesResult {
  const varMismatches: VariablesResult['varMismatches'] = []
  for (const [k, targetVal] of Object.entries(target)) {
    if (typeof targetVal !== 'string' || targetVal === '') continue
    const baseVal = base[k]
    if (typeof baseVal !== 'string') continue
    const bf = frequencies(extractVariables(baseVal))
    const tf = frequencies(extractVariables(targetVal))
    if (!frequenciesEqual(bf, tf)) varMismatches.push({ key: k, expected: bf, actual: tf })
  }
  return { varMismatches, valid: varMismatches.length === 0 }
}

export interface LinksResult {
  linkMismatches: Array<{ key: string; reason: string }>
  valid: boolean
}

export function validateMarkdownLinks(target: TranslationMap, base: TranslationMap): LinksResult {
  const linkMismatches: LinksResult['linkMismatches'] = []
  for (const [k, targetVal] of Object.entries(target)) {
    if (typeof targetVal !== 'string' || targetVal === '') continue
    const baseVal = base[k]
    if (typeof baseVal !== 'string') continue
    const baseLinks = extractMarkdownLinks(baseVal)
    const targetLinks = extractMarkdownLinks(targetVal)
    if (baseLinks.length === 0 && targetLinks.length === 0) continue
    const bf = frequencies(baseLinks.map(l => l.url))
    const tf = frequencies(targetLinks.map(l => l.url))
    if (!frequenciesEqual(bf, tf)) {
      linkMismatches.push({
        key: k,
        reason: baseLinks.length !== targetLinks.length
          ? `Link count mismatch: expected ${baseLinks.length}, found ${targetLinks.length}`
          : `Link URL mismatch: expected ${JSON.stringify(bf)}, got ${JSON.stringify(tf)}`,
      })
    }
  }
  return { linkMismatches, valid: linkMismatches.length === 0 }
}

// ---------------------------------------------------------------------------
// Combined report
// ---------------------------------------------------------------------------

export interface ValidationReport {
  langName: string
  passed: boolean
  schema: SchemaResult
  values: ValuesResult
  variables: VariablesResult
  links: LinksResult
}

export function validateTranslation(
  target: TranslationMap,
  base: TranslationMap,
  langName: string
): ValidationReport {
  const schema = validateSchema(target, base)
  const values = validateValues(target, base)
  const variables = validateVariables(target, base)
  const links = validateMarkdownLinks(target, base)
  return {
    langName,
    passed: schema.valid && values.valid && variables.valid && links.valid,
    schema,
    values,
    variables,
    links,
  }
}

