export type ComponentKind =
  | 'client'
  | 'gateway'
  | 'service'
  | 'cache'
  | 'queue'
  | 'database'
  | 'region'

export type ComponentHealth =
  | 'healthy'
  | 'degraded'
  | 'failed'
  | 'hot'
  | 'backlog'

export type FaultMode =
  | 'none'
  | 'component-outage'
  | 'cache-outage'
  | 'slow-database'
  | 'network-partition'
  | 'retry-storm'
  | 'celebrity-spike'
  | 'worker-outage'
  | 'hot-key'
  | 'duplicate-delivery'

export type ScenarioId = 'url-shortener' | 'news-feed'
export type Locale = 'en' | 'ru'
export type LoadMultiplier = 1 | 3 | 10

export type FaultTarget =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }

export interface SimulationFaultImpact {
  targetType: FaultTarget['type']
  componentKind?: ComponentKind
  remainingReplicas: number
  routeDisconnected: boolean
}

export interface SystemNodeData extends Record<string, unknown> {
  kind: ComponentKind
  label: string
  health: ComponentHealth
  detail: string
  load: number
  /** Logical instances rendered as a compact stack on the canvas. */
  replicas?: number
  /** Data partitions owned by this logical component. */
  shards?: number
  /** Freeform workspace context exported with the architecture. */
  notes?: string
}

export interface SimulationMetrics {
  throughput: number
  p99: number
  errorRate: number
  dbCpu: number
  cacheMiss: number
  queueDepth: number
}

export interface SimulationSnapshot {
  metrics: SimulationMetrics
  nodeHealth: Partial<Record<ComponentKind, ComponentHealth>>
  nodeDetails: Partial<Record<ComponentKind, string>>
  severity: 'normal' | 'degraded' | 'critical'
  capacity?: CapacityReport
}

export type DatabaseProfile = 'compact' | 'balanced' | 'performance'
export type CacheHitRate = 0.9 | 0.95 | 0.99
export type ConnectionPoolSize = 100 | 300 | 600
export type ReadReplicaCount = 0 | 1 | 2
export type PricingPackId = 'reference-2026.08' | 'aws-us-east-1-2026.07'
export type BenchmarkPackId = 'reference-2026.08' | 'local-m1-pro-2026.08'
export type FanoutStrategy = 'write' | 'read' | 'hybrid'
export type FanoutWorkerCount = 4 | 16 | 64
export type FanoutBatchSize = 100 | 500 | 2000
export type CelebrityThreshold = 100_000 | 1_000_000 | 10_000_000

export interface CapacityTuning {
  cacheHitRate: CacheHitRate
  indexedLookup: boolean
  poolSize: ConnectionPoolSize
  readReplicas: ReadReplicaCount
  databaseProfile: DatabaseProfile
  /** Optional so replay envelopes recorded before v0.3.1 remain valid. */
  pricingPackId?: PricingPackId
  /** Optional so replay envelopes recorded before v0.3.1 remain valid. */
  benchmarkPackId?: BenchmarkPackId
  /** Optional so URL-shortener and pre-v0.3.2 replay envelopes stay valid. */
  fanoutStrategy?: FanoutStrategy
  fanoutWorkers?: FanoutWorkerCount
  fanoutBatchSize?: FanoutBatchSize
  celebrityThreshold?: CelebrityThreshold
  deduplication?: boolean
}

export type NewsFeedBottleneck =
  | 'fanout-queue'
  | 'workers'
  | 'timeline-cache'
  | 'post-store'

export interface NewsFeedReport {
  modelVersion: 'celebrity-2026.08'
  modelStatus: 'estimated'
  workload: {
    postsPerSecond: number
    readsPerSecond: number
    fanoutJobsPerSecond: number
    celebrityFollowers: number
  }
  utilization: {
    workers: number
    queue: number
    cache: number
    postStore: number
  }
  metrics: SimulationMetrics
  cost: {
    workers: number
    queue: number
    cache: number
    postStore: number
    total: number
  }
  duplicateRate: number
  bottleneck: NewsFeedBottleneck
  status: 'within-envelope' | 'at-risk' | 'saturated'
  assumptions: string[]
}

export type BottleneckKind =
  | 'cache'
  | 'service'
  | 'connection-pool'
  | 'database'

export interface CapacityCostBreakdown {
  edgeAndService: number
  cacheAndQueue: number
  databaseCompute: number
  databaseStorage: number
  total: number
}

export interface CapacityReport {
  modelVersion: 'calibrated-2026.08'
  modelStatus: 'estimated'
  calibration: {
    pricing: {
      id: PricingPackId
      label: string
      status: 'reference' | 'verified-rates'
      checkedAt: string
      region?: string
      sourceCount: number
    }
    capacity: {
      id: BenchmarkPackId
      label: string
      status: 'estimated' | 'mixed-measured'
      measuredAt?: string
      environment?: string
    }
  }
  workload: {
    redirectRps: number
    createRps: number
    effectiveCacheHitRate: number
    databaseReadRps: number
    databaseShards: number
    retainedRows: number
    rawStorageGiB: number
  }
  utilization: {
    cache: number
    database: number
    connectionPool: number
    service: number
  }
  metrics: SimulationMetrics
  cost: CapacityCostBreakdown & { perMillionRedirects: number }
  bottleneck: BottleneckKind
  status: 'within-envelope' | 'at-risk' | 'saturated'
  assumptions: string[]
}

export interface SimulationInput {
  scenario?: ScenarioId
  /** May sit between presets while the live traffic ramp is in progress. */
  loadMultiplier: number
  fault: FaultMode
  faultImpact?: SimulationFaultImpact
  tick: number
  nodeCount?: number
  edgeCount?: number
  componentCounts?: Partial<Record<ComponentKind, number>>
  /** Serving replicas, kept separate from shard-driven capacity. */
  replicaCounts?: Partial<Record<ComponentKind, number>>
  criticalPathConnected?: boolean
  capacity?: CapacityTuning
}

export interface TelemetryPoint extends SimulationMetrics {
  tick: number
}

export interface TimelineEvent {
  id: string
  timestamp: string
  title: string
  detail: string
  translations?: Record<Locale, { title: string; detail: string }>
  tone: 'neutral' | 'healthy' | 'warning' | 'critical'
}

export const COMPONENT_LABELS: Record<ComponentKind, string> = {
  client: 'Clients',
  gateway: 'Gateway',
  service: 'Service',
  cache: 'Cache',
  queue: 'Queue',
  database: 'Database',
  region: 'Region',
}

export const FAULT_LABELS: Record<FaultMode, string> = {
  none: 'No fault',
  'component-outage': 'Component outage',
  'cache-outage': 'Cache outage',
  'slow-database': 'Slow database',
  'network-partition': 'Network partition',
  'retry-storm': 'Retry storm',
  'celebrity-spike': 'Celebrity spike',
  'worker-outage': 'Worker outage',
  'hot-key': 'Hot key',
  'duplicate-delivery': 'Duplicate delivery',
}
