import { Activity, RotateCcw } from 'lucide-react'
import type { SystemFlowNode } from '../canvas/types'
import type { Locale } from '../domain/system'
import { UI_COPY } from '../i18n'
import type { TargetedFaultImpact } from '../simulation/faultImpact'

interface BlastRadiusPanelProps {
  impact: TargetedFaultImpact
  nodes: SystemFlowNode[]
  locale: Locale
  readOnly: boolean
  onRestore: () => void
}

export function BlastRadiusPanel({
  impact,
  nodes,
  locale,
  readOnly,
  onRestore,
}: BlastRadiusPanelProps) {
  if (!impact.target) return null

  const text = UI_COPY[locale]
  const nodeLabels = new Map(nodes.map((node) => [node.id, node.data.label]))
  const affectedCount = new Set([
    ...impact.failedNodeIds,
    ...impact.degradedNodeIds,
    ...impact.isolatedNodeIds,
    ...impact.affectedNodeIds,
  ]).size

  return (
    <aside className="blast-radius-panel" aria-label={text.blastRadius}>
      <div className="blast-radius-summary">
        <span><Activity size={13} /> {text.blastRadius}</span>
        <strong>{affectedCount} {text.affectedComponents}</strong>
      </div>
      {impact.traceNodeIds.length > 0 && (
        <div className="causal-path">
          <span>{text.causalPath}</span>
          <div>
            {impact.traceNodeIds.map((nodeId, index) => (
              <span key={nodeId}>
                {index > 0 && <i aria-hidden="true">→</i>}
                <b>{nodeLabels.get(nodeId) ?? nodeId}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {!readOnly && (
        <button type="button" onClick={onRestore}>
          <RotateCcw size={13} />
          {impact.target.type === 'edge' ? text.restoreConnection : text.restoreComponent}
        </button>
      )}
    </aside>
  )
}
