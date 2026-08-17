import type { Locale } from '../domain/system'
import type { PublicReplayError } from '../publicReplay'

interface PublicReplayStateProps {
  locale: Locale
  status: 'loading' | 'error'
  error?: PublicReplayError | null
  onRetry: () => void
}

export function publicReplayStateCopy(
  locale: Locale,
  status: 'loading' | 'error',
  error?: PublicReplayError | null,
) {
  const ru = locale === 'ru'
  if (status === 'loading') {
    return {
      title: ru ? 'Загружаем публичный повтор' : 'Loading public replay',
      detail: ru
        ? 'Архитектура и шкала событий сейчас восстанавливаются из сохранённых событий.'
        : 'Architecture and the event timeline are being rebuilt from the saved events.',
    }
  }
  if (error?.code === 'not-found') {
    return {
      title: ru ? 'Повтор не найден' : 'Replay not found',
      detail: ru
        ? 'Этот публичный повтор не найден или уже удалён.'
        : 'This public replay was not found or has already been removed.',
    }
  }
  if (error?.code === 'unsupported-version') {
    return {
      title: ru ? 'Версия не поддерживается' : 'Unsupported version',
      detail: ru
        ? 'Версия этого публичного повтора пока не поддерживается.'
        : 'This public replay version is not supported yet.',
    }
  }
  if (error?.code === 'rate-limited') {
    return {
      title: ru ? 'Слишком много запросов' : 'Too many requests',
      detail: ru
        ? 'Публичный повтор временно ограничен. Подождите немного и откройте ссылку снова.'
        : 'This public replay is temporarily rate-limited. Wait a moment and open the link again.',
    }
  }
  return {
    title: ru ? 'Не удалось открыть повтор' : 'Could not open replay',
    detail: ru
      ? 'Сервис публичных повторов недоступен. Запустите локальный backend.'
      : 'The replay service is unavailable. Start the local backend.',
  }
}

export function PublicReplayState({ locale, status, error, onRetry }: PublicReplayStateProps) {
  const ru = locale === 'ru'
  const copy = publicReplayStateCopy(locale, status, error)
  return (
    <div className="public-replay-state" role={status === 'error' ? 'alert' : 'status'}>
      <strong>{copy.title}</strong>
      <p>{copy.detail}</p>
      {status === 'error' && (
        <button type="button" onClick={onRetry}>{ru ? 'Повторить' : 'Retry'}</button>
      )}
    </div>
  )
}
