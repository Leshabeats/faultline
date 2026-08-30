import { describe, expect, it } from 'vitest'
import { seedEdges, seedNodes } from '../canvas/seed'
import type { SystemFlowNode } from '../canvas/types'
import {
  alignDatabaseReplication,
  databaseReplicationMatches,
  databaseTopologyUpdates,
  routedDatabaseReadReplicas,
} from '../domain/topology'
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

  it('counts a reachable cache-aside replica without inventing a cache-to-database call', () => {
    const result = analyzeTopology([...seedNodes, cacheReplica], [
      ...seedEdges,
      {
        id: 'api-cache-replica',
        source: 'api',
        target: cacheReplica.id,
        type: 'traffic',
        data: { tone: 'healthy', intensity: 1, paused: false },
      },
    ])

    expect(result.componentCounts.cache).toBe(2)
    expect(result.routedNodeIds).toContain(cacheReplica.id)
  })

  it('keeps the direct database fallback when the cache path is removed', () => {
    const result = analyzeTopology(
      seedNodes,
      seedEdges.filter((edge) => edge.id !== 'api-cache'),
    )

    expect(result.criticalPathConnected).toBe(true)
    expect(result.routedNodeIds).not.toContain('cache')
    expect(result.componentCounts.database).toBe(1)
  })

  it('fails closed after the application-to-database route is removed', () => {
    const result = analyzeTopology(
      seedNodes,
      seedEdges.filter((edge) => edge.id !== 'api-database'),
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

  it('aligns every database node to the global read-replica policy', () => {
    const databases = seedNodes.map((node) => node.data.kind === 'database'
      ? { ...node, data: { ...node.data, replicas: 1 } }
      : node)
    const aligned = alignDatabaseReplication(databases, 2)

    expect(databaseReplicationMatches(aligned, 2)).toBe(true)
    expect(aligned.find((node) => node.data.kind === 'database')?.data.replicas).toBe(3)
    expect(databaseReplicationMatches(databases, 2)).toBe(false)
  })

  it('can scope a freeform database topology edit to one selected node', () => {
    const primary = seedNodes.find((node) => node.data.kind === 'database')!
    const analytics = {
      ...primary,
      id: 'analytics-database',
      data: { ...primary.data, replicas: 1, shards: 2 },
    }

    expect(databaseTopologyUpdates(
      [...seedNodes, analytics],
      analytics.id,
      { replicas: 2, shards: 4 },
      'selected',
    )).toEqual([{
      nodeId: analytics.id,
      replicas: 2,
      shards: 4,
    }])

    expect(databaseTopologyUpdates(
      [...seedNodes, analytics],
      analytics.id,
      { replicas: 2, shards: 4 },
      'all',
    )).toEqual([
      { nodeId: primary.id, replicas: 2, shards: 1 },
      { nodeId: analytics.id, replicas: 2, shards: 4 },
    ])
  })

  it('derives global capacity from the first routed database only', () => {
    const primary = seedNodes.find((node) => node.data.kind === 'database')!
    const analytics = {
      ...primary,
      id: 'analytics-database',
      data: { ...primary.data, replicas: 3 },
    }
    const nodes = [
      ...seedNodes.map((node) => node.id === primary.id
        ? { ...node, data: { ...node.data, replicas: 1 } }
        : node),
      analytics,
    ]

    expect(routedDatabaseReadReplicas(nodes, [primary.id])).toBe(0)
    expect(routedDatabaseReadReplicas(nodes, [analytics.id])).toBe(2)
    expect(routedDatabaseReadReplicas(nodes, [])).toBeUndefined()
  })
})
