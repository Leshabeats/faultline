#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
activate_node
activate_go
[[ ! -f .env && ! -f backend/.env ]] || { echo 'Use a clean Cloud checkout without .env files' >&2; exit 1; }
go -C backend build -o "$CODEX_CLOUD_STATE/faultline" ./cmd/faultline
export FAULTLINE_ENV=development FAULTLINE_HTTP_ADDR=127.0.0.1:8787
export FAULTLINE_SQLITE_PATH="$CODEX_CLOUD_STATE/faultline.db"
export FAULTLINE_PUBLIC_SHARE_BASE=http://localhost:4173
pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; wait || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$CODEX_CLOUD_STATE/faultline" & pids+=("$!")
node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 4173 --strictPort & pids+=("$!")
while kill -0 "${pids[0]}" 2>/dev/null && kill -0 "${pids[1]}" 2>/dev/null; do sleep 1; done
exit 1
