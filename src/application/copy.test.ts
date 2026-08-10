import { describe, expect, it } from 'vitest'
import {
  bottleneckCopy,
  capacityAssumptionsCopy,
  defenseCopy,
  fallbackKeyMoment,
  newsFeedAssumptionsCopy,
  replayImportErrorCopy,
  scoreDimensionCopy,
} from './copy'
import { DEFAULT_CAPACITY_TUNING, estimateCapacity } from '../capacity/model'
import { DEFAULT_NEWS_FEED_TUNING, estimateNewsFeed } from '../newsFeed/model'

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

  it('builds Russian capacity assumptions from structured report fields', () => {
    const report = estimateCapacity({
      loadMultiplier: 10,
      fault: 'none',
      tuning: DEFAULT_CAPACITY_TUNING,
      componentCounts: { database: 4 },
    })

    const assumptions = capacityAssumptionsCopy('ru', report)
    expect(assumptions.join(' ')).toContain('4 шард. БД')
    expect(assumptions.join(' ')).not.toContain('database shard')
  })

  it('localizes structured news-feed assumptions and score dimensions', () => {
    const report = estimateNewsFeed({
      loadMultiplier: 10,
      fault: 'celebrity-spike',
      tuning: DEFAULT_NEWS_FEED_TUNING,
    })

    const assumptions = newsFeedAssumptionsCopy('ru', report, DEFAULT_NEWS_FEED_TUNING)
    expect(assumptions.join(' ')).toContain('50 миллионам подписчиков')
    expect(assumptions.join(' ')).not.toContain('Worker throughput')
    expect(scoreDimensionCopy('ru', 'resilience', 'Resilience')).toBe('Устойчивость')
  })
})
