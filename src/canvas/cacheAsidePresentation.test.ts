import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'
import { computeSimulation } from '../simulation/engine'
import { seedEdges } from './seed'
import { projectCacheAsideTraffic } from './cacheAsidePresentation'

describe('cache-aside traffic presentation', () => {
  it('shows only the miss fraction on the database fallback while Redis is healthy', () => {
    const snapshot = computeSimulation({
      loadMultiplier: 1,
      fault: 'none',
      tick: 0,
      capacity: DEFAULT_CAPACITY_TUNING,
    })
    const edges = projectCacheAsideTraffic({
      edges: seedEdges,
      snapshot,
      cacheHealth: 'healthy',
      locale: 'en',
    })

    expect(edges.some(({ id }) => id === 'cache-database')).toBe(false)
    expect(edges.find(({ id }) => id === 'api-cache'))
      .toMatchObject({ label: '10% miss', data: { flowRatio: 1, paused: false } })
    expect(edges.find(({ id }) => id === 'api-database'))
      .toMatchObject({ label: '1k req/s · miss path', data: { flowRatio: 0.1 } })
  })

  it('moves all traffic and p99 context onto the fallback when Redis is unavailable', () => {
    const snapshot = computeSimulation({
      loadMultiplier: 3,
      fault: 'component-outage',
      tick: 0,
      capacity: DEFAULT_CAPACITY_TUNING,
      componentCounts: { client: 1, gateway: 1, service: 1, database: 1 },
      criticalPathConnected: true,
      faultImpact: {
        targetType: 'node',
        componentKind: 'cache',
        remainingReplicas: 0,
        routeDisconnected: false,
      },
    })
    const edges = projectCacheAsideTraffic({
      edges: seedEdges,
      snapshot,
      cacheHealth: 'failed',
      locale: 'ru',
    })

    expect(edges.find(({ id }) => id === 'api-cache'))
      .toMatchObject({ label: 'Недоступен', data: { flowRatio: 0, paused: true } })
    expect(edges.find(({ id }) => id === 'api-database'))
      .toMatchObject({
        label: expect.stringMatching(/^30k запр\/с · резервный путь · p99 \d+ ms$/),
        data: { tone: 'warning', flowRatio: 1 },
      })
  })

  it('drops the legacy Redis-to-database edge from imported attempts', () => {
    const snapshot = computeSimulation({
      loadMultiplier: 1,
      fault: 'none',
      tick: 0,
      capacity: DEFAULT_CAPACITY_TUNING,
    })
    const edges = projectCacheAsideTraffic({
      edges: [
        ...seedEdges,
        {
          id: 'cache-database',
          type: 'traffic',
          source: 'cache',
          target: 'database',
          data: { tone: 'healthy', intensity: 1, paused: false },
        },
      ],
      snapshot,
      cacheHealth: 'healthy',
      locale: 'en',
    })

    expect(edges.some(({ id }) => id === 'cache-database')).toBe(false)
  })
})
