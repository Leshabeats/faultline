import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'
import { seedEdges, seedNodes } from '../canvas/seed'
import { computeSimulation } from '../simulation/engine'
import { analyzeTargetedFault } from '../simulation/faultImpact'
import { createWorkspaceDocument, flowEdgesFromWorkspace, flowNodesFromWorkspace } from './document'
import { createWorkspaceTelemetry } from './telemetry'

describe('workspace telemetry', () => {
  it('starts from the loaded document simulation instead of prior app history', () => {
    const document = createWorkspaceDocument({
      id: 'loaded-workspace',
      title: 'Loaded workspace',
      simulationProfile: 'url-shortener',
      nodes: seedNodes,
      edges: seedEdges,
      load: 10,
      fault: 'slow-database',
      faultTarget: null,
      capacity: DEFAULT_CAPACITY_TUNING,
      now: '2026-08-30T12:00:00.000Z',
    })
    const nodes = flowNodesFromWorkspace(document.architecture.nodes, document.load)
    const edges = flowEdgesFromWorkspace(document.architecture.edges, document.load)
    const impact = analyzeTargetedFault(nodes, edges, null)
    const expected = computeSimulation({
      scenario: document.simulationProfile,
      loadMultiplier: document.load,
      fault: document.fault,
      tick: 0,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      componentCounts: impact.topology.componentCounts,
      replicaCounts: impact.topology.replicaCounts,
      criticalPathConnected: impact.topology.criticalPathConnected,
      capacity: document.capacity,
    })

    const history = createWorkspaceTelemetry(document)

    expect(history).toHaveLength(22)
    expect(history[0].tick).toBe(-21)
    expect(history[history.length - 1]).toEqual({ tick: 0, ...expected.metrics })
  })
})
