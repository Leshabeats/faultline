import type { ComponentKind, Locale } from '../domain/system'
import { UI_COPY, componentLabels } from '../i18n'
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
  locale: Locale
}

export function ComponentDock({ activeKind, onAdd, locale }: ComponentDockProps) {
  return (
    <nav className="component-dock" aria-label={UI_COPY[locale].add}>
      {COMPONENT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={activeKind === kind ? 'is-active' : ''}
          onClick={() => onAdd(kind)}
          aria-label={`${UI_COPY[locale].add}: ${componentLabels[locale][kind]}`}
          data-tooltip={componentLabels[locale][kind]}
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
      <button type="button" onClick={() => onAdd(activeKind)} aria-label={UI_COPY[locale].add}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M4 12h16" />
        </svg>
      </button>
    </nav>
  )
}
