import { Download, FileUp, Globe, History, Play, Trash2, X } from 'lucide-react'
import { useEffect, useRef, type ChangeEvent } from 'react'
import type { Locale } from '../domain/system'

export interface HistoryAttemptItem {
  id: string
  title: string
  completedAt: string
  durationMs: number
  score?: number
  passed?: boolean
  keyMoment: string
  publicUrl?: string
}

interface HistoryPanelProps {
  open: boolean
  locale: Locale
  attempts: HistoryAttemptItem[]
  notice?: { message: string; tone: 'success' | 'error' } | null
  onClose: () => void
  onReplay: (attemptId: string) => void
  onDelete: (attemptId: string) => void
  onExport: (attemptId: string) => void
  onImport: (file: File) => void
  onPublish: (attemptId: string) => void
}

const formatDuration = (valueMs: number) => {
  const totalSeconds = Math.floor(valueMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

const formatDate = (value: string, locale: Locale) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function HistoryPanel({
  open,
  locale,
  attempts,
  notice,
  onClose,
  onReplay,
  onDelete,
  onExport,
  onImport,
  onPublish,
}: HistoryPanelProps) {
  const ru = locale === 'ru'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
      openerRef.current?.focus()
      openerRef.current = null
    }
  }, [open])

  if (!open) return null

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onImport(file)
    event.target.value = ''
  }

  return (
    <aside ref={panelRef} className="history-panel" role="dialog" aria-modal="true" aria-label={ru ? 'Сохранённые попытки' : 'Saved attempts'}>
      <header className="history-panel-header">
        <div>
          <strong>{ru ? 'История' : 'History'}</strong>
          <span>{ru ? 'Сохранено на этом устройстве' : 'Saved on this device'}</span>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={ru ? 'Закрыть историю' : 'Close history'}><X size={19} /></button>
      </header>

      <div className="history-panel-body">
        {notice && (
          <div
            className={`history-notice is-${notice.tone}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
          >
            {notice.message}
          </div>
        )}
        {attempts.length === 0 ? (
          <div className="history-empty">
            <span aria-hidden="true"><History size={22} /></span>
            <strong>{ru ? 'Сохранённых попыток пока нет.' : 'No saved attempts yet.'}</strong>
            <p>{ru ? 'Отправьте решение, чтобы сохранить здесь полное воспроизведение сбоев.' : 'Submit a design to keep its full failure replay here.'}</p>
          </div>
        ) : (
          <ol className="history-list">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <div className="history-attempt-heading">
                  <span>
                    <strong>{attempt.title}</strong>
                    <small>{formatDate(attempt.completedAt, locale)}</small>
                  </span>
                  {attempt.score === undefined
                    ? <strong className="is-snapshot">—</strong>
                    : <strong className={attempt.passed ? 'is-passed' : 'is-failed'}>{attempt.score}</strong>}
                </div>
                <p>{attempt.keyMoment}</p>
                <div className="history-attempt-meta">
                  <span>{attempt.score === undefined
                    ? ru ? 'Снимок' : 'Snapshot'
                    : attempt.passed
                      ? ru ? 'Пройдено' : 'Passed'
                      : ru ? 'Нужно улучшить' : 'Needs work'} · {formatDuration(attempt.durationMs)}</span>
                  <div>
                    <button type="button" onClick={() => onPublish(attempt.id)} aria-label={ru ? `Опубликовать повтор «${attempt.title}»` : `Publish ${attempt.title} replay`} title={attempt.publicUrl ? (ru ? 'Управление публичной ссылкой' : 'Manage public link') : (ru ? 'Опубликовать повтор' : 'Publish replay')}><Globe size={16} /></button>
                    <button type="button" onClick={() => onExport(attempt.id)} aria-label={ru ? `Экспорт повтора «${attempt.title}»` : `Export ${attempt.title} replay`}><Download size={16} /></button>
                    <button type="button" onClick={() => onDelete(attempt.id)} aria-label={ru ? `Удалить повтор «${attempt.title}»` : `Delete ${attempt.title} replay`}><Trash2 size={16} /></button>
                    <button className="history-replay-button" type="button" onClick={() => onReplay(attempt.id)}><Play size={15} fill="currentColor" /> {ru ? 'Повтор' : 'Replay'}</button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="history-panel-footer">
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImport} />
        <button type="button" onClick={() => fileInputRef.current?.click()}><FileUp size={17} /> {ru ? 'Импортировать повтор' : 'Import replay'}</button>
      </footer>
    </aside>
  )
}
