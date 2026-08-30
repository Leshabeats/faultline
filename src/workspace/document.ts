import type { SystemFlowEdge, SystemFlowNode } from '../canvas/types'
import type {
  CapacityTuning,
  FaultMode,
  FaultTarget,
  LoadMultiplier,
  ScenarioId,
} from '../domain/system'
import {
  WORKSPACE_SCHEMA,
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceDocumentV1,
  type WorkspaceEdgeV1,
  type WorkspaceNodeV1,
} from './types'

const workspaceNode = (node: SystemFlowNode): WorkspaceNodeV1 => ({
  id: node.id,
  type: 'system',
  position: { ...node.position },
  data: {
    kind: node.data.kind,
    label: node.data.label,
    ...(node.data.replicas === undefined ? {} : { replicas: node.data.replicas }),
    ...(node.data.shards === undefined ? {} : { shards: node.data.shards }),
    ...(node.data.notes ? { notes: node.data.notes } : {}),
  },
})

const workspaceEdge = (edge: SystemFlowEdge): WorkspaceEdgeV1 => {
  const canonicalLabel = typeof edge.data?.baseLabel === 'string'
    ? edge.data.baseLabel
    : edge.label
  const labelOffsetX = edge.data?.labelOffsetX
  const labelOffsetY = edge.data?.labelOffsetY
  return {
    id: edge.id,
    type: 'traffic',
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle === undefined ? {} : { sourceHandle: edge.sourceHandle }),
    ...(edge.targetHandle === undefined ? {} : { targetHandle: edge.targetHandle }),
    ...(typeof canonicalLabel === 'string' ? { label: canonicalLabel } : {}),
    ...(typeof labelOffsetX === 'number' && Number.isFinite(labelOffsetX) ? { labelOffsetX } : {}),
    ...(typeof labelOffsetY === 'number' && Number.isFinite(labelOffsetY) ? { labelOffsetY } : {}),
  }
}

export const workspaceNodesFromFlow = (nodes: SystemFlowNode[]) => nodes.map(workspaceNode)
export const workspaceEdgesFromFlow = (edges: SystemFlowEdge[]) => edges.map(workspaceEdge)

export const flowNodesFromWorkspace = (
  nodes: WorkspaceNodeV1[],
  load: LoadMultiplier,
): SystemFlowNode[] => nodes.map((node) => ({
  id: node.id,
  type: 'system',
  position: { ...node.position },
  data: {
    ...node.data,
    health: 'healthy',
    detail: 'Healthy',
    load,
  },
}))

export const flowEdgesFromWorkspace = (
  edges: WorkspaceEdgeV1[],
  load: LoadMultiplier,
): SystemFlowEdge[] => edges.map((edge) => ({
  ...edge,
  data: {
    tone: 'healthy',
    intensity: load,
    paused: false,
    ...(edge.labelOffsetX === undefined ? {} : { labelOffsetX: edge.labelOffsetX }),
    ...(edge.labelOffsetY === undefined ? {} : { labelOffsetY: edge.labelOffsetY }),
  },
}))

interface CreateWorkspaceDocumentInput {
  id: string
  title: string
  createdAt?: string
  simulationProfile: ScenarioId
  nodes: SystemFlowNode[]
  edges: SystemFlowEdge[]
  load: LoadMultiplier
  fault: FaultMode
  faultTarget: FaultTarget | null
  capacity: CapacityTuning
  now?: string
}

export function createWorkspaceDocument({
  id,
  title,
  createdAt,
  simulationProfile,
  nodes,
  edges,
  load,
  fault,
  faultTarget,
  capacity,
  now = new Date().toISOString(),
}: CreateWorkspaceDocumentInput): WorkspaceDocumentV1 {
  return {
    schema: WORKSPACE_SCHEMA,
    version: WORKSPACE_SCHEMA_VERSION,
    id,
    title: title.trim().slice(0, 80) || 'Untitled architecture',
    createdAt: createdAt ?? now,
    updatedAt: now,
    simulationProfile,
    architecture: {
      nodes: workspaceNodesFromFlow(nodes),
      edges: workspaceEdgesFromFlow(edges),
    },
    load,
    fault,
    ...(faultTarget ? { faultTarget: { ...faultTarget } } : {}),
    capacity: { ...capacity },
  }
}

export function workspaceFingerprint(input: Omit<CreateWorkspaceDocumentInput, 'id' | 'createdAt' | 'now'>): string {
  return JSON.stringify({
    title: input.title,
    simulationProfile: input.simulationProfile,
    architecture: {
      nodes: workspaceNodesFromFlow(input.nodes),
      edges: workspaceEdgesFromFlow(input.edges),
    },
    load: input.load,
    fault: input.fault,
    faultTarget: input.faultTarget,
    capacity: input.capacity,
  })
}
