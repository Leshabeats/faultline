import type { Edge, Node } from '@xyflow/react'
import type { ReactNode } from 'react'
import type { SystemNodeData } from '../domain/system'

export interface SystemFlowNodeData extends SystemNodeData {
  faultRole?: 'source' | 'affected' | 'isolated'
  lostReplicas?: number
}

export type SystemFlowNode = Node<SystemFlowNodeData, 'system'>

export interface SystemEdgeData extends Record<string, unknown> {
  tone: 'healthy' | 'warning' | 'critical'
  intensity: number
  paused: boolean
  faultRole?: 'source' | 'affected'
  /** Canonical label retained while a fault temporarily overrides the view. */
  baseLabel?: ReactNode
}

export type SystemFlowEdge = Edge<SystemEdgeData, 'traffic'>
