import type {
  ComponentKind,
  ReadReplicaCount,
} from './system'

export interface NodeTopology {
  replicas: number
  shards: number
}

/**
 * UI-independent graph contract consumed by simulation, judging, and replay.
 * React Flow nodes and replay nodes both satisfy this structural type.
 */
export interface TopologyNode {
  id: string
  data: {
    kind: ComponentKind
    replicas?: number
    shards?: number
  }
}

export interface TopologyEdge {
  source: string
  target: string
}

export interface TopologyAnalysis {
  /** Capacity-bearing instances. Cache shards multiply per replica. */
  componentCounts: Partial<Record<ComponentKind, number>>
  /** Independent serving copies. Shards never increase this count. */
  replicaCounts: Partial<Record<ComponentKind, number>>
  criticalPathConnected: boolean
  routedNodeIds: string[]
}

export const MAX_REPLICAS_BY_KIND: Record<ComponentKind, number> = {
  client: 4,
  gateway: 4,
  service: 4,
  cache: 4,
  queue: 4,
  // One primary plus the two read replicas supported by CapacityTuning.
  database: 3,
  region: 4,
}

export const MAX_SHARDS = 8

const finiteInteger = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.floor(value as number) : fallback

export function normalizeNodeTopology(
  kind: ComponentKind,
  topology: Partial<NodeTopology>,
): NodeTopology {
  return {
    replicas: Math.min(
      MAX_REPLICAS_BY_KIND[kind],
      Math.max(1, finiteInteger(topology.replicas, 1)),
    ),
    shards: Math.min(
      MAX_SHARDS,
      Math.max(1, finiteInteger(topology.shards, 1)),
    ),
  }
}

export const databaseReadReplicas = (
  topology: Pick<NodeTopology, 'replicas'>,
): ReadReplicaCount => Math.min(2, Math.max(0, topology.replicas - 1)) as ReadReplicaCount

export const databaseReplicas = (readReplicas: ReadReplicaCount) => readReplicas + 1
