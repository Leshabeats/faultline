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
  | 'cache-outage'
  | 'slow-database'
  | 'network-partition'
  | 'retry-storm'

export interface SystemNodeData extends Record<string, unknown> {
  kind: ComponentKind
  label: string
  health: ComponentHealth
  detail: string
  load: number
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

export interface CapacityTuning {
  cacheHitRate: CacheHitRate
  indexedLookup: boolean
  poolSize: ConnectionPoolSize
  readReplicas: ReadReplicaCount
  databaseProfile: DatabaseProfile
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
  modelVersion: 'reference-2026.08'
  modelStatus: 'estimated'
  workload: {
    redirectRps: number
    createRps: number
    effectiveCacheHitRate: number
    databaseReadRps: number
    retainedRows: number
    rawStorageGiB: number
  }
  utilization: {
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
  loadMultiplier: 1 | 3 | 10
  fault: FaultMode
  tick: number
  nodeCount?: number
  edgeCount?: number
  componentCounts?: Partial<Record<ComponentKind, number>>
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
  'cache-outage': 'Cache outage',
  'slow-database': 'Slow database',
  'network-partition': 'Network partition',
  'retry-storm': 'Retry storm',
}
