import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

export interface ReplayTimelineEvent {
  id: string
  atMs: number
  title: string
  detail: string
  tone: 'neutral' | 'healthy' | 'warning' | 'critical'
}

interface ReplayTimelineProps {
  cursorMs: number
  durationMs: number
  playing: boolean
  speed: number
  events: ReplayTimelineEvent[]
  activeEvent: ReplayTimelineEvent | null
  metrics: {
    throughput: string
    p99: string
    errors: string
    dbCpu: string
  }
  metricLabels?: {
    throughput: string
    p99: string
    errors: string
    dbCpu: string
  }
  onCursorChange: (cursorMs: number) => void
  onTogglePlaying: () => void
  onPreviousEvent: () => void
  onNextEvent: () => void
  onSpeedChange: (speed: number) => void
}

const formatDuration = (valueMs: number) => {
  const totalSeconds = Math.floor(valueMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function ReplayTimeline({
  cursorMs,
  durationMs,
  playing,
  speed,
  events,
  activeEvent,
  metrics,
  metricLabels = {
    throughput: 'Throughput',
    p99: 'p99',
    errors: 'Errors',
    dbCpu: 'DB CPU',
  },
  onCursorChange,
  onTogglePlaying,
  onPreviousEvent,
  onNextEvent,
  onSpeedChange,
}: ReplayTimelineProps) {
  const safeDuration = Math.max(durationMs, 1)

  return (
    <section className="replay-timeline" aria-label="Attempt replay timeline">
      <div className="replay-timeline-summary">
        <div className="replay-active-event" aria-live="polite">
          <i className={`tone-${activeEvent?.tone ?? 'neutral'}`} aria-hidden="true" />
          <span>
            <strong>{activeEvent?.title ?? 'Attempt started'}</strong>
            <small>{activeEvent?.detail ?? 'System at initial state'}</small>
          </span>
        </div>
        <dl className="replay-metrics">
          <div><dt>{metricLabels.throughput}</dt><dd>{metrics.throughput}</dd></div>
          <div><dt>{metricLabels.p99}</dt><dd>{metrics.p99}</dd></div>
          <div><dt>{metricLabels.errors}</dt><dd>{metrics.errors}</dd></div>
          <div><dt>{metricLabels.dbCpu}</dt><dd>{metrics.dbCpu}</dd></div>
        </dl>
      </div>

      <div className="replay-transport">
        <div className="replay-step-controls">
          <button type="button" onClick={onPreviousEvent} aria-label="Previous replay event">
            <ChevronLeft size={18} />
          </button>
          <button
            className="replay-play-button"
            type="button"
            onClick={onTogglePlaying}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
          >
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
          <button type="button" onClick={onNextEvent} aria-label="Next replay event">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="replay-track-wrap">
          <div className="replay-event-markers" aria-hidden="true">
            {events.map((event) => (
              <i
                key={event.id}
                className={`tone-${event.tone} ${event.atMs <= cursorMs ? 'is-past' : ''}`}
                style={{ left: `${Math.min(100, Math.max(0, (event.atMs / safeDuration) * 100))}%` }}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={100}
            value={Math.min(cursorMs, safeDuration)}
            onChange={(event) => onCursorChange(Number(event.target.value))}
            aria-label="Replay position"
            style={{ '--replay-progress': `${(Math.min(cursorMs, safeDuration) / safeDuration) * 100}%` } as React.CSSProperties}
          />
        </div>

        <time className="replay-time">
          {formatDuration(cursorMs)} <span>/ {formatDuration(durationMs)}</span>
        </time>
        <label className="replay-speed">
          <span className="screen-reader-status">Replay speed</span>
          <select value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
      </div>
    </section>
  )
}
