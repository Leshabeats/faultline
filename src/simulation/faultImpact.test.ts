import { describe, expect, it } from 'vitest'
import type { TopologyEdge, TopologyNode } from '../domain/topology'
import { analyzeTargetedFault } from './faultImpact'

type Node = TopologyNode
type Edge = TopologyEdge & { id: string }

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target })
const node = (id: string, kind: Node['data']['kind'], replicas = 1): Node => ({
  id,
  data: { kind, replicas },
})

describe('targeted fault impact', () => {
  it('takes one replica offline without removing the logical node', () => {
    const nodes = [
      node('client', 'client'),
      node('cache', 'cache', 3),
      node('database', 'database'),
    ]
    const edges = [edge('client-cache', 'client', 'cache'), edge('cache-db', 'cache', 'database')]

    const impact = analyzeTargetedFault(nodes, edges, { type: 'node', id: 'cache' })

    expect(impact.topology.criticalPathConnected).toBe(true)
    expect(impact.topology.replicaCounts.cache).toBe(2)
    expect(impact.degradedNodeIds).toEqual(['cache'])
    expect(impact.failedNodeIds).toEqual([])
    expect(impact.summary).toMatchObject({ remainingReplicas: 2, routeDisconnected: false })
    expect(impact.traceNodeIds).toEqual(['cache', 'database'])
  })

  it('disconnects the route when the last required instance fails', () => {
    const nodes = [node('client', 'client'), node('api', 'service'), node('db', 'database')]
    const edges = [edge('client-api', 'client', 'api'), edge('api-db', 'api', 'db')]

    const impact = analyzeTargetedFault(nodes, edges, { type: 'node', id: 'api' })

    expect(impact.topology.criticalPathConnected).toBe(false)
    expect(impact.failedNodeIds).toEqual(['api'])
    expect(impact.isolatedNodeIds).toContain('db')
    expect(impact.summary).toMatchObject({ remainingReplicas: 0, routeDisconnected: true })
    expect(impact.traceNodeIds).toEqual(['api', 'db'])
  })

  it('keeps serving through the database fallback when the cache fails', () => {
    const nodes = [
      node('client', 'client'),
      node('api', 'service'),
      node('cache', 'cache'),
      node('db', 'database'),
    ]
    const edges = [
      edge('client-api', 'client', 'api'),
      edge('api-cache', 'api', 'cache'),
      edge('api-db', 'api', 'db'),
    ]

    const impact = analyzeTargetedFault(nodes, edges, { type: 'node', id: 'cache' })

    expect(impact.failedNodeIds).toEqual(['cache'])
    expect(impact.isolatedNodeIds).toEqual([])
    expect(impact.topology.criticalPathConnected).toBe(true)
    expect(impact.topology.routedNodeIds).toEqual(['api', 'client', 'db'])
    expect(impact.summary).toMatchObject({
      componentKind: 'cache',
      remainingReplicas: 0,
      routeDisconnected: false,
    })
    expect(impact.affectedNodeIds).toEqual(['api', 'db'])
    expect(impact.affectedEdgeIds).toEqual(['api-db'])
    expect(impact.traceNodeIds).toEqual(['cache', 'api', 'db'])
  })

  it('partitions one edge while preserving an alternate route', () => {
    const nodes = [
      node('client', 'client'),
      node('api-a', 'service'),
      node('api-b', 'service'),
      node('db', 'database'),
    ]
    const edges = [
      edge('client-a', 'client', 'api-a'),
      edge('a-db', 'api-a', 'db'),
      edge('client-b', 'client', 'api-b'),
      edge('b-db', 'api-b', 'db'),
    ]

    const impact = analyzeTargetedFault(nodes, edges, { type: 'edge', id: 'a-db' })

    expect(impact.topology.criticalPathConnected).toBe(true)
    expect(impact.topology.componentCounts.service).toBe(1)
    expect(impact.severedEdgeIds).toEqual(['a-db'])
    expect(impact.summary?.routeDisconnected).toBe(false)
  })
})
