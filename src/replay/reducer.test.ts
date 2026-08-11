import { describe, expect, it } from 'vitest'
import { playReplayAt } from './reducer'
import { createReplayAttempt, recordReplayEvent } from './recorder'
import { createTestAttempt, event, testArchitecture, timestamp } from './testFixtures'

describe('replay reduction', () => {
  it('anchors the first content action at zero', () => {
    expect(() =>
      recordReplayEvent(
        createTestAttempt(),
        event({
          id: 'late-first-event',
          atMs: 1,
          source: 'user',
          type: 'load.changed',
          payload: { load: 3 },
        }),
      ),
    ).toThrow(/0ms/)
  })

  it('replays database capacity and canvas topology as one atomic event', () => {
    const attempt = recordReplayEvent(
      createTestAttempt(),
      event({
        id: 'database-topology',
        atMs: 0,
        source: 'user',
        type: 'capacity.changed',
        payload: {
          capacity: {
            cacheHitRate: 0.95,
            indexedLookup: true,
            poolSize: 300,
            readReplicas: 2,
            databaseProfile: 'balanced',
          },
          topology: [{ nodeId: 'database', replicas: 3, shards: 4 }],
        },
      }),
    )

    const replay = playReplayAt(attempt, 0)
    expect(replay.capacity?.readReplicas).toBe(2)
    expect(replay.architecture.nodes.find(({ id }) => id === 'database')?.data)
      .toMatchObject({ replicas: 3, shards: 4 })
  })

  it('repairs legacy capacity events that omitted their database topology patch', () => {
    const attempt = recordReplayEvent(
      createTestAttempt(),
      event({
        id: 'legacy-capacity',
        atMs: 0,
        source: 'user',
        type: 'capacity.changed',
        payload: {
          capacity: {
            cacheHitRate: 0.95,
            indexedLookup: true,
            poolSize: 300,
            readReplicas: 2,
            databaseProfile: 'balanced',
          },
        },
      }),
    )

    const replay = playReplayAt(attempt, 0)
    expect(replay.capacity?.readReplicas).toBe(2)
    expect(replay.architecture.nodes.find(({ id }) => id === 'database')?.data.replicas)
      .toBe(3)
  })

  it('replays load, fault, graph edits, answers, and submissions at arbitrary times', () => {
    let attempt = createTestAttempt()
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'add-cache',
        atMs: 0,
        source: 'user',
        type: 'node.added',
        payload: {
          node: {
            id: 'cache',
            type: 'system',
            position: { x: 250, y: 20 },
            data: { kind: 'cache', label: 'Redis' },
          },
        },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'move-cache',
        atMs: 500,
        source: 'user',
        type: 'node.updated',
        payload: { nodeId: 'cache', patch: { position: { x: 300, y: 40 } } },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'add-cache-edge',
        atMs: 750,
        source: 'user',
        type: 'edge.added',
        payload: {
          edge: {
            id: 'client-cache',
            type: 'traffic',
            source: 'client',
            target: 'cache',
          },
        },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'stress',
        atMs: 1_000,
        source: 'user',
        type: 'load.changed',
        payload: { load: 10 },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'fault',
        atMs: 1_000,
        source: 'user',
        type: 'fault.changed',
        payload: { fault: 'cache-outage', targetNodeId: 'cache' },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'capacity',
        atMs: 1_250,
        source: 'user',
        type: 'capacity.changed',
        payload: {
          capacity: {
            cacheHitRate: 0.99,
            indexedLookup: true,
            poolSize: 600,
            readReplicas: 2,
            databaseProfile: 'performance',
          },
        },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'answer',
        atMs: 1_500,
        source: 'user',
        type: 'answer.submitted',
        payload: { answer: 'Add request coalescing.' },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'submission',
        atMs: 2_000,
        source: 'user',
        type: 'design.submitted',
        payload: {
          submission: {
            judgeVersion: 'url-shortener-v1',
            score: 75,
            maxScore: 100,
            passed: false,
            passedCases: 3,
            totalCases: 5,
          },
        },
      }),
    )

    const beforeStress = playReplayAt(attempt, 999)
    expect(beforeStress.load).toBe(1)
    expect(beforeStress.fault).toBe('none')
    expect(beforeStress.architecture.nodes.find(({ id }) => id === 'cache')?.position)
      .toEqual({ x: 300, y: 40 })
    expect(beforeStress.architecture.edges.some(({ id }) => id === 'client-cache')).toBe(true)

    const atStress = playReplayAt(attempt, 1_000)
    expect(atStress.load).toBe(10)
    expect(atStress.fault).toBe('cache-outage')
    expect(atStress.faultTarget).toEqual({ type: 'node', id: 'cache' })
    expect(atStress.answers).toHaveLength(0)
    expect(playReplayAt(attempt, 1_250).capacity).toMatchObject({
      indexedLookup: true,
      readReplicas: 2,
    })

    const completed = playReplayAt(attempt, Number.POSITIVE_INFINITY)
    expect(completed.currentTimeMs).toBe(2_000)
    expect(completed.answers[0].answer).toBe('Add request coalescing.')
    expect(completed.submissions[0]).toMatchObject({ score: 75, passedCases: 3 })
  })

  it('replays an exact edge partition and clears its target on recovery', () => {
    let attempt = createTestAttempt()
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'partition-edge',
        atMs: 0,
        source: 'user',
        type: 'fault.changed',
        payload: { fault: 'network-partition', targetEdgeId: 'client-database' },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'restore-edge',
        atMs: 1_000,
        source: 'user',
        type: 'fault.changed',
        payload: { fault: 'none' },
      }),
    )

    expect(playReplayAt(attempt, 0).faultTarget)
      .toEqual({ type: 'edge', id: 'client-database' })
    expect(playReplayAt(attempt, 1_000)).toMatchObject({
      fault: 'none',
      faultTarget: undefined,
    })
  })

  it('clears a targeted failure when its graph element is removed', () => {
    let attempt = createTestAttempt()
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'target-database',
        atMs: 0,
        source: 'user',
        type: 'fault.changed',
        payload: { fault: 'component-outage', targetNodeId: 'database' },
      }),
    )
    attempt = recordReplayEvent(
      attempt,
      event({
        id: 'remove-database-target',
        atMs: 500,
        source: 'user',
        type: 'node.removed',
        payload: { nodeId: 'database' },
      }),
    )

    expect(playReplayAt(attempt, 500)).toMatchObject({
      fault: 'none',
      faultTarget: undefined,
    })
  })

  it('uses timestamp, sequence, and id ordering instead of input array order', () => {
    const attempt = {
      ...createTestAttempt(),
      durationMs: 100,
      events: [
        {
          id: 'second',
          atMs: 100,
          sequence: 1,
          source: 'user' as const,
          type: 'load.changed' as const,
          payload: { load: 10 as const },
        },
        {
          id: 'first',
          atMs: 100,
          sequence: 0,
          source: 'user' as const,
          type: 'load.changed' as const,
          payload: { load: 3 as const },
        },
      ],
    }

    const first = playReplayAt(attempt, 100)
    const second = playReplayAt(attempt, 100)
    expect(first.load).toBe(10)
    expect(first.appliedEventIds).toEqual(['first', 'second'])
    expect(first).toEqual(second)
    expect(attempt.events.map(({ id }) => id)).toEqual(['second', 'first'])
  })

  it('does not mutate the attempt while scrubbing repeatedly', () => {
    const attempt = createTestAttempt()
    const before = structuredClone(attempt)

    playReplayAt(attempt, 0)
    playReplayAt(attempt, 500)

    expect(attempt).toEqual(before)
  })

  it('removes incident edges with a node and replaces the canonical graph at checkpoints', () => {
    const replacement = {
      nodes: [testArchitecture.nodes[0]],
      edges: [],
    }
    const attempt = {
      ...createReplayAttempt({
        id: 'checkpoint',
        challengeId: 'url-shortener',
        startedAt: timestamp,
        initial: { architecture: testArchitecture, load: 1, fault: 'none' },
      }),
      durationMs: 1_000,
      events: [
        {
          id: 'remove-database',
          atMs: 500,
          sequence: 0,
          source: 'user' as const,
          type: 'node.removed' as const,
          payload: { nodeId: 'database' },
        },
        {
          id: 'reset',
          atMs: 1_000,
          sequence: 1,
          source: 'system' as const,
          type: 'architecture.replaced' as const,
          payload: { architecture: replacement },
        },
      ],
    }

    expect(playReplayAt(attempt, 500).architecture).toEqual(replacement)
    expect(playReplayAt(attempt, 1_000).architecture).toEqual(replacement)
  })
})
