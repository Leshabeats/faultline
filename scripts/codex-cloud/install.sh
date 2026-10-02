#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
install_node
test -f package-lock.json && test -f backend/go.sum
install_go
npm ci --no-audit --no-fund
go -C backend mod download
go -C backend mod verify

bash scripts/codex-cloud/shared-skills.sh
