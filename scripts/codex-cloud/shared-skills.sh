#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${CODEX_SKILLS_SOURCE:-}" ]]; then
  skills_ref="${CODEX_SKILLS_REF:-13b36a8ffef7dc8eab6d57e1c1519e1e514509d2}"
  actual_ref="$(git -C "$CODEX_SKILLS_SOURCE" rev-parse HEAD)"
  if [[ "$actual_ref" != "$skills_ref" ]]; then
    printf 'Shared skills revision mismatch: expected %s, got %s\n' "$skills_ref" "$actual_ref" >&2
    exit 1
  fi
  python3 "$CODEX_SKILLS_SOURCE/install.py" --source "$CODEX_SKILLS_SOURCE" --project "$project_root" --profile core
fi
