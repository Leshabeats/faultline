import { describe, expect, it } from 'vitest'
import {
  bottleneckCopy,
  defenseCopy,
  fallbackKeyMoment,
  replayImportErrorCopy,
} from './copy'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'

describe('localized application copy', () => {
  it('builds the URL-shortener defense entirely in Russian', () => {
    const copy = defenseCopy({
      locale: 'ru',
      scenario: 'url-shortener',
      capacity: { ...DEFAULT_CAPACITY_TUNING, indexedLookup: true, readReplicas: 2 },
      monthlyCost: 1234.4,
    })

    expect(copy.prompt).toContain('Вы выбрали индексированный поиск')
    expect(copy.prompt).toContain('1234 USD/мес')
    expect(copy.feedback).toContain('какое предположение')
    expect(copy.eventTitle).toBe('Решение готово к защите')
  })

  it('localizes import failures and fallback replay moments', () => {
    expect(replayImportErrorCopy('ru', 'invalid-json', 'Replay is not valid JSON.'))
      .toBe('Файл повтора содержит некорректный JSON.')
    expect(fallbackKeyMoment('ru', 'cache-outage', 500)).toMatchObject({
      title: 'Попытка началась при недоступном Redis',
      tone: 'critical',
      atMs: 0,
    })
  })

  it('localizes user-facing bottleneck names', () => {
    expect(bottleneckCopy('ru', 'connection-pool')).toBe('пул соединений')
    expect(bottleneckCopy('ru', 'timeline-cache')).toBe('кеш лент')
    expect(bottleneckCopy('en', 'connection-pool')).toBe('connection pool')
  })
})
