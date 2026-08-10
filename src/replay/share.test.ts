import { describe, expect, it } from 'vitest'
import { parseReplayEnvelope } from './serialization'
import { serializeScenarioSnapshot } from './share'
import { testArchitecture, timestamp } from './testFixtures'

describe('scenario sharing', () => {
  it('round-trips live topology through the versioned replay envelope', () => {
    const architecture = structuredClone(testArchitecture)
    architecture.nodes[1].data.replicas = 3
    architecture.nodes[1].data.shards = 4

    const parsed = parseReplayEnvelope(serializeScenarioSnapshot({
      challengeId: 'url-shortener',
      timestamp,
      initial: {
        architecture,
        load: 10,
        fault: 'slow-database',
        capacity: {
          cacheHitRate: 0.99,
          indexedLookup: true,
          poolSize: 600,
          readReplicas: 2,
          databaseProfile: 'performance',
        },
      },
    }))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migrated).toBe(false)
    expect(parsed.value.attempt.initial.architecture.nodes[1].data).toMatchObject({
      replicas: 3,
      shards: 4,
    })
    expect(parsed.value.attempt.initial.capacity?.readReplicas).toBe(2)
  })
})
