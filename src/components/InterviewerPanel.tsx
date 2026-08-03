import type { FormEvent } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Lightbulb,
  List,
  LoaderCircle,
  Gauge,
  Send,
} from 'lucide-react'
import type { TimelineEvent } from '../domain/system'

interface InterviewerPanelProps {
  open: boolean
  providerLabel: string
  prompt: string
  feedback: string
  answer: string
  busy: boolean
  events: TimelineEvent[]
  onAnswerChange: (value: string) => void
  onSubmit: () => void
  onHint: () => void
  onReview: () => void
  onContinue: () => void
  onOpenCapacity: () => void
  onClose: () => void
}

export function InterviewerPanel({
  open,
  providerLabel,
  prompt,
  feedback,
  answer,
  busy,
  events,
  onAnswerChange,
  onSubmit,
  onHint,
  onReview,
  onContinue,
  onOpenCapacity,
  onClose,
}: InterviewerPanelProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <aside className={`interviewer-panel ${open ? 'is-open' : 'is-closed'}`}>
      <div className="sheet-handle" aria-hidden="true" />
      <header className="interviewer-header">
        <div>
          <strong>Interviewer</strong>
          <span>{providerLabel}</span>
        </div>
        <div className="panel-header-actions">
          <button type="button" onClick={onOpenCapacity} aria-label="Open bottleneck defense" title="Bottleneck Defense">
            <Gauge size={19} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close interviewer">
            <ChevronLeft size={21} />
          </button>
        </div>
      </header>
      <div className="interviewer-body">
        <h2>{prompt}</h2>
        {feedback && (
          <div className="interviewer-feedback" role="status">
            {feedback}
          </div>
        )}
        <form onSubmit={submit}>
          <textarea
            value={answer}
            onChange={(event) => onAnswerChange(event.target.value)}
            placeholder="Type your response…"
            aria-label="Your interview response"
          />
          <div className="interviewer-actions">
            <button type="button" className="secondary-action" onClick={onHint} disabled={busy}>
              <Lightbulb size={18} /> Hint
            </button>
            <button type="button" className="secondary-action" onClick={onReview} disabled={busy}>
              <BookOpen size={18} /> Review
            </button>
            <button
              type={answer.trim() ? 'submit' : 'button'}
              className="continue-action"
              onClick={answer.trim() ? undefined : onContinue}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
              <span>{answer.trim() ? 'Send' : 'Continue'}</span>
            </button>
          </div>
        </form>
        <details className="event-history" open>
          <summary>
            <span><List size={18} /> Event history</span>
            <span>{events.length} events <ChevronDown size={16} /></span>
          </summary>
          <ol>
            {events.slice(0, 5).map((event) => (
              <li key={event.id} className={`tone-${event.tone}`}>
                <i aria-hidden="true" />
                <time>{event.timestamp}</time>
                <span><strong>{event.title}</strong><small>{event.detail}</small></span>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </aside>
  )
}
