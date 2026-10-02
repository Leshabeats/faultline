#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export CODEX_CLOUD_STATE="$ROOT/.codex-cloud"
mkdir -p "$CODEX_CLOUD_STATE"
export npm_config_cache="$CODEX_CLOUD_STATE/npm-cache"
NODE_VERSION=24.13.1
case "$(uname -s)" in Linux) os=linux;; Darwin) os=darwin;; *) echo 'Unsupported OS' >&2; exit 1;; esac
case "$(uname -m)" in x86_64) arch=x64;; arm64|aarch64) arch=arm64;; *) echo 'Unsupported architecture' >&2; exit 1;; esac
hash_file() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d ' ' -f1; else shasum -a 256 "$1" | cut -d ' ' -f1; fi; }
activate_node() {
  export PATH="$CODEX_CLOUD_STATE/node-v$NODE_VERSION-$os-$arch/bin:$PATH"
  if ! command -v node >/dev/null || [[ "$(node --version)" != "v$NODE_VERSION" ]]; then
    echo "Run scripts/codex-cloud/install.sh first (requires Node $NODE_VERSION)." >&2; exit 1
  fi
}
install_node() {
  if ! command -v node >/dev/null || [[ "$(node --version)" != "v$NODE_VERSION" ]]; then
    name="node-v$NODE_VERSION-$os-$arch.tar.gz"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$name" -o "$CODEX_CLOUD_STATE/$name"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$CODEX_CLOUD_STATE/node-checksums"
    expected="$(awk -v name="$name" '$2 == name {print $1}' "$CODEX_CLOUD_STATE/node-checksums")"
    [[ -n "$expected" && "$(hash_file "$CODEX_CLOUD_STATE/$name")" == "$expected" ]] || { echo 'Node checksum mismatch' >&2; exit 1; }
    tar -xzf "$CODEX_CLOUD_STATE/$name" -C "$CODEX_CLOUD_STATE"
  fi
  activate_node
  [[ "$(npm --version)" == 11.8.0 ]] || { echo 'Expected npm 11.8.0 bundled with Node 24.13.1' >&2; exit 1; }
}
GO_VERSION=1.22.12
export GOTOOLCHAIN=local
export GOPATH="$CODEX_CLOUD_STATE/gopath"
export GOCACHE="$CODEX_CLOUD_STATE/go-build"
activate_go() {
  export PATH="$CODEX_CLOUD_STATE/go/bin:$PATH"
  [[ "$(go version 2>/dev/null || true)" == "go version go$GO_VERSION "* ]] || { echo 'Run install.sh to provision Go' >&2; exit 1; }
}
install_go() {
  if [[ "$(PATH="$CODEX_CLOUD_STATE/go/bin:$PATH" go version 2>/dev/null || true)" != "go version go$GO_VERSION "* ]]; then
    goarch="$arch"; [[ "$arch" != x64 ]] || goarch=amd64
    name="go$GO_VERSION.$os-$goarch.tar.gz"
    curl -fsSL 'https://go.dev/dl/?mode=json&include=all' -o "$CODEX_CLOUD_STATE/go-releases.json"
    expected="$(node --input-type=module -e 'import fs from "node:fs"; const r=JSON.parse(fs.readFileSync(process.argv[1])); const f=r.flatMap(x=>x.files).find(x=>x.filename===process.argv[2]); if(!f)process.exit(1);console.log(f.sha256)' "$CODEX_CLOUD_STATE/go-releases.json" "$name")"
    curl -fsSL "https://go.dev/dl/$name" -o "$CODEX_CLOUD_STATE/$name"
    [[ "$(hash_file "$CODEX_CLOUD_STATE/$name")" == "$expected" ]] || { echo 'Go checksum mismatch' >&2; exit 1; }
    rm -rf "$CODEX_CLOUD_STATE/go"
    tar -xzf "$CODEX_CLOUD_STATE/$name" -C "$CODEX_CLOUD_STATE"
  fi
  activate_go
}
