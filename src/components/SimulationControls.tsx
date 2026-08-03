import { useState } from 'react'
import { Check, Plus, TrendingUp, Zap } from 'lucide-react'
import {
  COMPONENT_LABELS,
  FAULT_LABELS,
  type ComponentKind,
  type FaultMode,
} from '../domain/system'
import { COMPONENT_KINDS } from './ComponentDock'
import { StatefulIcon } from './icons/StatefulIcon'

interface SimulationControlsProps {
  load: 1 | 3 | 10
  fault: FaultMode
  onLoadChange: (load: 1 | 3 | 10) => void
  onFaultChange: (fault: FaultMode) => void
  onQuickAdd: (kind: ComponentKind) => void
  faults: readonly FaultMode[]
}

export function SimulationControls({
  load,
  fault,
  onLoadChange,
  onFaultChange,
  onQuickAdd,
  faults,
}: SimulationControlsProps) {
  const [faultMenuOpen, setFaultMenuOpen] = useState(false)
  const [componentMenuOpen, setComponentMenuOpen] = useState(false)

  return (
    <div className="simulation-controls">
      <button
        className={`mobile-control quick-add ${componentMenuOpen ? 'is-active' : ''}`}
        type="button"
        onClick={() => {
          setComponentMenuOpen((open) => !open)
          setFaultMenuOpen(false)
        }}
        aria-expanded={componentMenuOpen}
        aria-haspopup="menu"
        aria-controls="mobile-component-palette"
      >
        <Plus size={22} />
        <span>Add</span>
      </button>
      {componentMenuOpen && (
        <div
          id="mobile-component-palette"
          className="mobile-component-palette"
          role="menu"
          aria-label="Add a system component"
        >
          {COMPONENT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                onQuickAdd(kind)
                setComponentMenuOpen(false)
              }}
              role="menuitem"
              aria-label={`Add ${COMPONENT_LABELS[kind]}`}
            >
              <StatefulIcon
                kind={kind}
                health="healthy"
                size={24}
                decorative
              />
              <span>{COMPONENT_LABELS[kind]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="load-control">
        <div className="control-title">
          <TrendingUp size={17} />
          <span>Load</span>
        </div>
        <div className="load-segments" aria-label="Traffic multiplier">
          {([1, 3, 10] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={load === value ? 'is-active' : ''}
              onClick={() => onLoadChange(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
      <div className="fault-control">
        <button
          type="button"
          className={`fault-trigger ${fault !== 'none' ? 'is-active' : ''}`}
          onClick={() => {
            setFaultMenuOpen((open) => !open)
            setComponentMenuOpen(false)
          }}
          aria-expanded={faultMenuOpen}
        >
          <Zap size={20} fill={fault !== 'none' ? 'currentColor' : 'none'} />
          <span>Fault</span>
        </button>
        {faultMenuOpen && (
          <div className="fault-menu" role="menu">
            {faults.map((option) => (
              <button
                key={option}
                type="button"
                className={fault === option ? 'is-selected' : ''}
                onClick={() => {
                  onFaultChange(option)
                  setFaultMenuOpen(false)
                }}
                role="menuitem"
              >
                {FAULT_LABELS[option]}
                {fault === option && <Check size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
