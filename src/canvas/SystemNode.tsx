import { Handle, Position, type NodeProps } from '@xyflow/react'
import { StatefulIcon } from '../components/icons/StatefulIcon'
import type { SystemFlowNode } from './types'

export function SystemNode({ data, selected }: NodeProps<SystemFlowNode>) {
  const replicas = Math.max(1, Math.floor(data.replicas ?? 1))
  const shards = Math.max(1, Math.floor(data.shards ?? 1))
  return (
    <article
      className={`system-node health-${data.health} ${selected ? 'is-selected' : ''} ${replicas > 1 ? 'has-replicas' : ''}`}
      aria-label={`${data.label}, ${data.detail}`}
    >
      {replicas > 1 && <span className="node-replica-stack" aria-hidden="true" />}
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
      {(replicas > 1 || shards > 1) && (
        <span className="node-topology-badges" aria-label={`${replicas} replicas, ${shards} shards`}>
          {replicas > 1 && <b>{replicas}×</b>}
          {shards > 1 && <b>{shards}S</b>}
        </span>
      )}
      <Handle id="right" type="source" position={Position.Right} />
      <Handle id="bottom" type="source" position={Position.Bottom} />
    </article>
  )
}
