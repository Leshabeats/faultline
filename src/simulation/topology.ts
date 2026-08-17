import {
  normalizeNodeTopology,
  type TopologyAnalysis,
  type TopologyEdge,
  type TopologyNode,
} from '../domain/topology'

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

export function analyzeTopology<
  Node extends TopologyNode,
  Edge extends TopologyEdge,
>(
  nodes: readonly Node[],
  edges: readonly Edge[],
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
  const databasePathNodeIds = new Set(
    [...reachableFromClients].filter((nodeId) => canReachDatabase.has(nodeId)),
  )
  // A cache-aside lookup is an optional branch owned by an application that
  // remains on the source-of-truth path. Redis does not need a fake edge to the
  // database to contribute serving capacity.
  const optionalCacheIds = nodes
    .filter((node) => node.data.kind === 'cache' && reachableFromClients.has(node.id))
    .filter((node) => (incoming.get(node.id) ?? []).some((id) => databasePathNodeIds.has(id)))
    .map((node) => node.id)
  const routedNodeIds = [...new Set([...databasePathNodeIds, ...optionalCacheIds])].sort()
  const routedNodeIdSet = new Set(routedNodeIds)
  const replicaCounts: TopologyAnalysis['replicaCounts'] = {}
  const componentCounts = nodes.reduce<TopologyAnalysis['componentCounts']>(
    (counts, node) => {
      if (routedNodeIdSet.has(node.id)) {
        const { replicas, shards } = normalizeNodeTopology(node.data.kind, node.data)
        replicaCounts[node.data.kind] = (replicaCounts[node.data.kind] ?? 0) + replicas
        // Database replicas are modelled separately as read replicas in the
        // capacity tuning. Database nodes contribute their shard count here;
        // stateless/cache nodes contribute every serving instance.
        const instances = node.data.kind === 'database'
          ? shards
          : node.data.kind === 'cache'
            ? replicas * shards
            : replicas
        counts[node.data.kind] = (counts[node.data.kind] ?? 0) + instances
      }
      return counts
    },
    {},
  )

  return {
    componentCounts,
    replicaCounts,
    criticalPathConnected: databases.some((databaseId) =>
      reachableFromClients.has(databaseId),
    ),
    routedNodeIds,
  }
}
