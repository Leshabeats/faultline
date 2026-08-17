import type {
  ComponentHealth,
  FaultMode,
  SimulationSnapshot,
} from '../domain/system'
import type { TopologyAnalysis } from '../domain/topology'
import type { TargetedFaultImpact } from '../simulation/faultImpact'
import type { SystemFlowEdge, SystemFlowNode } from './types'

const toneForHealth = (health: ComponentHealth) => {
  if (health === 'failed' || health === 'hot') return 'critical' as const
  if (health === 'degraded' || health === 'backlog') return 'warning' as const
  return 'healthy' as const
}

interface ProjectFaultNodesInput {
  nodes: SystemFlowNode[]
  fault: FaultMode
  impact: TargetedFaultImpact
  routedNodeIds: string[]
  criticalPathConnected: boolean
  replicaCounts: TopologyAnalysis['replicaCounts']
  nodeHealth: SimulationSnapshot['nodeHealth']
  nodeDetails: SimulationSnapshot['nodeDetails']
  load: number
  resolveLabel?: (node: SystemFlowNode) => string
  resolveDetail?: (detail: string) => string
}

export function projectFaultNodes({
  nodes,
  fault,
  impact,
  routedNodeIds,
  criticalPathConnected,
  replicaCounts,
  nodeHealth,
  nodeDetails,
  load,
  resolveLabel = (node) => node.data.label,
  resolveDetail = (detail) => detail,
}: ProjectFaultNodesInput): SystemFlowNode[] {
  const routedNodeIdSet = new Set(routedNodeIds)
  const routedCaches = nodes.filter(
    (node) => node.data.kind === 'cache' && routedNodeIdSet.has(node.id),
  )
  const faultedCacheId = routedCaches[0]?.id
  const failedNodeIds = new Set(impact.failedNodeIds)
  const degradedNodeIds = new Set(impact.degradedNodeIds)
  const isolatedNodeIds = new Set(impact.isolatedNodeIds)
  const affectedNodeIds = new Set(impact.affectedNodeIds)

  return nodes.map((node) => {
    let health = nodeHealth[node.data.kind] ?? 'healthy'
    let detail = nodeDetails[node.data.kind] ?? 'Healthy'

    if (
      criticalPathConnected &&
      !routedNodeIdSet.has(node.id) &&
      node.data.kind !== 'queue' &&
      node.data.kind !== 'region'
    ) {
      health = 'healthy'
      detail = 'Not on active path'
    } else if (
      fault === 'cache-outage' &&
      node.data.kind === 'cache' &&
      (replicaCounts.cache ?? routedCaches.length) > 1
    ) {
      health = node.id === faultedCacheId ? 'failed' : 'degraded'
      detail = node.id === faultedCacheId ? 'Unavailable' : detail
    }

    let faultRole: SystemFlowNode['data']['faultRole']
    let lostReplicas: number | undefined
    if (failedNodeIds.has(node.id)) {
      health = 'failed'
      detail = 'Instance offline'
      faultRole = 'source'
      lostReplicas = impact.lostReplicas
    } else if (degradedNodeIds.has(node.id)) {
      health = 'degraded'
      detail = 'One replica offline'
      faultRole = 'source'
      lostReplicas = impact.lostReplicas
    } else if (isolatedNodeIds.has(node.id)) {
      detail = 'No route'
      faultRole = 'isolated'
    } else if (affectedNodeIds.has(node.id)) {
      faultRole = 'affected'
    }

    return {
      ...node,
      data: {
        ...node.data,
        label: resolveLabel(node),
        health,
        detail: resolveDetail(detail),
        load,
        faultRole,
        lostReplicas,
      },
    }
  })
}

interface ProjectFaultEdgesInput {
  edges: SystemFlowEdge[]
  nodeHealthById: ReadonlyMap<string, ComponentHealth>
  impact: TargetedFaultImpact
  intensity: number
  paused: boolean
  resolveLabel?: (edge: SystemFlowEdge) => SystemFlowEdge['label']
}

export function projectFaultEdges({
  edges,
  nodeHealthById,
  impact,
  intensity,
  paused,
  resolveLabel = (edge) => edge.label,
}: ProjectFaultEdgesInput): SystemFlowEdge[] {
  const severedEdgeIds = new Set(impact.severedEdgeIds)
  const affectedEdgeIds = new Set(impact.affectedEdgeIds)

  return edges.map((edge) => {
    const severed = severedEdgeIds.has(edge.id)
    const affected = affectedEdgeIds.has(edge.id)
    const targetHealth = nodeHealthById.get(edge.target) ?? 'healthy'
    const targetFailed = targetHealth === 'failed'
    const baseLabel = edge.data !== undefined &&
      Object.prototype.hasOwnProperty.call(edge.data, 'baseLabel')
      ? edge.data.baseLabel
      : edge.label
    const baseEdge = { ...edge, label: baseLabel }
    return {
      ...edge,
      label: resolveLabel(baseEdge),
      data: {
        ...edge.data,
        baseLabel,
        tone: severed ? 'critical' : affected ? 'warning' : toneForHealth(targetHealth),
        intensity,
        paused: paused || severed || targetFailed,
        faultRole: severed ? 'source' : affected ? 'affected' : undefined,
      },
    }
  })
}
