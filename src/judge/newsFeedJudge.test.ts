import { describe, expect, it } from 'vitest'
import { DEFAULT_NEWS_FEED_TUNING } from '../newsFeed/model'
import { computeSimulation } from '../simulation/engine'
import { judgeNewsFeed } from './newsFeedJudge'
import type { TopologySummary } from './types'

const starter: TopologySummary = {
  componentCounts: { client: 1, gateway: 1, service: 1, queue: 1, cache: 1, database: 1 },
  criticalPathConnected: true,
  nodeCount: 6,
  edgeCount: 6,
}

const resilient: TopologySummary = {
  componentCounts: { client: 1, gateway: 1, service: 2, queue: 1, cache: 2, database: 1 },
  criticalPathConnected: true,
  nodeCount: 8,
  edgeCount: 9,
}

const tunedSimulation = (input: Parameters<typeof computeSimulation>[0]) =>
  computeSimulation({
    ...input,
    scenario: 'news-feed',
    capacity: {
      ...DEFAULT_NEWS_FEED_TUNING,
      fanoutStrategy: 'hybrid',
      fanoutWorkers: 64,
      fanoutBatchSize: 2000,
      celebrityThreshold: 1_000_000,
      deduplication: true,
    },
  })

describe('judgeNewsFeed', () => {
  it('keeps exactly three public and two redacted hidden cases', () => {
    const report = judgeNewsFeed(starter)
    expect(report.cases.filter((item) => item.visibility === 'public')).toHaveLength(3)
    expect(report.cases.filter((item) => item.visibility === 'hidden')).toEqual([
      { visibility: 'hidden', ordinal: 1, label: 'Hidden case 1', passed: false },
      { visibility: 'hidden', ordinal: 2, label: 'Hidden case 2', passed: false },
    ])
    expect(JSON.stringify(report.cases.filter((item) => item.visibility === 'hidden'))).not.toContain('hot-key')
  })

  it('fails the write-fanout starter under the celebrity spike', () => {
    const report = judgeNewsFeed(starter)
    const publicCases = report.cases.filter((item) => item.visibility === 'public')
    expect(publicCases.map((item) => [item.caseId, item.passed])).toEqual([
      ['normal-feed', true],
      ['celebrity-spike', false],
      ['worker-outage', false],
    ])
    expect(report.passed).toBe(false)
  })

  it('passes a redundant, tuned hybrid design deterministically', () => {
    const first = judgeNewsFeed(resilient, { simulate: tunedSimulation })
    const second = judgeNewsFeed(resilient, { simulate: tunedSimulation })
    expect(first).toEqual(second)
    expect(first.passedCases).toBe(5)
    expect(first.passed).toBe(true)
    expect(first.score).toBe(100)
  })
})
