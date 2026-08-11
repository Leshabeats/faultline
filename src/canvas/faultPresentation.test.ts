import { describe, expect, it } from 'vitest'
import { computeSimulation } from '../simulation/engine'
import { analyzeTargetedFault } from '../simulation/faultImpact'
import { analyzeTopology } from '../simulation/topology'
import { newsFeedSeedEdges, newsFeedSeedNodes } from './newsFeedSeed'
import { seedEdges, seedNodes } from './seed'
import { projectFaultEdges, projectFaultNodes } from './faultPresentation'

describe('fault canvas presentation', () => {
  it('shows route isolation without presenting healthy components as offline', () => {
    const cacheOnlyEdges = seedEdges.filter((edge) => edge.id !== 'api-database')
    const baseTopology = analyzeTopology(seedNodes, cacheOnlyEdges)
    const impact = analyzeTargetedFault(
      seedNodes,
      cacheOnlyEdges,
      { type: 'node', id: 'cache' },
    )
    const simulation = computeSimulation({
      loadMultiplier: 1,
      fault: 'component-outage',
      tick: 0,
      componentCounts: impact.topology.componentCounts,
      replicaCounts: impact.topology.replicaCounts,
      criticalPathConnected: impact.topology.criticalPathConnected,
      faultImpact: impact.summary,
    })
    const nodes = projectFaultNodes({
      nodes: seedNodes,
      fault: 'component-outage',
      impact,
      routedNodeIds: baseTopology.routedNodeIds,
      criticalPathConnected: baseTopology.criticalPathConnected,
      replicaCounts: baseTopology.replicaCounts,
      nodeHealth: simulation.nodeHealth,
      nodeDetails: simulation.nodeDetails,
      load: 1,
    })

    expect(nodes.find(({ id }) => id === 'cache')?.data).toMatchObject({
      health: 'failed',
      detail: 'Instance offline',
      faultRole: 'source',
    })
    expect(nodes.find(({ id }) => id === 'api')?.data).toMatchObject({
      health: 'healthy',
      detail: 'No route',
      faultRole: 'isolated',
    })
    expect(nodes.find(({ id }) => id === 'database')?.data).toMatchObject({
      health: 'healthy',
      detail: 'No route',
      faultRole: 'isolated',
    })
  })

  it('restores the canonical edge label after a temporary partition label', () => {
    const partition = analyzeTargetedFault(
      newsFeedSeedNodes,
      newsFeedSeedEdges,
      { type: 'edge', id: 'feed-cache-store' },
    )
    const partitioned = projectFaultEdges({
      edges: newsFeedSeedEdges,
      nodeHealthById: new Map(),
      impact: partition,
      intensity: 10,
      paused: false,
      resolveLabel: (edge) => edge.id === 'feed-cache-store'
        ? 'Traffic stops at this boundary.'
        : edge.label,
    })
    const restored = projectFaultEdges({
      edges: partitioned,
      nodeHealthById: new Map(),
      impact: analyzeTargetedFault(newsFeedSeedNodes, newsFeedSeedEdges, null),
      intensity: 10,
      paused: false,
    })

    expect(partitioned.find(({ id }) => id === 'feed-cache-store')?.label)
      .toBe('Traffic stops at this boundary.')
    expect(restored.find(({ id }) => id === 'feed-cache-store')?.label)
      .toBe('read repair')
  })
})
