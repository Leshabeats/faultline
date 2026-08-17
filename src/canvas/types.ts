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
  /** Fraction of the offered traffic currently using this path (0..1). */
  flowRatio?: number
  /** Keeps a branch label visually attached to a routed path instead of a node. */
  labelOffsetX?: number
  labelOffsetY?: number
  faultRole?: 'source' | 'affected'
  /** Canonical label retained while a fault temporarily overrides the view. */
  baseLabel?: ReactNode
}

export type SystemFlowEdge = Edge<SystemEdgeData, 'traffic'>
