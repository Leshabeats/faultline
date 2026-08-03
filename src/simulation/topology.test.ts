import { describe, expect, it } from 'vitest'
import { seedEdges, seedNodes } from '../canvas/seed'
import type { SystemFlowNode } from '../canvas/types'
import { analyzeTopology } from './topology'

const cacheReplica: SystemFlowNode = {
  ...seedNodes.find((node) => node.data.kind === 'cache')!,
  id: 'cache-replica',
  position: { x: 0, y: 0 },
  data: {
    ...seedNodes.find((node) => node.data.kind === 'cache')!.data,
    label: 'Cache 2',
  },
}

describe('topology analysis', () => {
  it('ignores a disconnected replica when counting routed capacity', () => {
    const result = analyzeTopology([...seedNodes, cacheReplica], seedEdges)

    expect(result.criticalPathConnected).toBe(true)
    expect(result.componentCounts.cache).toBe(1)
    expect(result.routedNodeIds).not.toContain(cacheReplica.id)
  })

  it('counts a replica only when it completes a client-to-database path', () => {
    const result = analyzeTopology([...seedNodes, cacheReplica], [
      ...seedEdges,
      {
        id: 'api-cache-replica',
        source: 'api',
        target: cacheReplica.id,
        type: 'traffic',
        data: { tone: 'healthy', intensity: 1, paused: false },
      },
      {
        id: 'cache-replica-database',
        source: cacheReplica.id,
        target: 'database',
        type: 'traffic',
        data: { tone: 'healthy', intensity: 1, paused: false },
      },
    ])

    expect(result.componentCounts.cache).toBe(2)
    expect(result.routedNodeIds).toContain(cacheReplica.id)
  })

  it('fails closed after the final client-to-database route is removed', () => {
    const result = analyzeTopology(
      seedNodes,
      seedEdges.filter((edge) => edge.id !== 'cache-database'),
    )

    expect(result.criticalPathConnected).toBe(false)
    expect(result.componentCounts.database).toBeUndefined()
  })

  it('turns compact replica and shard controls into routed capacity', () => {
    const scaled = seedNodes.map((node) => {
      if (node.data.kind === 'cache') {
        return { ...node, data: { ...node.data, replicas: 3, shards: 2 } }
      }
      if (node.data.kind === 'database') {
        return { ...node, data: { ...node.data, replicas: 3, shards: 4 } }
      }
      return node
    })

    const result = analyzeTopology(scaled, seedEdges)

    expect(result.componentCounts.cache).toBe(6)
    expect(result.replicaCounts.cache).toBe(3)
    // Database read replicas are tracked by CapacityTuning; topology counts shards.
    expect(result.componentCounts.database).toBe(4)
    expect(result.replicaCounts.database).toBe(3)
  })
})
