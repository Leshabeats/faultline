# Roadmap

Faultline is intentionally shipping as a narrow, playable vertical slice before growing into a platform.

## v0.2 — Failure Replay — shipped

- Import current replay envelopes and migrate exported v0.1 scenario snapshots.
- Persist submitted attempts locally with bounded, corruption-tolerant storage.
- Replay load, failure, architecture, interviewer-answer, and submission events on a deterministic timeline.
- Scrub, pause, change playback speed, jump between events, and export a replay-safe JSON envelope.
- Keep replay read-only and recompute simulation health, metrics, and edge state at every cursor position.

## v0.2.1 — Replay polish

- Public URL share links once the Go service exists.
- More explicit per-node fault targeting.
- Deeper scoring explanations tied to the replay's key moment.
- Optional one-click video/GIF capture for launch posts.

## v0.3 — Go service

- Small Chi/`net/http` API.
- SQLite locally and PostgreSQL when hosted.
- Server-side hidden judge and signed submission results.
- Saved challenges, submissions, and public share links.

## v0.4 — AI interviewer

- Provider-neutral SSE streaming.
- OpenAI-compatible and Perplexity adapters.
- Structured critique tied to deterministic simulation evidence.
- Explicit privacy and spend controls.

## Later

- More challenges and difficulty tiers.
- Authoring tools for community challenge packs.
- Multiplayer interviews and interviewer mode.
- Public profiles, streaks, and comparable submissions.
