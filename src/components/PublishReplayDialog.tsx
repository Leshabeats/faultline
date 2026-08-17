import { Check, Copy, Globe, Link2, LoaderCircle, ShieldAlert, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Locale } from '../domain/system'
import type { PublicReplayPreview } from '../publicReplay'

interface PublishReplayDialogProps {
  locale: Locale
  open: boolean
  preview: PublicReplayPreview | null
  challengeTitle: string
  status: 'confirm' | 'publishing' | 'ready' | 'error'
  publicUrl?: string
  error?: string
  onClose: () => void
  onConfirm: () => void
  onRetry: () => void
  onCopy: () => void
  copied: boolean
  onUnpublish?: () => void
  unpublishing?: boolean
}

const includeCopy = (locale: Locale, key: string) => {
  const ru = locale === 'ru'
  return ({
    challenge: ru ? 'задача и исходные условия' : 'challenge and starting conditions',
    architecture: ru ? 'итоговая архитектура' : 'final architecture',
    'load-and-faults': ru ? 'нагрузка и сбои' : 'load and fault events',
    'capacity-tuning': ru ? 'настройки ёмкости и топологии' : 'capacity and topology tuning',
    'event-timeline': ru ? 'семантическая шкала событий' : 'semantic event timeline',
    'submission-summary': ru ? 'сохранённый итог отправки' : 'saved submission summary',
  } as Record<string, string>)[key] ?? key
}

const excludeCopy = (locale: Locale, key: string) => {
  const ru = locale === 'ru'
  return ({
    'interviewer-answers': ru ? 'ответы интервьюеру' : 'interviewer answers',
    'interviewer-prompts': ru ? 'вопросы интервьюера' : 'interviewer prompts',
    'interviewer-feedback': ru ? 'разбор ответов' : 'answer feedback',
    'answer-metadata': ru ? 'прогнозы и прочие метаданные ответов' : 'predictions and other answer metadata',
    'api-keys': ru ? 'ключи и секреты' : 'API keys and secrets',
  } as Record<string, string>)[key] ?? key
}

export function PublishReplayDialog({
  locale,
  open,
  preview,
  challengeTitle,
  status,
  publicUrl,
  error,
  onClose,
  onConfirm,
  onRetry,
  onCopy,
  copied,
  onUnpublish,
  unpublishing = false,
}: PublishReplayDialogProps) {
  const ru = locale === 'ru'
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  if (!open || !preview) return null

  return (
    <div className="publish-backdrop" role="presentation">
      <section
        className="publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-replay-title"
      >
        <header>
          <div>
            <span>{ru ? 'Публичный повтор' : 'Shareable run'}</span>
            <h2 id="publish-replay-title">{ru ? 'Опубликовать повтор' : 'Publish replay'}</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={ru ? 'Закрыть' : 'Close'}>
            <X size={18} />
          </button>
        </header>

        <p>
          {ru
            ? `Ссылка откроет интерактивный повтор «${challengeTitle}» без авторизации. Это не видео: интерфейс заново проигрывает семантические события Faultline.`
            : `The link will open an interactive “${challengeTitle}” replay without sign-in. This is not a recording: Faultline rebuilds the attempt from semantic events.`}
        </p>

        <div className="publish-preview">
          <div>
            <strong>{preview.nodeCount}</strong>
            <span>{ru ? 'компонентов' : 'components'}</span>
          </div>
          <div>
            <strong>{preview.eventCount}</strong>
            <span>{ru ? 'событий' : 'events'}</span>
          </div>
          <div>
            <strong>{preview.submitted ? (ru ? 'Есть' : 'Yes') : (ru ? 'Нет' : 'No')}</strong>
            <span>{ru ? 'отправка' : 'submitted'}</span>
          </div>
        </div>

        <section>
          <h3><Globe size={16} /> {ru ? 'Станет публичным' : 'Will be public'}</h3>
          <ul>
            {preview.includes.map((item) => (
              <li key={item}>{includeCopy(locale, item)}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3><ShieldAlert size={16} /> {ru ? 'Не публикуется' : 'Kept private'}</h3>
          <ul>
            {preview.excludes.map((item) => (
              <li key={item}>{excludeCopy(locale, item)}</li>
            ))}
          </ul>
        </section>

        {status === 'ready' && publicUrl && (
          <div className="publish-result" role="status">
            <label htmlFor="public-replay-url">{ru ? 'Публичная ссылка' : 'Public link'}</label>
            <div>
              <input id="public-replay-url" readOnly value={publicUrl} />
              <button type="button" onClick={onCopy}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? (ru ? 'Скопировано' : 'Copied') : (ru ? 'Копировать ссылку' : 'Copy public link')}
              </button>
            </div>
            {onUnpublish && (
              <button type="button" className="publish-unpublish" onClick={onUnpublish} disabled={unpublishing}>
                {unpublishing
                  ? (ru ? 'Удаление…' : 'Removing…')
                  : (ru ? 'Удалить публикацию' : 'Unpublish replay')}
              </button>
            )}
          </div>
        )}

        {error && (
          <p className={status === 'error' ? 'publish-error' : 'publish-warning'} role="status">{error}</p>
        )}

        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            {status === 'ready' ? (ru ? 'Готово' : 'Done') : (ru ? 'Отмена' : 'Cancel')}
          </button>
          {status === 'error' ? (
            <button type="button" onClick={onRetry}>
              <LoaderCircle size={16} /> {ru ? 'Повторить' : 'Retry'}
            </button>
          ) : status === 'ready' ? (
            <a className="publish-open" href={publicUrl} target="_blank" rel="noreferrer">
              <Link2 size={16} /> {ru ? 'Открыть ссылку' : 'Open link'}
            </a>
          ) : (
            <button type="button" onClick={onConfirm} disabled={status === 'publishing'}>
              {status === 'publishing' ? <LoaderCircle size={16} className="is-spinning" /> : <Globe size={16} />}
              {status === 'publishing'
                ? (ru ? 'Публикация…' : 'Publishing…')
                : (ru ? 'Опубликовать повтор' : 'Publish replay')}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
