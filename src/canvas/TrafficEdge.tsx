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
  selected,
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
  const faultClass = data?.faultRole ? `fault-${data.faultRole}` : ''
  const flowRatio = data?.flowRatio === undefined
    ? undefined
    : Math.min(1, Math.max(0, data.flowRatio))
  const flowStrength = flowRatio === undefined ? undefined : Math.sqrt(flowRatio)
  const labelOffsetX = data?.labelOffsetX ?? 0
  const labelOffsetY = data?.labelOffsetY ?? 0

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`traffic-edge-base tone-${tone} ${faultClass} ${selected ? 'is-selected' : ''}`}
      />
      <path
        d={edgePath}
        className={`traffic-edge-flow tone-${tone} ${data?.paused ? 'is-paused' : ''} ${faultClass} ${selected ? 'is-selected' : ''}`}
        style={{
          animationDuration: `${Math.max(0.58, 1.5 - (data?.intensity ?? 1) * 0.07)}s`,
          ...(flowStrength === undefined
            ? {}
            : {
                opacity: flowRatio === 0 ? 0 : 0.38 + flowStrength * 0.62,
                strokeWidth: 1.7 + flowStrength * (selected ? 3 : 1.9),
              }),
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <span
            className={`edge-label tone-${tone} ${id === 'api-database' ? 'is-branch-label' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX + labelOffsetX}px,${labelY - 22 + labelOffsetY}px)`,
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
