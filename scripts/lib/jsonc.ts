/**
 * lib/jsonc.ts
 * Shared utilities for reading and parsing .jsonc files.
 */

import fs from 'fs'
import path from 'path'

export type TranslationMap = Record<string, string>

/**
 * Strips single-line `//` comments from a JSONC string, correctly
 * ignoring `//` that appear inside quoted string values.
 */
export function stripJsoncComments(src: string): string {
  return src
    .split('\n')
    .map(line => {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"' && line[i - 1] !== '\\') inString = !inString
        if (!inString && ch === '/' && line[i + 1] === '/') {
          return line.slice(0, i).trimEnd()
        }
      }
      return line
    })
    .join('\n')
}

/**
 * Parses a JSONC string into an object.
 * Throws a descriptive error on parse failure.
 */
export function parseJsonc(src: string, fileName = 'unknown'): TranslationMap {
  try {
    return JSON.parse(stripJsoncComments(src))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`JSON parse error in ${fileName}: ${msg}`)
  }
}

/**
 * Loads and parses a .jsonc file from disk.
 */
export function loadJsoncFile(filePath: string): TranslationMap {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  return parseJsonc(raw, path.basename(filePath))
}

/**
 * Extracts all `{variable}` and ICU placeholder names from a translation string.
 * Handles nested ICU expressions like `{hours, plural, =1 {1 hour} other {# hours}}`.
 */
export function extractVariables(text: string): string[] {
  const vars: string[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 1
      const start = i
      i++
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') depth--
        i++
      }
      if (depth === 0) {
        const token = text.slice(start, i)
        const icuMatch = token.match(/^\{\s*([a-zA-Z0-9_]+)\s*,\s*(?:plural|select)\b/)
        if (icuMatch) {
          vars.push(icuMatch[1])
        } else {
          const simpleMatch = token.match(/^\{\s*([a-zA-Z0-9_]+)\s*\}$/)
          if (simpleMatch) vars.push(simpleMatch[1])
        }
      }
    } else {
      i++
    }
  }
  return vars
}

/**
 * Extracts all markdown links `[text](url)` from a translation string.
 */
export function extractMarkdownLinks(text: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = []
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    links.push({ text: match[1], url: match[2] })
  }
  return links
}

/** Returns a frequency map of items in an array. */
export function frequencies(arr: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of arr) counts[item] = (counts[item] ?? 0) + 1
  return counts
}

/** Compares two frequency maps for equality. */
export function frequenciesEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a).sort()
  const keysB = Object.keys(b).sort()
  if (keysA.length !== keysB.length) return false
  return keysA.every(k => a[k] === b[k])
}

