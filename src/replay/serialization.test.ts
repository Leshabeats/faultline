import { describe, expect, it } from 'vitest'
import { createReplayEnvelope } from './recorder'
import {
  REPLAY_IMPORT_LIMITS,
  parseReplayEnvelope,
  serializeReplayEnvelope,
} from './serialization'
import { createCompletedTestAttempt } from './testFixtures'

describe('replay serialization', () => {
  it('round-trips a versioned replay including the result summary and key moment', () => {
    const envelope = createReplayEnvelope(
      createCompletedTestAttempt(),
      '2026-08-03T10:00:06.000Z',
    )
    const serialized = serializeReplayEnvelope(envelope)
    const parsed = parseReplayEnvelope(serialized)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migrated).toBe(false)
    expect(parsed.value).toEqual(envelope)
    expect(parsed.value.attempt.summary?.keyMoment).toMatchObject({
      eventId: 'load-10',
      tone: 'critical',
    })
  })

  it('accepts an attempt directly when preparing an export envelope', () => {
    const attempt = createCompletedTestAttempt()
    const parsed = parseReplayEnvelope(serializeReplayEnvelope(attempt))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.attempt).toEqual(attempt)
    expect(parsed.value.exportedAt).toBe(attempt.updatedAt)
  })

  it('round-trips capacity tuning used by deterministic playback', () => {
    const attempt = createCompletedTestAttempt()
    attempt.initial.capacity = {
      cacheHitRate: 0.95,
      indexedLookup: true,
      poolSize: 300,
      readReplicas: 1,
      databaseProfile: 'balanced',
      pricingPackId: 'aws-us-east-1-2026.07',
      benchmarkPackId: 'local-m1-pro-2026.08',
    }
    const parsed = parseReplayEnvelope(serializeReplayEnvelope(attempt))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.attempt.initial.capacity).toEqual(attempt.initial.capacity)
  })

  it('can redact interview content for a public share without mutating local history', () => {
    const envelope = createReplayEnvelope(createCompletedTestAttempt())
    const serialized = serializeReplayEnvelope(envelope, { redactAnswers: true })
    const parsed = parseReplayEnvelope(serialized)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const answer = parsed.value.attempt.events.find(
      (event) => event.type === 'answer.submitted',
    )
    expect(answer?.payload).toMatchObject({ answer: '[redacted]' })
    expect(JSON.stringify(parsed.value)).not.toContain('request coalescing')
    expect(JSON.stringify(envelope)).toContain('request coalescing')
  })

  it('migrates the v0.1 architecture snapshot into a replay with no invented events', () => {
    const result = parseReplayEnvelope(
      JSON.stringify({
        version: 1,
        challenge: 'url-shortener',
        load: 10,
        fault: 'cache-outage',
        capacity: {
          cacheHitRate: 0.99,
          indexedLookup: true,
          poolSize: 600,
          readReplicas: 2,
          databaseProfile: 'performance',
        },
        nodes: [
          {
            id: 'client',
            kind: 'client',
            label: 'Clients',
            position: { x: 1, y: 2 },
          },
        ],
        edges: [],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migrated).toBe(true)
    expect(result.value.attempt.events).toEqual([])
    expect(result.value.attempt.initial).toMatchObject({
      load: 10,
      fault: 'cache-outage',
      capacity: { indexedLookup: true, readReplicas: 2 },
      architecture: { nodes: [{ data: { kind: 'client', label: 'Clients' } }] },
    })
  })

  it('rejects a v0.1 snapshot with duplicate nodes or dangling edges', () => {
    const base = {
      version: 1,
      challenge: 'url-shortener',
      load: 10,
      fault: 'cache-outage',
      nodes: [{ id: 'client', kind: 'client', label: 'Clients', position: { x: 1, y: 2 } }],
      edges: [] as Array<{ source: string; target: string }>,
    }

    expect(parseReplayEnvelope(JSON.stringify({
      ...base,
      nodes: [...base.nodes, ...base.nodes],
    })).ok).toBe(false)
    expect(parseReplayEnvelope(JSON.stringify({
      ...base,
      edges: [{ source: 'client', target: 'missing' }],
    })).ok).toBe(false)
  })

  it('fails closed on malformed, unsupported, and oversized imports', () => {
    expect(parseReplayEnvelope('{').ok).toBe(false)
    expect(
      parseReplayEnvelope(
        JSON.stringify({ schema: 'faultline.replay', version: 99 }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'unsupported-version' } })
    expect(
      parseReplayEnvelope(' '.repeat(REPLAY_IMPORT_LIMITS.maxSerializedCharacters + 1)),
    ).toMatchObject({ ok: false, error: { code: 'too-large' } })

    const invalid = createReplayEnvelope(createCompletedTestAttempt())
    invalid.attempt.events[0].atMs = -1
    expect(parseReplayEnvelope(JSON.stringify(invalid))).toMatchObject({
      ok: false,
      error: { code: 'invalid-replay' },
    })

    const decorated = createReplayEnvelope(createCompletedTestAttempt())
    Object.assign(decorated.attempt.initial.architecture.nodes[0].data, {
      health: 'failed',
      detail: 'simulation output',
    })
    expect(parseReplayEnvelope(JSON.stringify(decorated))).toMatchObject({
      ok: false,
      error: { code: 'invalid-replay' },
    })

    const danglingEdge = createReplayEnvelope(createCompletedTestAttempt())
    danglingEdge.attempt.initial.architecture.edges[0].target = 'missing-node'
    expect(parseReplayEnvelope(JSON.stringify(danglingEdge))).toMatchObject({
      ok: false,
      error: { code: 'invalid-replay' },
    })
  })
})
