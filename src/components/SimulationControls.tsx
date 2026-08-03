import { useState } from 'react'
import { Check, Plus, TrendingUp, Zap } from 'lucide-react'
import type { ComponentKind, FaultMode, LoadMultiplier, Locale } from '../domain/system'
import { UI_COPY, componentLabels, faultLabels } from '../i18n'
import { COMPONENT_KINDS } from './ComponentDock'
import { StatefulIcon } from './icons/StatefulIcon'

interface SimulationControlsProps {
  load: LoadMultiplier
  effectiveLoad: number
  fault: FaultMode
  locale: Locale
  onLoadChange: (load: LoadMultiplier) => void
  onFaultChange: (fault: FaultMode) => void
  onQuickAdd: (kind: ComponentKind) => void
  faults: readonly FaultMode[]
}

export function SimulationControls({
  load,
  effectiveLoad,
  fault,
  locale,
  onLoadChange,
  onFaultChange,
  onQuickAdd,
  faults,
}: SimulationControlsProps) {
  const [faultMenuOpen, setFaultMenuOpen] = useState(false)
  const [componentMenuOpen, setComponentMenuOpen] = useState(false)
  const text = UI_COPY[locale]
  const ramping = Math.abs(load - effectiveLoad) > 0.04

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
        <span>{text.add}</span>
      </button>
      {componentMenuOpen && (
        <div
          id="mobile-component-palette"
          className="mobile-component-palette"
          role="menu"
          aria-label={text.add}
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
              aria-label={`${text.add}: ${componentLabels[locale][kind]}`}
            >
              <StatefulIcon
                kind={kind}
                health="healthy"
                size={24}
                decorative
              />
              <span>{componentLabels[locale][kind]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="load-control">
        <div className="control-title">
          <TrendingUp size={17} />
          <span>{text.load}</span>
        </div>
        <div className="load-segments" aria-label={locale === 'ru' ? 'Множитель трафика' : 'Traffic multiplier'}>
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
        <span className={`load-ramp-readout ${ramping ? 'is-ramping' : ''}`} aria-live="polite">
          {ramping ? `${text.ramping}: ${effectiveLoad.toFixed(1)}× → ${load}×` : `${effectiveLoad.toFixed(1)}× ${text.live}`}
        </span>
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
          <span>{text.fault}</span>
        </button>
        {faultMenuOpen && (
          <div className="fault-menu" role="menu" aria-label={text.fault}>
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
                {faultLabels[locale][option]}
                {fault === option && <Check size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
