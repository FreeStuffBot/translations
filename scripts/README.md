# Scripts

> ⚠️ **Note for LLMs:** When adding, removing, or significantly changing any script in this directory, **update this README**. Keep the table of contents, script descriptions, usage examples, and "used by" annotations accurate.

This directory contains all tooling for the FreeStuff Translations repository. All scripts are written in TypeScript and run via [Bun](https://bun.sh) (no compilation step needed — Bun runs TypeScript natively).

---

## Setup

```bash
cd scripts
bun install
```

---

## Directory Structure

```
scripts/
├── lib/                          # Shared library modules (not runnable directly)
│   ├── jsonc.ts                  # JSONC parsing, variable & link extraction
│   ├── git.ts                    # Git helpers (diff, log, show at ref)
│   ├── registry.ts               # authorship-registry.json load/save
│   └── validate.ts               # Core validation engines
│
├── agents/                       # Scripts for CI/agent pipelines
│   ├── validate-translations.ts  # 4-tier translation test suite
│   └── adversarial-probes.ts     # Adversarial stress tests + oracle validation
│
├── init/                         # One-time setup scripts (run once by maintainers)
│   ├── build-initial-registry.ts # Build authorship registry from full git history
│   └── import.ts                 # Import a bulk JSON language export
│
├── sync.ts                       # Sync translation files against en-US.jsonc
├── update-authorship.ts          # Update authorship registry after a push (CI only)
├── commit.sh                     # Commit helper for format and llm modes
│
├── package.json
├── tsconfig.json
└── README.md                     # This file
```

---

## Scripts Reference

### `sync.ts`
**Used by:** Maintainers, CI/CD after adding new keys to `en-US.jsonc`

Syncs all `.jsonc` translation files in a package directory against `en-US.jsonc`:
- Adds missing keys (empty string) to every non-base file
- Removes keys that no longer exist in `en-US.jsonc`
- Re-renders every file with `// en-US comment` above each key for translator context

```bash
# Sync the discord-bot package
bun sync.ts --package discord-bot

# Preview changes without writing
bun sync.ts --package discord-bot --dry-run
```

| Flag | Description | Required |
|------|-------------|----------|
| `-p, --package <dir>` | Package folder to sync (e.g. `discord-bot`) | ✅ |
| `--dry-run` | Preview changes without writing files | ❌ |

---

### `update-authorship.ts`
**Used by:** GitHub Actions CI only (`track-authorship.yml`) — **not for manual use**

Diffs `HEAD` against `HEAD~1`, finds which translation keys changed, and writes the commit author + git hash to `authorship-registry.json`.

Env vars (injected by CI):

| Variable | Description |
|----------|-------------|
| `AUTHOR_NAME` | Display name of the commit author |
| `AUTHOR_EMAIL` | Email of the commit author |
| `GIT_HASH` | Full or short git hash of the triggering commit |

```bash
# CI usage (env vars injected by workflow):
AUTHOR_NAME="Jane" AUTHOR_EMAIL="jane@example.com" GIT_HASH="abc1234" bun update-authorship.ts
```

---

### `commit.sh`
**Used by:** Maintainers, LLM agents

Opinionated commit helper with two modes:
- If files are **already staged**, it commits only those staged files.
- If **no files are staged**, it automatically stages all changes (`git add -A`).

```bash
# Format/automation commit — adds [skip-authors] so CI skips authorship tracking
./scripts/commit.sh format "chore: reformat all jsonc files"

# LLM commit — commits as llm@freestuff.gg so keys are attributed to the LLM
./scripts/commit.sh llm "feat(sk): fill in missing Slovak keys"
```

| Mode | Author | Effect on authorship CI |
|------|--------|------------------------|
| `format` | Current git user | Registry skipped (`[skip-authors]` tag) |
| `llm` | `LLM <llm@freestuff.gg>` | Keys attributed to `llm@freestuff.gg` |

---

### `agents/validate-translations.ts`
**Used by:** Agent pipelines, CI/CD, maintainers

4-tier test suite that validates translation files against `en-US.jsonc`.

```bash
# Run all tiers (default)
bun agents/validate-translations.ts

# Run unit tiers only (1, 2, 3) — no real files touched
bun agents/validate-translations.ts --unit

# Validate a single language file
bun agents/validate-translations.ts --lang de
bun agents/validate-translations.ts --lang sk.jsonc

# Run a specific tier
bun agents/validate-translations.ts --tier 4

# Output Tier 4 results as JSON
bun agents/validate-translations.ts --tier 4 --json
```

| Tier | Name | What it tests |
|------|------|---------------|
| 1 | Feature Coverage | Key parity & non-empty string values |
| 2 | Boundary Cases | ICU plurals, escaped quotes, comment stripping |
| 3 | Cross-Feature | Variable & markdown link preservation |
| 4 | Real-World | Full validation of files in `discord-bot/` |

| Flag | Description |
|------|-------------|
| `--tier <n>` | Run specific tier: 1, 2, 3, 4, or `all` (default: `all`) |
| `--unit` | Run unit tiers only (1, 2, 3) |
| `--lang <code>` | Validate a single file (e.g. `de`, `sk.jsonc`) |
| `--json` | Output Tier 4 results as JSON |

---

### `agents/adversarial-probes.ts`
**Used by:** Agent pipelines, CI/CD victory audits

Adversarial stress-tests of the validator engine + independent oracle validation of the 4 target translation files (`de`, `sk`, `fr`, `es-ES`).

```bash
# Run all parts
bun agents/adversarial-probes.ts

# Run only engine stress-tests (Part 1)
bun agents/adversarial-probes.ts --part 1

# Run only oracle validation for a specific language
bun agents/adversarial-probes.ts --part 2 --lang sk
```

| Flag | Description |
|------|-------------|
| `--part <n>` | Run only part 1 (engine), 2 (oracle), or 3 (tone) — default: `all` |
| `--lang <code>` | Audit a specific language only (Part 2) |

---

### `init/build-initial-registry.ts`
**Used by:** Maintainers — **one-time setup**

Walks the full git history (oldest commit first) and builds `authorship-registry.json` from scratch by attributing each key to the commit that last meaningfully changed it.

```bash
bun scripts/init/build-initial-registry.ts

# Preview without writing
bun scripts/init/build-initial-registry.ts --dry-run

# Different package directory
bun scripts/init/build-initial-registry.ts --package discord-bot
```

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --package <dir>` | Package folder to scan | `discord-bot` |
| `--dry-run` | Print attribution counts without saving | `false` |

---

### `init/import.ts`
**Used by:** Maintainers — **one-time migration**

Imports a bulk JSON array export (each entry must have an `_id` field) and writes each language as a separate `.jsonc` file.

```bash
bun scripts/init/import.ts --input ./export.json --package discord-bot
```

| Flag | Description | Required |
|------|-------------|----------|
| `-i, --input <file>` | Path to the JSON array export file | ✅ |
| `-p, --package <dir>` | Target package folder | ❌ (default: `discord-bot`) |

---

## Authorship Registry

`authorship-registry.json` at the repo root tracks who last translated each key. Format:

```json
{
  "de.jsonc": {
    "announcement_header": "Andreas <git@maanex.me> @ c2c68e9",
    "cmd_free_title": "LLM <llm@freestuff.gg> @ 7f1e3e6"
  }
}
```

The registry is updated automatically by CI on every push. Use `commit.sh format` when running formatting scripts to prevent them from overwriting legitimate attributions.

