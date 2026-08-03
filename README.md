# Faultline

[![CI](https://github.com/Leshabeats/faultline/actions/workflows/ci.yml/badge.svg)](https://github.com/Leshabeats/faultline/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/Leshabeats/faultline/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Leshabeats/faultline/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-111827.svg)](LICENSE)

**[Try the live demo](https://leshabeats.github.io/faultline/)**

![Faultline animated system-design canvas](docs/assets/faultline-desktop.png)

Faultline is a LeetCode-style practice environment for system design. Open a challenge, draw an architecture as the submission, run traffic and failure cases against it, and explain the trade-offs while an interviewer reacts to the live state.

The first release is intentionally focused on one coherent URL-shortener scenario rather than pretending to model every distributed system.

## Practice loop

1. Read the challenge and capacity requirements.
2. Build a topology on the canvas.
3. Run public load and failure cases.
4. Submit against the complete deterministic judge, including redacted hidden cases.
5. Open the saved attempt in History and replay the exact architecture, load, fault, and submission sequence.
6. Use the score, telemetry, and interviewer feedback to improve the design and run again.

The launch topology scores `76/100`. Connecting a complete second cache path makes the cache-outage case pass and raises the score to `83/100`; dropping an unconnected box onto the canvas changes nothing.

![Faultline submission result](docs/assets/faultline-judge-result.png)

![Faultline failure replay](docs/assets/faultline-replay.png)

## What works today

- Interactive system canvas with draggable, connectable components built on React Flow.
- A URL Shortener challenge statement with requirements, scale, three public cases, and two redacted hidden cases.
- A deterministic local judge: submit the current topology, see per-case pass/fail, a 0–100 score, four-dimension breakdown, then improve the diagram and run again.
- Stateful, animated icons for clients, gateways, services, caches, queues, databases, and regions.
- Live traffic animation and telemetry for throughput, p99 latency, errors, database CPU, cache misses, and queue depth.
- Deterministic load controls (`1x`, `3x`, `10x`) and four fault injections: cache outage, slow database, network partition, and retry storm.
- A local interviewer with follow-up questions, hints, design review, and answer feedback informed by the current diagram and simulation metrics.
- Semantic attempt recording for load, fault, topology, interviewer-answer, and submission actions without storing derived animation noise.
- Local attempt history with deterministic play/pause, scrub, previous/next event controls, `0.5x`/`1x`/`2x` speed, and synchronized metrics.
- Versioned public replay export/import, strict validation, safe local-storage retention, and migration from the v0.1 scenario snapshot.
- Interview timer, pause/run control, event history, full component creation, and responsive desktop/mobile layouts.
- Unit coverage for simulation behavior, topology reachability, judge scoring/redaction, provider routing, replay reduction, serialization, migration, and persistence.

## Run locally

Requires a recent Node.js release and npm.

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Open <http://127.0.0.1:4173>.

Other commands:

```bash
npm run test:run  # run tests once
npm test          # run Vitest in watch mode
npm run build     # type-check and create the production bundle
npm run preview   # serve the production bundle locally
```

## Simulation truth and interview providers

The simulation engine is the source of truth. Given the same load, fault, and tick, it computes the same capacity state, node health, and metrics. An interview provider may interpret that state, ask a question, or critique an answer; it must not invent or overwrite simulation results.

The current `LocalInterviewProvider` is a deterministic, offline preview. `InterviewRouter` keeps the UI independent from the provider, so a future OpenAI-compatible or Perplexity-backed implementation can be registered without changing callers.

The local judge runs every case at a fixed simulation tick and only counts capacity that belongs to a complete client-to-database path. Hidden result objects expose only an ordinal and pass/fail. Because this is an offline browser release, the hidden inputs still ship in the client bundle; the hosted version should execute them in the Go service before treating them as secret or cheat-resistant.

Keep vendor credentials on a server. A browser-side adapter should call only your own backend:

```ts
import { interviewRouter } from './src/interview/router'
import type {
  InterviewProvider,
  InterviewRequest,
  InterviewResponse,
} from './src/interview/types'

class RemoteInterviewProvider implements InterviewProvider {
  id = 'remote'
  label = 'AI interviewer'

  async respond(request: InterviewRequest): Promise<InterviewResponse> {
    const response = await fetch('/api/interview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) throw new Error('Interview provider failed')
    return response.json() as Promise<InterviewResponse>
  }
}

interviewRouter.register(new RemoteInterviewProvider())
```

The planned server is Go (`net/http` with Chi): one small binary for challenge manifests, saved submissions, SSE model streaming, and provider credentials. `/api/interview` can translate the provider-neutral request to an OpenAI-compatible endpoint, Perplexity, or another model router. Validate its response into the `InterviewResponse` contract before returning it, and fall back to `local` when the remote provider is unavailable. SQLite is the local-first persistence target; PostgreSQL is the hosted target.

## Privacy

This release makes no AI or analytics API calls. Completed attempts are stored only in this browser's local storage so History survives a reload; exported replay files are created only when you explicitly request them and redact interview-answer text by default. No API key is required. When a remote provider is added, proxy it through a backend and never place secrets in Vite environment variables or client bundles.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Product direction lives in [ROADMAP.md](ROADMAP.md), security reports follow [SECURITY.md](SECURITY.md), and all participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Project structure

```text
src/
  challenges/   Challenge manifests, requirements, cases, and rubrics
  canvas/       React Flow nodes, edges, types, and launch scenario
  components/   Product chrome, controls, telemetry, and animated icons
  domain/       Shared system-design and simulation contracts
  interview/    Provider interface, router, local interviewer, and tests
  judge/         Deterministic public/hidden suite, redaction, scoring, and tests
  replay/        Versioned semantic log, reducer, import/export, repository, and tests
  simulation/   Deterministic engine, topology analysis, and tests
  App.tsx       Canvas orchestration and end-to-end interaction state
  styles.css    Responsive visual and motion system
```
