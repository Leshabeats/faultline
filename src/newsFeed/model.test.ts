import { describe, expect, it } from 'vitest'
import { DEFAULT_NEWS_FEED_TUNING, estimateNewsFeed } from './model'

describe('news-feed celebrity model', () => {
  it('turns a 50M write fan-out into a visible saturated backlog', () => {
    const report = estimateNewsFeed({
      loadMultiplier: 10,
      fault: 'celebrity-spike',
      tuning: DEFAULT_NEWS_FEED_TUNING,
    })

    expect(report.status).toBe('saturated')
    expect(report.workload.celebrityFollowers).toBe(50_000_000)
    expect(report.metrics.queueDepth).toBeGreaterThan(100_000_000)
    expect(report.metrics.p99).toBeGreaterThan(5_000)
    expect(report.cost.total).toBeLessThan(50_000)
  })

  it('lets hybrid fan-out move celebrities to read and drain the queue', () => {
    const tuned = estimateNewsFeed({
      loadMultiplier: 10,
      fault: 'celebrity-spike',
      tuning: {
        ...DEFAULT_NEWS_FEED_TUNING,
        fanoutStrategy: 'hybrid',
        fanoutWorkers: 64,
        fanoutBatchSize: 2000,
        celebrityThreshold: 1_000_000,
        deduplication: true,
      },
    })

    expect(tuned.workload.fanoutJobsPerSecond).toBe(4_800_000)
    expect(tuned.metrics.queueDepth).toBe(0)
    expect(tuned.metrics.p99).toBeLessThan(5_000)
    expect(tuned.metrics.throughput).toBe(4_800_000)
    expect(tuned.cost.total).toBeLessThan(10_000)
  })

  it('makes retry deduplication an explicit hidden-case lever', () => {
    const withoutDedup = estimateNewsFeed({
      loadMultiplier: 3,
      fault: 'duplicate-delivery',
      tuning: DEFAULT_NEWS_FEED_TUNING,
    })
    const withDedup = estimateNewsFeed({
      loadMultiplier: 3,
      fault: 'duplicate-delivery',
      tuning: { ...DEFAULT_NEWS_FEED_TUNING, deduplication: true },
    })

    expect(withoutDedup.duplicateRate).toBeGreaterThan(4)
    expect(withDedup.duplicateRate).toBeLessThan(0.1)
    expect(withDedup.metrics.errorRate).toBeLessThan(withoutDedup.metrics.errorRate)
  })
})
