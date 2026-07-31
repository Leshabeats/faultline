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
}

export interface SimulationInput {
  loadMultiplier: 1 | 3 | 10
  fault: FaultMode
  tick: number
  nodeCount?: number
  edgeCount?: number
  componentCounts?: Partial<Record<ComponentKind, number>>
  criticalPathConnected?: boolean
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
