import { describe, expect, it } from 'vitest'
import { createCompletedTestAttempt, createTestAttempt } from './testFixtures'
import { verifyImportedUrlShortenerAttempt } from './verification'

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
})
