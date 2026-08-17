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

## v0.3.2 — Challenge Packs + Celebrity Spike — shipped

- Introduce a reusable challenge-pack contract for manifests, seed graphs, faults, labels, and tuning defaults.
- Add **The Celebrity Problem**, a News Feed challenge with animated fan-out pressure and a 50M-follower spike.
- Practice write, read, and hybrid fan-out; tune workers, batching, celebrity thresholds, and idempotent delivery.
- Run three public and two redacted hidden cases through a deterministic News Feed judge.
- Replay both challenge types while keeping pre-v0.3.2 URL Shortener envelopes valid.

## v0.3.3 — Architecture Explorer — shipped

- Inspect every component without leaving the board; expose the Short Link API contract, cache keys, database schema, and design responsibilities.
- Start challenge packs in a healthy 1× state and make faults explicit, including a one-click Redis recovery path.
- Ramp traffic smoothly to the selected 1×/3×/10× target instead of teleporting metrics to the final load.
- Configure replicas and shards on the selected canvas node and feed the topology into capacity, availability, cost, and replay.
- Ship a responsive Russian/English interface with browser-aware defaults and a persistent language switcher.

## v0.3.4 — Failure Director — shipped

- Select a node and take one serving replica or the complete component offline.
- Select an exact graph connection, partition it, and preserve alternate routes when the topology provides one.
- Animate the fault source, affected path, isolated components, and graph-derived blast radius without persisting presentation noise.
- Recover the target from its inspector or the canvas overlay and restore live metrics deterministically.
- Record the exact node/edge target in backward-compatible v1 replay envelopes with strict import validation.
- Keep the complete interaction responsive and localized in Russian and English.

## v0.3.5 — Replay and sharing polish

- Public URL share links once the Go service exists.
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
