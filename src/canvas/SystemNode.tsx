import { Handle, Position, type NodeProps } from '@xyflow/react'
import { StatefulIcon } from '../components/icons/StatefulIcon'
import type { SystemFlowNode } from './types'

export function SystemNode({ data, selected }: NodeProps<SystemFlowNode>) {
  return (
    <article
      className={`system-node health-${data.health} ${selected ? 'is-selected' : ''}`}
      aria-label={`${data.label}, ${data.detail}`}
    >
      <Handle id="left" type="target" position={Position.Left} />
      <Handle id="top" type="target" position={Position.Top} />
      <div className="system-node-icon">
        <StatefulIcon kind={data.kind} health={data.health} size={58} />
      </div>
      <strong>{data.label}</strong>
      <span className="system-node-status">
        <i aria-hidden="true" />
        {data.detail}
      </span>
      <Handle id="right" type="source" position={Position.Right} />
      <Handle id="bottom" type="source" position={Position.Bottom} />
    </article>
  )
}
