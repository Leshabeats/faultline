import type {
  CapacityTuning,
  ComponentKind,
  FaultMode,
  FaultTarget,
  LoadMultiplier,
} from '../domain/system'
import {
  WORKSPACE_SCHEMA,
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceDocumentV1,
  type WorkspaceEdgeV1,
  type WorkspaceNodeV1,
} from './types'

const componentKinds: ComponentKind[] = [
  'client', 'gateway', 'service', 'cache', 'queue', 'database', 'region',
]
const faultModes: FaultMode[] = [
  'none',
  'component-outage',
  'cache-outage',
  'slow-database',
  'network-partition',
  'retry-storm',
  'celebrity-spike',
  'worker-outage',
  'hot-key',
  'duplicate-delivery',
]
const loads: LoadMultiplier[] = [1, 3, 10]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown, limit = 10_000_000): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit

const isPositiveInteger = (value: unknown, max: number) =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= max

const isBoundedString = (value: unknown, max = 200): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

const isOptionalBoundedString = (value: unknown, max: number) =>
  value === undefined || (typeof value === 'string' && value.length <= max)

const isOptionalHandle = (value: unknown) =>
  value === undefined || value === null || isBoundedString(value, 80)

const isIsoDate = (value: unknown) =>
  isBoundedString(value, 40) && Number.isFinite(Date.parse(value))

const isCapacityTuning = (value: unknown): value is CapacityTuning => {
  if (!isRecord(value)) return false
  if (![0.9, 0.95, 0.99].includes(value.cacheHitRate as number)) return false
  if (typeof value.indexedLookup !== 'boolean') return false
  if (![100, 300, 600].includes(value.poolSize as number)) return false
  if (![0, 1, 2].includes(value.readReplicas as number)) return false
  if (!['compact', 'balanced', 'performance'].includes(value.databaseProfile as string)) return false
  if (value.pricingPackId !== undefined && !['reference-2026.08', 'aws-us-east-1-2026.07'].includes(value.pricingPackId as string)) return false
  if (value.benchmarkPackId !== undefined && !['reference-2026.08', 'local-m1-pro-2026.08'].includes(value.benchmarkPackId as string)) return false
  if (value.fanoutStrategy !== undefined && !['write', 'read', 'hybrid'].includes(value.fanoutStrategy as string)) return false
  if (value.fanoutWorkers !== undefined && ![4, 16, 64].includes(value.fanoutWorkers as number)) return false
  if (value.fanoutBatchSize !== undefined && ![100, 500, 2_000].includes(value.fanoutBatchSize as number)) return false
  if (value.celebrityThreshold !== undefined && ![100_000, 1_000_000, 10_000_000].includes(value.celebrityThreshold as number)) return false
  return value.deduplication === undefined || typeof value.deduplication === 'boolean'
}

const isWorkspaceNode = (value: unknown): value is WorkspaceNodeV1 => {
  if (!isRecord(value) || value.type !== 'system' || !isBoundedString(value.id)) return false
  if (!isRecord(value.position) || !isFiniteNumber(value.position.x) || !isFiniteNumber(value.position.y)) return false
  if (!isRecord(value.data)) return false
  return componentKinds.includes(value.data.kind as ComponentKind) &&
    isBoundedString(value.data.label, 120) &&
    (value.data.replicas === undefined || isPositiveInteger(value.data.replicas, 128)) &&
    (value.data.shards === undefined || isPositiveInteger(value.data.shards, 1_024)) &&
    isOptionalBoundedString(value.data.notes, 2_000)
}

const isWorkspaceEdge = (value: unknown): value is WorkspaceEdgeV1 =>
  isRecord(value) &&
  value.type === 'traffic' &&
  isBoundedString(value.id) &&
  isBoundedString(value.source) &&
  isBoundedString(value.target) &&
  isOptionalHandle(value.sourceHandle) &&
  isOptionalHandle(value.targetHandle) &&
  isOptionalBoundedString(value.label, 160)

const isFaultTarget = (value: unknown): value is FaultTarget =>
  isRecord(value) &&
  (value.type === 'node' || value.type === 'edge') &&
  isBoundedString(value.id)

export function validateWorkspaceDocument(value: unknown): value is WorkspaceDocumentV1 {
  if (!isRecord(value) || value.schema !== WORKSPACE_SCHEMA || value.version !== WORKSPACE_SCHEMA_VERSION) return false
  if (!isBoundedString(value.id) || !isBoundedString(value.title, 80)) return false
  if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) return false
  if (value.simulationProfile !== 'url-shortener' && value.simulationProfile !== 'news-feed') return false
  if (!loads.includes(value.load as LoadMultiplier) || !faultModes.includes(value.fault as FaultMode)) return false
  if (value.faultTarget !== undefined && !isFaultTarget(value.faultTarget)) return false
  if (!isCapacityTuning(value.capacity) || !isRecord(value.architecture)) return false
  if (!Array.isArray(value.architecture.nodes) || !Array.isArray(value.architecture.edges)) return false
  if (value.architecture.nodes.length > 200 || value.architecture.edges.length > 400) return false
  if (!value.architecture.nodes.every(isWorkspaceNode) || !value.architecture.edges.every(isWorkspaceEdge)) return false

  const nodeIds = new Set(value.architecture.nodes.map((node) => node.id))
  const edgeIds = new Set(value.architecture.edges.map((edge) => edge.id))
  if (nodeIds.size !== value.architecture.nodes.length || edgeIds.size !== value.architecture.edges.length) return false
  if (!value.architecture.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))) return false
  if (!value.faultTarget) return true
  return value.faultTarget.type === 'node'
    ? nodeIds.has(value.faultTarget.id)
    : edgeIds.has(value.faultTarget.id)
}
