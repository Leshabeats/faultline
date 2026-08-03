import type {
  BottleneckKind,
  CapacityReport,
  CapacityTuning,
  ComponentKind,
  FaultMode,
} from '../domain/system'

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60
const SECONDS_PER_MONTH = 30 * 24 * 60 * 60
const GIB = 1024 ** 3

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const DATABASE_PROFILES = {
  compact: { readCapacity: 12_000, monthlyCompute: 420 },
  balanced: { readCapacity: 24_000, monthlyCompute: 840 },
  performance: { readCapacity: 50_000, monthlyCompute: 1_680 },
} as const

export const DEFAULT_CAPACITY_TUNING: CapacityTuning = {
  cacheHitRate: 0.9,
  indexedLookup: false,
  poolSize: 100,
  readReplicas: 0,
  databaseProfile: 'balanced',
}

export const CAPACITY_MODEL_LABEL = 'Reference model · Aug 2026'

export interface CapacityModelInput {
  loadMultiplier: 1 | 3 | 10
  fault: FaultMode
  tuning: CapacityTuning
  componentCounts?: Partial<Record<ComponentKind, number>>
  criticalPathConnected?: boolean
}

const normalizedCount = (value: number | undefined, fallback: number) =>
  Math.max(0, Math.floor(value ?? fallback))

const selectBottleneck = (pressures: Record<BottleneckKind, number>) =>
  (Object.entries(pressures) as Array<[BottleneckKind, number]>).reduce(
    (highest, current) => current[1] > highest[1] ? current : highest,
  )[0]

export function estimateCapacity(input: CapacityModelInput): CapacityReport {
  const { tuning, fault } = input
  const counts = input.componentCounts ?? {}
  const redirectRps = 10_000 * input.loadMultiplier
  const createRps = 100
  const cacheNodes = Math.max(1, normalizedCount(counts.cache, 1))
  const serviceNodes = Math.max(1, normalizedCount(counts.service, 1))
  const gatewayNodes = Math.max(1, normalizedCount(counts.gateway, 1))
  const queueNodes = normalizedCount(counts.queue, 1)
  const profile = DATABASE_PROFILES[tuning.databaseProfile]

  const retryMultiplier = fault === 'retry-storm' ? 1.32 : 1
  const offeredRps = redirectRps * retryMultiplier
  const effectiveCacheHitRate = fault === 'cache-outage'
    ? cacheNodes > 1
      ? tuning.cacheHitRate * 0.62
      : 0
    : tuning.cacheHitRate
  const databaseReadRps = offeredRps * (1 - effectiveCacheHitRate)
  const queryWork = tuning.indexedLookup ? 1 : 5.2
  const replicaCapacity = 1 + tuning.readReplicas * 0.85
  const slowDatabasePenalty = fault === 'slow-database' ? 0.45 : 1
  const databaseCapacity = profile.readCapacity * replicaCapacity * slowDatabasePenalty
  const databaseDemand = databaseReadRps * queryWork + createRps * 4
  const databaseUtilization = databaseDemand / databaseCapacity

  const queryTimeMs = tuning.indexedLookup ? 3.2 : 20
  const requiredConnections = databaseReadRps * (queryTimeMs / 1000) /
    (1 + tuning.readReplicas)
  const poolUtilization = requiredConnections / tuning.poolSize
  const serviceCapacity = serviceNodes * 38_000
  const serviceUtilization = offeredRps / serviceCapacity

  const databasePressure = Math.max(0, databaseUtilization - 0.55)
  const poolPressure = Math.max(0, poolUtilization - 0.7)
  const servicePressure = Math.max(0, serviceUtilization - 0.75)
  const p99 = Math.min(2_500, 28 +
    (1 - effectiveCacheHitRate) * 20 +
    (tuning.indexedLookup ? 0 : 38) +
    databasePressure * 245 +
    poolPressure * 90 +
    servicePressure * 42 +
    (fault === 'network-partition' ? 280 : 0) +
    (fault === 'slow-database' ? 110 : 0) +
    (fault === 'retry-storm' ? 90 : 0))
  const saturatingPressure = (pressure: number, ceiling: number) =>
    (1 - Math.exp(-Math.max(0, pressure) * 0.18)) * ceiling
  const errorRate = clamp(
    0.15 +
      saturatingPressure(databaseUtilization - 0.82, 25) +
      saturatingPressure(poolUtilization - 1, 12) +
      Math.max(0, serviceUtilization - 1) * 2.4 +
      (fault === 'network-partition' ? 8.5 : 0),
    0,
    60,
  )
  const routeFactor = input.criticalPathConnected === false
    ? 0.12
    : fault === 'network-partition'
      ? 0.63
      : 1
  const throughput = offeredRps * (1 - errorRate / 100) * routeFactor
  const dbCpu = clamp(18 + databaseUtilization * 66, 0, 100)
  const queueDepth = Math.max(
    0,
    offeredRps * Math.max(0, errorRate / 100) * 0.9 +
      Math.max(0, poolUtilization - 1) * tuning.poolSize * 3,
  )

  const retainedRows = createRps * SECONDS_PER_YEAR * 5
  const rawStorageGiB = retainedRows * 200 / GIB
  const storageWithIndexes = rawStorageGiB * (tuning.indexedLookup ? 1.28 : 1.08)
  const edgeAndService = gatewayNodes * 70 + serviceNodes * 96
  const cacheAndQueue = cacheNodes * 138 + queueNodes * 54
  const databaseCompute = profile.monthlyCompute *
    (1 + tuning.readReplicas * 0.82)
  const databaseStorage = storageWithIndexes * 0.115 *
    (1 + tuning.readReplicas)
  const total = edgeAndService + cacheAndQueue + databaseCompute + databaseStorage
  const monthlyRedirects = redirectRps * SECONDS_PER_MONTH
  const costPerMillion = total / (monthlyRedirects / 1_000_000)

  const bottleneck = selectBottleneck({
    cache: fault === 'cache-outage' && cacheNodes === 1 ? 1.2 : (1 - effectiveCacheHitRate) * 0.8,
    service: serviceUtilization,
    'connection-pool': poolUtilization,
    database: databaseUtilization,
  })
  const status = errorRate >= 5 || dbCpu >= 94 || p99 >= 500
    ? 'saturated'
    : errorRate >= 1 || dbCpu >= 80 || p99 >= 120
      ? 'at-risk'
      : 'within-envelope'

  return {
    modelVersion: 'reference-2026.08',
    modelStatus: 'estimated',
    workload: {
      redirectRps,
      createRps,
      effectiveCacheHitRate: round(effectiveCacheHitRate, 3),
      databaseReadRps: round(databaseReadRps),
      retainedRows: round(retainedRows),
      rawStorageGiB: round(rawStorageGiB),
    },
    utilization: {
      database: round(databaseUtilization, 3),
      connectionPool: round(poolUtilization, 3),
      service: round(serviceUtilization, 3),
    },
    metrics: {
      throughput: round(throughput),
      p99: Math.max(1, round(p99)),
      errorRate: round(errorRate, 1),
      dbCpu: round(dbCpu),
      cacheMiss: round((1 - effectiveCacheHitRate) * 100, 1),
      queueDepth: round(queueDepth),
    },
    cost: {
      edgeAndService: round(edgeAndService),
      cacheAndQueue: round(cacheAndQueue),
      databaseCompute: round(databaseCompute),
      databaseStorage: round(databaseStorage),
      total: round(total),
      perMillionRedirects: round(costPerMillion, 4),
    },
    bottleneck,
    status,
    assumptions: [
      '100 creates/s, five-year retention, and 200 B of raw link data per row.',
      'One month is 30 days; storage is modeled at $0.115/GiB-month.',
      'Replica reads are 85% as efficient as primary reads.',
      'Component prices are scenario reference units, not a cloud-provider quote.',
    ],
  }
}
