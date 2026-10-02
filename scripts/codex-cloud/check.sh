#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
activate_node
activate_go
npm run test:run
npm run build
go -C backend test ./...
go -C backend vet ./...
