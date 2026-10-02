---
name: cloud-runtime
description: Install, verify and safely start this repository in a disposable Codex Cloud VM.
---

Read `docs/codex-cloud.md`. Run `bash scripts/codex-cloud/install.sh` before checks or preview. Run `bash scripts/codex-cloud/check.sh` to verify repository checks. `bash scripts/codex-cloud/start.sh` is the safe foreground preview entry point.

Use fresh local data and committed dependency locks. Never load production secrets, local home state or real user databases. Never deploy, run a paid provider, or invoke trading/Telegram/hunter entry points as part of Cloud setup. Report setup, tests, preview and actual Cloud publication separately. Do not claim Linux validation from macOS execution alone.
