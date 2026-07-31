import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import type { SystemFlowEdge } from './types'

export function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
  markerEnd,
}: EdgeProps<SystemFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.28,
  })
  const tone = data?.tone ?? 'healthy'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`traffic-edge-base tone-${tone}`}
      />
      <path
        d={edgePath}
        className={`traffic-edge-flow tone-${tone} ${data?.paused ? 'is-paused' : ''}`}
        style={{
          animationDuration: `${Math.max(0.58, 1.5 - (data?.intensity ?? 1) * 0.07)}s`,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <span
            className={`edge-label tone-${tone}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 22}px)`,
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
