/**
 * lib/registry.ts
 * Load and save the authorship-registry.json file.
 */

import fs from 'fs'
import path from 'path'

export interface AuthorEntry {
  /** Display string: "Name <email> @ shortHash" */
  author: string
}

/** registry[fileName][translationKey] = author entry string */
export type AuthorshipRegistry = Record<string, Record<string, string>>

const REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'authorship-registry.json')

export function loadRegistry(): AuthorshipRegistry {
  if (fs.existsSync(REGISTRY_PATH)) {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as AuthorshipRegistry
  }
  return {}
}

export function saveRegistry(registry: AuthorshipRegistry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n')
}

/** Formats an author entry string from its parts. */
export function formatAuthorEntry(name: string, email: string, hash: string): string {
  return `${name} <${email}> @ ${hash}`
}

