import type { ComponentKind, FaultTarget, SimulationFaultImpact } from '../domain/system'
import { normalizeNodeTopology, type TopologyAnalysis, type TopologyEdge, type TopologyNode } from '../domain/topology'
import { analyzeTopology } from './topology'

interface FaultEdge extends TopologyEdge {
  id: string
}

export interface TargetedFaultImpact {
  target: FaultTarget | null
  topology: TopologyAnalysis
  failedNodeIds: string[]
  degradedNodeIds: string[]
  isolatedNodeIds: string[]
  affectedNodeIds: string[]
  affectedEdgeIds: string[]
  severedEdgeIds: string[]
  traceNodeIds: string[]
  lostReplicas: number
  summary?: SimulationFaultImpact
}

const downstreamFrom = <Edge extends FaultEdge>(start: string, edges: readonly Edge[]) => {
  const outgoing = new Map<string, Array<{ nodeId: string; edgeId: string }>>()
  edges.forEach((edge) => {
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      { nodeId: edge.target, edgeId: edge.id },
    ])
  })
  const nodeIds: string[] = []
  const edgeIds: string[] = []
  const queue = [start]
  const visited = new Set(queue)
  while (queue.length) {
    const current = queue.shift()!
    for (const next of outgoing.get(current) ?? []) {
      edgeIds.push(next.edgeId)
      if (!visited.has(next.nodeId)) {
        visited.add(next.nodeId)
        nodeIds.push(next.nodeId)
        queue.push(next.nodeId)
      }
    }
  }
  return { nodeIds, edgeIds: [...new Set(edgeIds)] }
}

const tracePathFrom = <Node extends TopologyNode, Edge extends FaultEdge>(
  start: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
) => {
  const databaseIds = new Set(
    nodes.filter((node) => node.data.kind === 'database').map((node) => node.id),
  )
  const outgoing = new Map<string, string[]>()
  edges.forEach((edge) => {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  })
  const queue: string[][] = [[start]]
  const visited = new Set([start])
  while (queue.length) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    if (databaseIds.has(current)) return path.slice(0, 4)
    for (const next of outgoing.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push([...path, next])
      }
    }
  }

  const fallback = [start]
  while (fallback.length < 4) {
    const next = (outgoing.get(fallback[fallback.length - 1]) ?? [])
      .find((candidate) => !fallback.includes(candidate))
    if (!next) break
    fallback.push(next)
  }
  return fallback
}

export function analyzeTargetedFault<
  Node extends TopologyNode,
  Edge extends FaultEdge,
>(
  nodes: readonly Node[],
  edges: readonly Edge[],
  target: FaultTarget | null,
): TargetedFaultImpact {
  const base = analyzeTopology(nodes, edges)
  const empty = {
    target,
    topology: base,
    failedNodeIds: [],
    degradedNodeIds: [],
    isolatedNodeIds: [],
    affectedNodeIds: [],
    affectedEdgeIds: [],
    severedEdgeIds: [],
    traceNodeIds: [],
    lostReplicas: 0,
  }
  if (!target) return empty

  if (target.type === 'edge') {
    const edge = edges.find((candidate) => candidate.id === target.id)
    if (!edge) return { ...empty, target: null }
    const remainingEdges = edges.filter((candidate) => candidate.id !== target.id)
    const topology = analyzeTopology(nodes, remainingEdges)
    const downstream = downstreamFrom(edge.target, edges)
    const isolatedNodeIds = base.routedNodeIds.filter(
      (id) => !topology.routedNodeIds.includes(id),
    )
    return {
      ...empty,
      topology,
      isolatedNodeIds,
      affectedNodeIds: [edge.target, ...downstream.nodeIds],
      affectedEdgeIds: downstream.edgeIds,
      severedEdgeIds: [edge.id],
      traceNodeIds: [
        edge.source,
        ...tracePathFrom(edge.target, nodes, edges),
      ].filter((id, index, path) => path.indexOf(id) === index).slice(0, 4),
      summary: {
        targetType: 'edge',
        remainingReplicas: 0,
        routeDisconnected: base.criticalPathConnected && !topology.criticalPathConnected,
      },
    }
  }

  const node = nodes.find((candidate) => candidate.id === target.id)
  if (!node) return { ...empty, target: null }
  const topology = normalizeNodeTopology(node.data.kind, node.data)
  const remainingReplicas = Math.max(0, topology.replicas - 1)
  const failed = remainingReplicas === 0
  const effectiveNodes = failed
    ? nodes.filter((candidate) => candidate.id !== node.id)
    : nodes.map((candidate) => candidate.id === node.id
      ? { ...candidate, data: { ...candidate.data, replicas: remainingReplicas } }
      : candidate) as Node[]
  const effectiveEdges = failed
    ? edges.filter((edge) => edge.source !== node.id && edge.target !== node.id)
    : [...edges]
  const effectiveTopology = analyzeTopology(effectiveNodes, effectiveEdges)
  const downstream = downstreamFrom(node.id, edges)
  const isolatedNodeIds = base.routedNodeIds.filter(
    (id) => !effectiveTopology.routedNodeIds.includes(id) && id !== node.id,
  )

  return {
    ...empty,
    topology: effectiveTopology,
    failedNodeIds: failed ? [node.id] : [],
    degradedNodeIds: failed ? [] : [node.id],
    isolatedNodeIds,
    affectedNodeIds: downstream.nodeIds,
    affectedEdgeIds: downstream.edgeIds,
    traceNodeIds: tracePathFrom(node.id, nodes, edges),
    lostReplicas: 1,
    summary: {
      targetType: 'node',
      componentKind: node.data.kind as ComponentKind,
      remainingReplicas,
      routeDisconnected: base.criticalPathConnected && !effectiveTopology.criticalPathConnected,
    },
  }
}
