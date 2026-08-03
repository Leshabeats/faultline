import { describe, expect, it } from 'vitest'
import { createCompletedTestAttempt, createTestAttempt } from './testFixtures'
import { newsFeedSeedEdges, newsFeedSeedNodes } from '../canvas/newsFeedSeed'
import { DEFAULT_NEWS_FEED_TUNING } from '../newsFeed/model'
import { createReplayAttempt, recordReplayEvent } from './recorder'
import { toReplayEdge, toReplayNode } from './presentation'
import { verifyImportedAttempt, verifyImportedUrlShortenerAttempt } from './verification'

describe('imported replay verification', () => {
  it('replaces forged result fields with the current deterministic judge result', () => {
    const attempt = createCompletedTestAttempt()
    attempt.summary = { score: 100, maxScore: 100, passed: true }
    const submitted = attempt.events.find((event) => event.type === 'design.submitted')
    if (submitted?.type === 'design.submitted') {
      submitted.payload.submission.score = 100
      submitted.payload.submission.passed = true
    }

    const verified = verifyImportedUrlShortenerAttempt(attempt)
    const verifiedSubmission = verified.events.find((event) => event.type === 'design.submitted')

    expect(verified.summary?.score).not.toBe(100)
    expect(verifiedSubmission?.type === 'design.submitted'
      ? verifiedSubmission.payload.submission.score
      : undefined).toBe(verified.summary?.score)
  })

  it('keeps an unsubmitted snapshot scoreless', () => {
    const attempt = createTestAttempt()
    attempt.summary = { score: 100, maxScore: 100, passed: true }

    expect(verifyImportedUrlShortenerAttempt(attempt).summary).toBeUndefined()
  })

  it('re-judges a news-feed replay with the news-feed suite', () => {
    let attempt = createReplayAttempt({
      id: 'feed-attempt',
      challengeId: 'news-feed',
      startedAt: '2026-08-03T10:00:00.000Z',
      initial: {
        architecture: {
          nodes: newsFeedSeedNodes.map(toReplayNode),
          edges: newsFeedSeedEdges.map(toReplayEdge),
        },
        load: 10,
        fault: 'celebrity-spike',
        capacity: DEFAULT_NEWS_FEED_TUNING,
      },
    })
    attempt = recordReplayEvent(attempt, {
      id: 'feed-submit',
      atMs: 0,
      source: 'user',
      type: 'design.submitted',
      payload: {
        submission: {
          judgeVersion: 'forged',
          score: 100,
          maxScore: 100,
          passed: true,
          passedCases: 5,
          totalCases: 5,
        },
      },
    })

    const verified = verifyImportedAttempt(attempt)
    const submission = verified.events.find((event) => event.type === 'design.submitted')
    expect(submission?.type === 'design.submitted'
      ? submission.payload.submission.judgeVersion
      : undefined).toBe('news-feed-v1')
    expect(verified.summary?.score).toBeLessThan(100)
  })
})
