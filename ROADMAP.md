# Roadmap

Faultline is intentionally shipping as a narrow, playable vertical slice before growing into a platform.

## v0.2 — Failure Replay — shipped

- Import current replay envelopes and migrate exported v0.1 scenario snapshots.
- Persist submitted attempts locally with bounded, corruption-tolerant storage.
- Replay load, failure, architecture, interviewer-answer, and submission events on a deterministic timeline.
- Scrub, pause, change playback speed, jump between events, and export a replay-safe JSON envelope.
- Keep replay read-only and recompute simulation health, metrics, and edge state at every cursor position.

## v0.3 — Bottleneck Defense — shipped

- Require a bottleneck prediction and written rationale before revealing the model.
- Tune cache target, lookup index, connection pool, read replicas, and database profile.
- Compare p99, database CPU, monthly cost, and cost per million redirects against the untuned design.
- Expose workload and pricing assumptions instead of presenting simulated numbers as measured truth.
- Record capacity changes in deterministic failure replay and hand the final trade-off to the interviewer.

## v0.3.1 — Calibration — shipped

- Provider/region/date-specific price packs with independently displayed rate provenance.
- A real local `pgbench`/`redis-benchmark` pack with measured, derived, and estimated authority per datum.
- Versioned, bounded, fail-closed benchmark-pack validation.
- Cache saturation driven by the selected capacity pack.

## v0.3.2 — Replay and sharing polish

- Public URL share links once the Go service exists.
- More explicit per-node fault targeting.
- Deeper scoring explanations tied to the replay's key moment.
- Optional one-click video/GIF capture for launch posts.

## v0.4 — Go service

- Small Chi/`net/http` API.
- SQLite locally and PostgreSQL when hosted.
- Server-side hidden judge and signed submission results.
- Saved challenges, submissions, and public share links.

## v0.5 — AI interviewer

- Provider-neutral SSE streaming.
- OpenAI-compatible and Perplexity adapters.
- Structured critique tied to deterministic simulation evidence.
- Explicit privacy and spend controls.

## Later

- More challenges and difficulty tiers.
- Authoring tools for community challenge packs.
- Multiplayer interviews and interviewer mode.
- Public profiles, streaks, and comparable submissions.
