import type { SystemFlowEdge, SystemFlowNode } from '../canvas/types'
import type { ComponentKind } from '../domain/system'

function walkGraph(starts: string[], adjacency: Map<string, string[]>) {
  const queue = [...starts]
  const visited = new Set(queue)
  while (queue.length) {
    const current = queue.shift()!
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return visited
}

export interface TopologyAnalysis {
  componentCounts: Partial<Record<ComponentKind, number>>
  criticalPathConnected: boolean
  routedNodeIds: string[]
}

export function analyzeTopology(
  nodes: SystemFlowNode[],
  edges: SystemFlowEdge[],
): TopologyAnalysis {
  const clients = nodes.filter((node) => node.data.kind === 'client').map((node) => node.id)
  const databases = nodes
    .filter((node) => node.data.kind === 'database')
    .map((node) => node.id)

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  edges.forEach((edge) => {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
  })

  const reachableFromClients = walkGraph(clients, outgoing)
  const canReachDatabase = walkGraph(databases, incoming)
  const routedNodeIds = [...reachableFromClients]
    .filter((nodeId) => canReachDatabase.has(nodeId))
    .sort()
  const routedNodeIdSet = new Set(routedNodeIds)
  const componentCounts = nodes.reduce<Partial<Record<ComponentKind, number>>>(
    (counts, node) => {
      if (routedNodeIdSet.has(node.id)) {
        counts[node.data.kind] = (counts[node.data.kind] ?? 0) + 1
      }
      return counts
    },
    {},
  )

  return {
    componentCounts,
    criticalPathConnected: databases.some((databaseId) =>
      reachableFromClients.has(databaseId),
    ),
    routedNodeIds,
  }
}
