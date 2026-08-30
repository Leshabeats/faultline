import type { TelemetryPoint } from '../domain/system'
import { computeSimulation } from '../simulation/engine'
import { analyzeTargetedFault } from '../simulation/faultImpact'
import { flowEdgesFromWorkspace, flowNodesFromWorkspace } from './document'
import type { WorkspaceDocumentV1 } from './types'

export function createWorkspaceTelemetry(
  document: WorkspaceDocumentV1,
  length = 22,
): TelemetryPoint[] {
  const nodes = flowNodesFromWorkspace(document.architecture.nodes, document.load)
  const edges = flowEdgesFromWorkspace(document.architecture.edges, document.load)
  const impact = analyzeTargetedFault(
    nodes,
    edges,
    document.fault === 'none' ? null : document.faultTarget ?? null,
  )

  return Array.from({ length }, (_, index) => {
    const tick = index - length + 1
    const snapshot = computeSimulation({
      scenario: document.simulationProfile,
      loadMultiplier: document.load,
      fault: document.fault,
      tick,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      componentCounts: impact.topology.componentCounts,
      replicaCounts: impact.topology.replicaCounts,
      criticalPathConnected: impact.topology.criticalPathConnected,
      faultImpact: impact.summary,
      capacity: document.capacity,
    })
    return { tick, ...snapshot.metrics }
  })
}
