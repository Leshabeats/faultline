import type { Edge, Node } from '@xyflow/react'
import type { SystemNodeData } from '../domain/system'

export type SystemFlowNode = Node<SystemNodeData, 'system'>

export interface SystemEdgeData extends Record<string, unknown> {
  tone: 'healthy' | 'warning' | 'critical'
  intensity: number
  paused: boolean
  faultRole?: 'source' | 'affected'
}

export type SystemFlowEdge = Edge<SystemEdgeData, 'traffic'>
