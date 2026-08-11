import { describe, expect, it } from 'vitest'
import type { FaultMode, SimulationMetrics } from '../domain/system'
import { computeSimulation } from './engine'

const loads = [1, 3, 10] as const
const faults: FaultMode[] = [
  'none',
  'component-outage',
  'cache-outage',
  'slow-database',
  'network-partition',
  'retry-storm',
]

const metricValues = (metrics: SimulationMetrics) => Object.values(metrics)

describe('computeSimulation', () => {
  it('reproduces the launch cache-outage scenario at 10x load', () => {
    const snapshot = computeSimulation({
      loadMultiplier: 10,
      fault: 'cache-outage',
      tick: 0,
    })

    expect(snapshot.metrics.throughput).toBe(100_000)
    expect(snapshot.metrics.p99).toBeGreaterThanOrEqual(840)
    expect(snapshot.metrics.errorRate).toBe(12.4)
    expect(snapshot.metrics.dbCpu).toBeGreaterThanOrEqual(96)
    expect(snapshot.nodeHealth.cache).toBe('failed')
    expect(snapshot.nodeHealth.database).toBe('hot')
  })

  it('increases normal load without fabricating a fault', () => {
    const low = computeSimulation({ loadMultiplier: 1, fault: 'none', tick: 0 })
    const high = computeSimulation({ loadMultiplier: 10, fault: 'none', tick: 0 })

    expect(high.metrics.throughput).toBeGreaterThan(low.metrics.throughput)
    expect(high.metrics.dbCpu).toBeGreaterThan(low.metrics.dbCpu)
    expect(high.nodeHealth.cache).toBe('healthy')
  })

  it('turns a retry storm into a queue backlog and a hot database', () => {
    const snapshot = computeSimulation({
      loadMultiplier: 10,
      fault: 'retry-storm',
      tick: 0,
    })

    expect(snapshot.nodeHealth.queue).toBe('backlog')
    expect(snapshot.nodeHealth.database).toBe('hot')
    expect(snapshot.metrics.queueDepth).toBeGreaterThan(20_000)
  })

  it.each(faults)('is deterministic for %s', (fault) => {
    const input = { loadMultiplier: 3 as const, fault, tick: 17 }

    expect(computeSimulation(input)).toEqual(computeSimulation(input))
  })

  it('keeps every supported scenario finite, non-negative, and percentage-bounded', () => {
    for (const fault of faults) {
      for (const loadMultiplier of loads) {
        for (const tick of [-100, 0, 1, 999_999]) {
          const { metrics } = computeSimulation({
            loadMultiplier,
            fault,
            tick,
          })

          for (const value of metricValues(metrics)) {
            expect(Number.isFinite(value)).toBe(true)
            expect(value).toBeGreaterThanOrEqual(0)
          }
          expect(metrics.p99).toBeGreaterThanOrEqual(1)
          expect(metrics.errorRate).toBeLessThanOrEqual(100)
          expect(metrics.dbCpu).toBeLessThanOrEqual(100)
          expect(metrics.cacheMiss).toBeLessThanOrEqual(100)
        }
      }
    }
  })

  it.each(faults)(
    'does not improve pressure metrics as load rises during %s',
    (fault) => {
      const snapshots = loads.map((loadMultiplier) =>
        computeSimulation({ loadMultiplier, fault, tick: 9 }),
      )

      for (let index = 1; index < snapshots.length; index += 1) {
        const previous = snapshots[index - 1].metrics
        const current = snapshots[index].metrics

        expect(current.throughput).toBeGreaterThan(previous.throughput)
        expect(current.p99).toBeGreaterThanOrEqual(previous.p99)
        expect(current.errorRate).toBeGreaterThanOrEqual(previous.errorRate)
        expect(current.dbCpu).toBeGreaterThanOrEqual(previous.dbCpu)
        expect(current.cacheMiss).toBeGreaterThanOrEqual(previous.cacheMiss)
        expect(current.queueDepth).toBeGreaterThan(previous.queueDepth)
      }
    },
  )

  it('models each fault against the same healthy baseline without relying on motion values', () => {
    const input = { loadMultiplier: 3 as const, tick: 23 }
    const healthy = computeSimulation({ ...input, fault: 'none' })
    const cacheOutage = computeSimulation({ ...input, fault: 'cache-outage' })
    const slowDatabase = computeSimulation({ ...input, fault: 'slow-database' })
    const partition = computeSimulation({
      ...input,
      fault: 'network-partition',
    })
    const retryStorm = computeSimulation({ ...input, fault: 'retry-storm' })

    expect(cacheOutage.nodeHealth).toMatchObject({
      cache: 'failed',
      database: 'degraded',
      service: 'degraded',
    })
    expect(cacheOutage.metrics.cacheMiss).toBeGreaterThan(
      healthy.metrics.cacheMiss,
    )
    expect(cacheOutage.metrics.p99).toBeGreaterThan(healthy.metrics.p99)

    expect(slowDatabase.nodeHealth).toMatchObject({
      database: 'degraded',
      service: 'degraded',
    })
    expect(slowDatabase.metrics.p99).toBeGreaterThan(healthy.metrics.p99)
    expect(slowDatabase.metrics.queueDepth).toBeGreaterThan(
      healthy.metrics.queueDepth,
    )

    expect(partition.nodeHealth).toMatchObject({
      gateway: 'failed',
      service: 'degraded',
    })
    expect(partition.metrics.throughput).toBeLessThan(
      healthy.metrics.throughput,
    )
    expect(partition.metrics.errorRate).toBeGreaterThan(
      healthy.metrics.errorRate,
    )

    expect(retryStorm.nodeHealth).toMatchObject({
      service: 'degraded',
      queue: 'backlog',
      database: 'degraded',
    })
    expect(retryStorm.metrics.throughput).toBeGreaterThan(
      healthy.metrics.throughput,
    )
    expect(retryStorm.metrics.queueDepth).toBeGreaterThan(
      healthy.metrics.queueDepth,
    )
  })

  it('keeps semantic fault state stable while visual motion advances', () => {
    for (const fault of faults) {
      const initial = computeSimulation({
        loadMultiplier: 10,
        fault,
        tick: 0,
      })

      for (const tick of [1, 7, 42]) {
        const animated = computeSimulation({
          loadMultiplier: 10,
          fault,
          tick,
        })

        expect(animated.nodeHealth).toEqual(initial.nodeHealth)
      }
    }
  })

  it('lets an additional cache replica reduce a single-replica outage', () => {
    const single = computeSimulation({
      loadMultiplier: 10,
      fault: 'cache-outage',
      tick: 0,
      componentCounts: { service: 1, cache: 1, database: 1 },
      criticalPathConnected: true,
    })
    const redundant = computeSimulation({
      loadMultiplier: 10,
      fault: 'cache-outage',
      tick: 0,
      componentCounts: { service: 1, cache: 2, database: 1 },
      criticalPathConnected: true,
    })

    expect(redundant.nodeHealth.cache).toBe('degraded')
    expect(redundant.metrics.cacheMiss).toBeLessThan(single.metrics.cacheMiss)
    expect(redundant.metrics.dbCpu).toBeLessThan(single.metrics.dbCpu)
    expect(redundant.metrics.p99).toBeLessThan(single.metrics.p99)
  })

  it('fails the request path when the graph no longer connects clients to a database', () => {
    const disconnected = computeSimulation({
      loadMultiplier: 3,
      fault: 'none',
      tick: 0,
      componentCounts: { client: 1, service: 1, database: 1 },
      criticalPathConnected: false,
    })

    expect(disconnected.metrics.errorRate).toBeGreaterThanOrEqual(88)
    expect(disconnected.metrics.throughput).toBeLessThan(10_000)
    expect(disconnected.nodeHealth.service).toBe('failed')
    expect(disconnected.nodeDetails.service).toBe('No route')
    expect(disconnected.nodeDetails.gateway).toBe('Route degraded')
  })

  it('degrades capacity when one targeted service replica is lost', () => {
    const healthy = computeSimulation({
      loadMultiplier: 3,
      fault: 'none',
      tick: 0,
      criticalPathConnected: true,
    })
    const outage = computeSimulation({
      loadMultiplier: 3,
      fault: 'component-outage',
      tick: 0,
      criticalPathConnected: true,
      faultImpact: {
        targetType: 'node',
        componentKind: 'service',
        remainingReplicas: 1,
        routeDisconnected: false,
      },
    })

    expect(outage.metrics.throughput).toBeLessThan(healthy.metrics.throughput)
    expect(outage.metrics.p99).toBeGreaterThan(healthy.metrics.p99)
    expect(outage.metrics.errorRate).toBeGreaterThan(healthy.metrics.errorRate)
  })

  it('models a partitioned edge as partial loss when another route survives', () => {
    const healthy = computeSimulation({ loadMultiplier: 3, fault: 'none', tick: 0 })
    const partition = computeSimulation({
      loadMultiplier: 3,
      fault: 'network-partition',
      tick: 0,
      criticalPathConnected: true,
      faultImpact: {
        targetType: 'edge',
        remainingReplicas: 0,
        routeDisconnected: false,
      },
    })

    expect(partition.metrics.throughput).toBeLessThan(healthy.metrics.throughput)
    expect(partition.metrics.errorRate).toBeGreaterThan(healthy.metrics.errorRate)
    expect(partition.metrics.errorRate).toBeLessThan(20)
  })

  it('applies candidate capacity decisions to the live failure metrics', () => {
    const baseline = computeSimulation({
      loadMultiplier: 10,
      fault: 'cache-outage',
      tick: 0,
      componentCounts: { service: 1, cache: 1, database: 1 },
      criticalPathConnected: true,
      capacity: {
        cacheHitRate: 0.9,
        indexedLookup: false,
        poolSize: 100,
        readReplicas: 0,
        databaseProfile: 'balanced',
      },
    })
    const tuned = computeSimulation({
      loadMultiplier: 10,
      fault: 'cache-outage',
      tick: 0,
      componentCounts: { service: 1, cache: 1, database: 1 },
      criticalPathConnected: true,
      capacity: {
        cacheHitRate: 0.99,
        indexedLookup: true,
        poolSize: 600,
        readReplicas: 2,
        databaseProfile: 'performance',
      },
    })

    expect(tuned.metrics.p99).toBeLessThan(baseline.metrics.p99)
    expect(tuned.metrics.dbCpu).toBeLessThan(baseline.metrics.dbCpu)
    expect(tuned.metrics.throughput).toBeGreaterThan(baseline.metrics.throughput)
    expect(tuned.capacity?.cost.total).toBeGreaterThan(baseline.capacity?.cost.total ?? 0)
  })
})
