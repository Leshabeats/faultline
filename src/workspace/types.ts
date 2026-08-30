import type {
  CapacityTuning,
  ComponentKind,
  FaultMode,
  FaultTarget,
  LoadMultiplier,
  ScenarioId,
} from '../domain/system'

export const WORKSPACE_SCHEMA = 'faultline.workspace' as const
export const WORKSPACE_SCHEMA_VERSION = 1 as const

export type AppMode = 'interview' | 'workspace'
export type WorkspaceExportFormat = 'png' | 'svg' | 'markdown' | 'json'

export interface WorkspaceNodeV1 {
  id: string
  type: 'system'
  position: { x: number; y: number }
  data: {
    kind: ComponentKind
    label: string
    replicas?: number
    shards?: number
    notes?: string
  }
}

export interface WorkspaceEdgeV1 {
  id: string
  type: 'traffic'
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
  labelOffsetX?: number
  labelOffsetY?: number
}

export interface WorkspaceDocumentV1 {
  schema: typeof WORKSPACE_SCHEMA
  version: typeof WORKSPACE_SCHEMA_VERSION
  id: string
  title: string
  createdAt: string
  updatedAt: string
  simulationProfile: ScenarioId
  architecture: {
    nodes: WorkspaceNodeV1[]
    edges: WorkspaceEdgeV1[]
  }
  load: LoadMultiplier
  fault: FaultMode
  faultTarget?: FaultTarget
  capacity: CapacityTuning
}

export interface WorkspaceExportContext {
  locale: 'en' | 'ru'
  modelLabel: string
  metrics: {
    throughput: string
    p99: string
    errors: string
  }
  monthlyCost: number
  assumptions: string[]
}
