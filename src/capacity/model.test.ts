import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPACITY_TUNING, estimateCapacity } from './model'

describe('estimateCapacity', () => {
  it('is deterministic and exposes the workload assumptions', () => {
    const input = {
      loadMultiplier: 10 as const,
      fault: 'cache-outage' as const,
      tuning: DEFAULT_CAPACITY_TUNING,
      componentCounts: { service: 1, cache: 1, database: 1 },
      criticalPathConnected: true,
    }

    const first = estimateCapacity(input)
    const second = estimateCapacity(input)

    expect(first).toEqual(second)
    expect(first.workload.redirectRps).toBe(100_000)
    expect(first.workload.createRps).toBe(100)
    expect(first.workload.retainedRows).toBe(15_768_000_000)
    expect(first.modelStatus).toBe('estimated')
    expect(first.calibration.pricing.status).toBe('verified-rates')
    expect(first.calibration.capacity.status).toBe('estimated')
  })

  it('rewards an indexed, replicated database and a larger pool', () => {
    const baseline = estimateCapacity({
      loadMultiplier: 10,
      fault: 'cache-outage',
      tuning: DEFAULT_CAPACITY_TUNING,
      componentCounts: { service: 1, cache: 1, database: 1 },
    })
    const tuned = estimateCapacity({
      loadMultiplier: 10,
      fault: 'cache-outage',
      tuning: {
        ...DEFAULT_CAPACITY_TUNING,
        cacheHitRate: 0.99,
        indexedLookup: true,
        poolSize: 600,
        readReplicas: 2,
        databaseProfile: 'performance',
      },
      componentCounts: { service: 2, cache: 2, database: 1 },
    })

    expect(tuned.metrics.p99).toBeLessThan(baseline.metrics.p99)
    expect(tuned.metrics.dbCpu).toBeLessThan(baseline.metrics.dbCpu)
    expect(tuned.metrics.errorRate).toBeLessThan(baseline.metrics.errorRate)
    expect(tuned.cost.total).toBeGreaterThan(baseline.cost.total)
  })

  it('makes index and storage replication costs explicit', () => {
    const noReplica = estimateCapacity({
      loadMultiplier: 3,
      fault: 'none',
      tuning: DEFAULT_CAPACITY_TUNING,
    })
    const replicated = estimateCapacity({
      loadMultiplier: 3,
      fault: 'none',
      tuning: {
        ...DEFAULT_CAPACITY_TUNING,
        indexedLookup: true,
        readReplicas: 2,
      },
    })

    expect(replicated.cost.databaseStorage).toBeGreaterThan(noReplica.cost.databaseStorage)
    expect(replicated.cost.databaseCompute).toBeGreaterThan(noReplica.cost.databaseCompute)
    expect(replicated.cost.perMillionRedirects).toBeGreaterThan(0)
  })

  it('keeps verified prices separate from measured capacity evidence', () => {
    const reference = estimateCapacity({
      loadMultiplier: 10,
      fault: 'none',
      tuning: {
        ...DEFAULT_CAPACITY_TUNING,
        benchmarkPackId: 'reference-2026.08',
      },
    })
    const locallyCalibrated = estimateCapacity({
      loadMultiplier: 10,
      fault: 'none',
      tuning: {
        ...DEFAULT_CAPACITY_TUNING,
        benchmarkPackId: 'local-m1-pro-2026.08',
      },
    })

    expect(reference.calibration.pricing.status).toBe('verified-rates')
    expect(reference.calibration.capacity.status).toBe('estimated')
    expect(locallyCalibrated.calibration.capacity.status).toBe('mixed-measured')
    expect(locallyCalibrated.utilization.cache).toBeGreaterThan(reference.utilization.cache)
    expect(locallyCalibrated.utilization.database).toBeGreaterThan(reference.utilization.database)
  })

  it('uses database shards to split capacity and multiply infrastructure cost', () => {
    const singleShard = estimateCapacity({
      loadMultiplier: 10,
      fault: 'none',
      tuning: { ...DEFAULT_CAPACITY_TUNING, indexedLookup: true },
      componentCounts: { service: 1, cache: 1, database: 1 },
    })
    const fourShards = estimateCapacity({
      loadMultiplier: 10,
      fault: 'none',
      tuning: { ...DEFAULT_CAPACITY_TUNING, indexedLookup: true },
      componentCounts: { service: 1, cache: 1, database: 4 },
    })

    expect(fourShards.utilization.database).toBeLessThan(singleShard.utilization.database)
    expect(fourShards.cost.databaseCompute).toBeGreaterThan(singleShard.cost.databaseCompute)
    expect(fourShards.cost.databaseStorage).toBeGreaterThan(singleShard.cost.databaseStorage)
  })

  it('does not mistake cache shards for outage-surviving replicas', () => {
    const shardedOnly = estimateCapacity({
      loadMultiplier: 3,
      fault: 'cache-outage',
      tuning: DEFAULT_CAPACITY_TUNING,
      componentCounts: { service: 1, cache: 4, database: 1 },
      replicaCounts: { service: 1, cache: 1, database: 1 },
    })
    const replicated = estimateCapacity({
      loadMultiplier: 3,
      fault: 'cache-outage',
      tuning: DEFAULT_CAPACITY_TUNING,
      componentCounts: { service: 1, cache: 4, database: 1 },
      replicaCounts: { service: 1, cache: 2, database: 1 },
    })

    expect(shardedOnly.workload.effectiveCacheHitRate).toBe(0)
    expect(replicated.workload.effectiveCacheHitRate).toBeGreaterThan(0)
    expect(replicated.utilization.database).toBeLessThan(shardedOnly.utilization.database)
  })

  it('accepts intermediate load while live traffic is ramping', () => {
    const report = estimateCapacity({
      loadMultiplier: 4.2,
      fault: 'none',
      tuning: DEFAULT_CAPACITY_TUNING,
    })

    expect(report.workload.redirectRps).toBe(42_000)
  })
})
