import type { ComponentKind } from '../domain/system'
import { StatefulIcon } from './icons/StatefulIcon'

export const COMPONENT_KINDS: ComponentKind[] = [
  'client',
  'gateway',
  'service',
  'cache',
  'queue',
  'database',
  'region',
]

interface ComponentDockProps {
  activeKind: ComponentKind
  onAdd: (kind: ComponentKind) => void
}

export function ComponentDock({ activeKind, onAdd }: ComponentDockProps) {
  return (
    <nav className="component-dock" aria-label="Add a system component">
      {COMPONENT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={activeKind === kind ? 'is-active' : ''}
          onClick={() => onAdd(kind)}
          aria-label={`Add ${kind}`}
          data-tooltip={kind}
        >
          <StatefulIcon
            kind={kind}
            health="healthy"
            size={25}
            decorative
          />
        </button>
      ))}
      <span className="dock-divider" />
      <button type="button" onClick={() => onAdd(activeKind)} aria-label="Add selected component">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M4 12h16" />
        </svg>
      </button>
    </nav>
  )
}
