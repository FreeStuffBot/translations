#!/usr/bin/env bash
# commit.sh  — opinionated commit helper for freestuff-translations
#
# Usage:
#   ./scripts/commit.sh format  "chore: reformat all jsonc files"
#   ./scripts/commit.sh llm     "feat(sk): fill in missing Slovak keys"
#
# "format" mode  →  commits with [skip-authors] tag so CI skips authorship tracking.
# "llm"    mode  →  commits as llm@freestuff.gg so CI attributes keys to the LLM.
#
# Staging behavior:
#   If any files are already staged, it will commit ONLY those staged files.
#   If no files are staged yet, it will auto-stage all modified/untracked files (git add -A).

set -euo pipefail

# Ensure we always run from repository root
cd "$(git rev-parse --show-toplevel)"

MODE="${1:-}"
CUSTOM_MSG="${2:-}"

if [[ "$MODE" != "format" && "$MODE" != "llm" ]]; then
  echo "Usage: $0 <format|llm> [commit message]"
  echo ""
  echo "  format  Commit as a formatting/automation change."
  echo "          Adds [skip-authors] so the authorship CI skips this commit."
  echo ""
  echo "  llm     Commit as llm@freestuff.gg."
  echo "          CI will attribute all changed keys to the LLM author."
  exit 1
fi

# If no files are currently staged in the index, auto-stage all changes
if git diff --quiet --staged; then
  echo "No files staged — auto-staging all modified files (git add -A)..."
  git add -A
else
  echo "Using already staged files for commit..."
fi

# Check if there is anything to commit
if git diff --quiet --staged; then
  echo "Nothing to commit (working tree clean)."
  exit 0
fi

if [[ "$MODE" == "format" ]]; then
  MSG="${CUSTOM_MSG:-chore: automated formatting pass}"
  # Append [skip-authors] if not already present
  if [[ "$MSG" != *"[skip-authors]"* ]]; then
    MSG="$MSG [skip-authors]"
  fi
  echo "Committing as current git user with message: $MSG"
  git commit -m "$MSG"

elif [[ "$MODE" == "llm" ]]; then
  MSG="${CUSTOM_MSG:-feat: llm-generated translations}"
  echo "Committing as llm@freestuff.gg with message: $MSG"
  git -c user.name="LLM" \
      -c user.email="llm@freestuff.gg" \
      commit -m "$MSG"
fi

echo ""
echo "Done. Push with: git push"
