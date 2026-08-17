import { Check, CircleX, Download, Globe, List, Trash2 } from 'lucide-react'
import type { ReplayTimelineEvent } from './ReplayTimeline'
import type { Locale } from '../domain/system'

interface ReplayPanelProps {
  locale: Locale
  score?: number
  passed?: boolean
  keyMoment: string
  events: ReplayTimelineEvent[]
  cursorMs: number
  activeEventId?: string
  onSeek: (cursorMs: number) => void
  onExport: () => void
  onPublish?: () => void
  publishedUrl?: string
  publicMode?: boolean
  scoreDisclaimer?: string
  onDeletePublication?: () => void
  deletingPublication?: boolean
  deleteError?: string
}

const formatDuration = (valueMs: number) => {
  const totalSeconds = Math.floor(valueMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function ReplayPanel({
  locale,
  score,
  passed,
  keyMoment,
  events,
  cursorMs,
  activeEventId,
  onSeek,
  onExport,
  onPublish,
  publishedUrl,
  publicMode = false,
  scoreDisclaimer,
  onDeletePublication,
  deletingPublication = false,
  deleteError,
}: ReplayPanelProps) {
  const ru = locale === 'ru'
  return (
    <aside className="replay-panel" aria-label={ru ? 'Сводка повтора попытки' : 'Attempt replay summary'}>
      <header className="replay-panel-header">
        <div>
          <strong>{publicMode
            ? ru ? 'Публичный повтор' : 'Public replay'
            : ru ? 'Повтор попытки' : 'Attempt replay'}</strong>
          <span>{publicMode
            ? ru ? 'Только просмотр по ссылке' : 'Read-only shared attempt'
            : ru ? 'Воспроизведение без изменений' : 'Read-only playback'}</span>
        </div>
        {!publicMode && (
          <button type="button" onClick={onExport} aria-label={ru ? 'Экспортировать повтор' : 'Export replay'}>
            <Download size={18} />
          </button>
        )}
      </header>
      <div className="replay-panel-body">
        <section className="replay-score">
          <span>{score === undefined
            ? ru ? 'Импортированный снимок' : 'Imported snapshot'
            : ru ? 'Итоговая оценка' : 'Final score'}</span>
          <div>
            <strong>{score ?? '—'}</strong>
            <span className={score === undefined ? 'is-snapshot' : passed ? 'is-passed' : 'is-failed'}>
              {score === undefined ? null : passed ? <Check size={20} /> : <CircleX size={20} />}
              {score === undefined
                ? ru ? 'Не отправлено' : 'Not submitted'
                : passed
                  ? ru ? 'Пройдено' : 'Passed'
                  : ru ? 'Нужно улучшить' : 'Needs work'}
            </span>
          </div>
          {scoreDisclaimer && <p className="replay-score-disclaimer">{scoreDisclaimer}</p>}
        </section>

        {!publicMode && onPublish && (
          <section className="replay-publish">
            <button type="button" onClick={onPublish}>
              <Globe size={16} />
              {publishedUrl
                ? ru ? 'Управление ссылкой' : 'Manage public link'
                : ru ? 'Опубликовать повтор' : 'Publish replay'}
            </button>
            {publishedUrl && <small>{publishedUrl}</small>}
          </section>
        )}

        {publicMode && onDeletePublication && (
          <section className="replay-publish">
            <button type="button" onClick={onDeletePublication} disabled={deletingPublication}>
              <Trash2 size={16} />
              {deletingPublication
                ? ru ? 'Удаление…' : 'Removing…'
                : ru ? 'Удалить публикацию' : 'Unpublish replay'}
            </button>
            {deleteError && <p className="publish-error" role="alert">{deleteError}</p>}
          </section>
        )}

        <section className="replay-key-moment">
          <span>{ru ? 'Ключевой момент' : 'Key moment'}</span>
          <p><i aria-hidden="true" /> {keyMoment}</p>
        </section>

        <section className="replay-event-list">
          <header><List size={17} /> {ru ? 'Хронология событий' : 'Event timeline'}</header>
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
