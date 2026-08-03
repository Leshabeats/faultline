import { Check, CircleX, Download, List } from 'lucide-react'
import type { ReplayTimelineEvent } from './ReplayTimeline'

interface ReplayPanelProps {
  score?: number
  passed?: boolean
  keyMoment: string
  events: ReplayTimelineEvent[]
  cursorMs: number
  activeEventId?: string
  onSeek: (cursorMs: number) => void
  onExport: () => void
}

const formatDuration = (valueMs: number) => {
  const totalSeconds = Math.floor(valueMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function ReplayPanel({
  score,
  passed,
  keyMoment,
  events,
  cursorMs,
  activeEventId,
  onSeek,
  onExport,
}: ReplayPanelProps) {
  return (
    <aside className="replay-panel" aria-label="Attempt replay summary">
      <header className="replay-panel-header">
        <div>
          <strong>Attempt replay</strong>
          <span>Read-only playback</span>
        </div>
        <button type="button" onClick={onExport} aria-label="Export replay">
          <Download size={18} />
        </button>
      </header>
      <div className="replay-panel-body">
        <section className="replay-score">
          <span>{score === undefined ? 'Imported snapshot' : 'Final score'}</span>
          <div>
            <strong>{score ?? '—'}</strong>
            <span className={score === undefined ? 'is-snapshot' : passed ? 'is-passed' : 'is-failed'}>
              {score === undefined ? null : passed ? <Check size={20} /> : <CircleX size={20} />}
              {score === undefined ? 'Not submitted' : passed ? 'Passed' : 'Needs work'}
            </span>
          </div>
        </section>

        <section className="replay-key-moment">
          <span>Key moment</span>
          <p><i aria-hidden="true" /> {keyMoment}</p>
        </section>

        <section className="replay-event-list">
          <header><List size={17} /> Event timeline</header>
          <ol>
            {events.map((event) => (
              <li
                key={event.id}
                className={`${event.id === activeEventId ? 'is-active' : ''} ${event.atMs <= cursorMs ? 'is-past' : ''}`}
              >
                <button
                  type="button"
                  aria-current={event.id === activeEventId ? 'step' : undefined}
                  onClick={() => onSeek(event.atMs)}
                >
                  <i className={`tone-${event.tone}`} aria-hidden="true" />
                  <time>{formatDuration(event.atMs)}</time>
                  <span><strong>{event.title}</strong><small>{event.detail}</small></span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </aside>
  )
}
