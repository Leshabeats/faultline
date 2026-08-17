import type { Locale } from '../domain/system'
import type { PublicReplayError } from './types'

const russian: Record<PublicReplayError['code'], string> = {
  'too-large': 'Публичный повтор превышает безопасный размер.',
  'invalid-json': 'Сервис не принял JSON повтора.',
  'unsupported-version': 'Версия публичного повтора пока не поддерживается.',
  'invalid-replay': 'Сервис не принял этот повтор.',
  'private-content': 'Публичный повтор всё ещё содержит ответы интервьюеру.',
  'not-found': 'Публичный повтор не найден.',
  'unauthorized': 'Недостаточно прав, чтобы удалить этот повтор.',
  'rate-limited': 'Слишком много публикаций. Попробуйте чуть позже.',
  'storage-quota': 'Хранилище публичных повторов заполнено. Удалите старый повтор и попробуйте снова.',
  'unavailable': 'Сервис публичных повторов недоступен. Запустите локальный backend.',
}

export function publicReplayErrorCopy(locale: Locale, error: PublicReplayError) {
  if (locale === 'ru') {
    return russian[error.code] ?? error.message
  }
  return error.message
}
