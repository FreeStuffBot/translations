/**
 * lib/git.ts
 * Shared helpers for interacting with git via child_process.
 * Always executes commands with cwd set to the repository root.
 */

import path from 'path'
import { execSync, ExecSyncOptions } from 'child_process'

export const REPO_ROOT = path.resolve(__dirname, '..', '..')
const EXEC_OPTS: ExecSyncOptions = { encoding: 'utf8', cwd: REPO_ROOT }

function exec(cmd: string): string {
  return (execSync(cmd, EXEC_OPTS) as string).trim()
}

function execOrNull(cmd: string): string | null {
  try {
    return exec(cmd)
  } catch {
    return null
  }
}

/** Returns the short hash of a given ref (defaults to HEAD). */
export function shortHash(ref = 'HEAD'): string {
  return exec(`git rev-parse --short ${ref}`)
}

/** Returns the full hash of a given ref. */
export function fullHash(ref = 'HEAD'): string {
  return exec(`git rev-parse ${ref}`)
}

/**
 * Returns the content of a file at a specific commit ref.
 * Returns null if the file didn't exist at that ref.
 */
export function showFileAtRef(ref: string, filePath: string): string | null {
  return execOrNull(`git show ${ref}:${filePath}`)
}

/**
 * Returns the list of files changed between two refs (defaults HEAD~1 → HEAD).
 * Filters by an optional path pattern (glob).
 */
export function changedFilesBetween(from = 'HEAD~1', to = 'HEAD', pattern?: string): string[] {
  const patternArg = pattern ? ` -- "${pattern}"` : ''
  const raw = execOrNull(`git diff --name-only ${from} ${to}${patternArg}`)
  if (!raw) return []
  return raw.split('\n').map(s => s.trim()).filter(Boolean)
}

export interface CommitInfo {
  hash: string
  shortHash: string
  authorName: string
  authorEmail: string
  subject: string
}

/**
 * Returns all commits that touched a path pattern, in chronological order
 * (oldest first).
 */
export function logCommitsForPath(pathPattern: string): CommitInfo[] {
  const raw = execOrNull(
    `git log --reverse --pretty=format:"%H|%h|%aN|%aE|%s" -- "${pathPattern}"`
  )
  if (!raw) return []
  return raw.split('\n').filter(Boolean).map(line => {
    const [hash, sh, authorName, authorEmail, ...rest] = line.split('|')
    return { hash, shortHash: sh, authorName, authorEmail, subject: rest.join('|') }
  })
}

/**
 * Returns the files changed in a specific commit (relative to its parent).
 */
export function filesChangedInCommit(hash: string): string[] {
  const raw = execOrNull(`git diff-tree --no-commit-id -r --name-only ${hash}`)
  if (!raw) return []
  return raw.split('\n').map(s => s.trim()).filter(Boolean)
}
