import { Activity, ArrowRight, Network, RotateCcw, X } from 'lucide-react'
import type { SystemFlowEdge, SystemFlowNode } from '../canvas/types'
import type { FaultMode, FaultTarget, Locale } from '../domain/system'
import { UI_COPY } from '../i18n'

interface ConnectionInspectorProps {
  edge: SystemFlowEdge | null
  nodes: SystemFlowNode[]
  locale: Locale
  fault: FaultMode
  faultTarget: FaultTarget | null
  onClose: () => void
  onFaultChange: (fault: FaultMode, target?: FaultTarget) => void
}

export function ConnectionInspector({
  edge,
  nodes,
  locale,
  fault,
  faultTarget,
  onClose,
  onFaultChange,
}: ConnectionInspectorProps) {
  if (!edge) return null

  const text = UI_COPY[locale]
  const source = nodes.find((node) => node.id === edge.source)?.data.label ?? edge.source
  const target = nodes.find((node) => node.id === edge.target)?.data.label ?? edge.target
  const partitioned = fault === 'network-partition' &&
    faultTarget?.type === 'edge' &&
    faultTarget.id === edge.id

  return (
    <aside className="component-inspector connection-inspector" aria-label={`${text.connection}: ${source} → ${target}`}>
      <header>
        <div>
          <span>{text.connection}</span>
          <strong>{source} <ArrowRight size={16} /> {target}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label={text.close}><X size={18} /></button>
      </header>

      <div className="connection-health">
        <span className={`health-pill ${partitioned ? 'health-failed' : ''}`}>
          <i /> {partitioned ? text.connectionPartitioned : text.connectionHealthy}
        </span>
      </div>

      <section className={`failure-director-card ${partitioned ? 'is-active' : ''}`}>
        <span className="inspector-kicker">
          {partitioned ? <Activity size={14} /> : <Network size={14} />}
          {text.failureDirector}
        </span>
        <button
          type="button"
          onClick={() => partitioned
            ? onFaultChange('none')
            : onFaultChange('network-partition', { type: 'edge', id: edge.id })}
        >
          {partitioned ? <RotateCcw size={15} /> : <Activity size={15} />}
          {partitioned ? text.restoreConnection : text.partitionConnection}
        </button>
      </section>
    </aside>
  )
}
