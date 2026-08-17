import { describe, expect, it } from 'vitest'
import { createCompletedTestAttempt, createTestAttempt } from '../replay/testFixtures'
import { challengePublishAttempt, resolvePublishAttempt } from './publishTarget'

describe('challenge publish target', () => {
  it('binds Challenge Publish to the last submitted attempt, not savedAttempts[0]', () => {
    const imported = {
      ...createTestAttempt(),
      id: 'imported-newer',
      updatedAt: '2099-01-01T00:00:00.000Z',
    }
    const submitted = {
      ...createCompletedTestAttempt(),
      id: 'just-submitted',
      updatedAt: '2026-08-17T10:00:00.000Z',
    }
    const savedAttempts = [imported, submitted]

    expect(challengePublishAttempt(submitted)?.id).toBe('just-submitted')
    expect(savedAttempts[0].id).toBe('imported-newer')
    expect(resolvePublishAttempt(submitted.id, [submitted, ...savedAttempts])?.id).toBe('just-submitted')
  })

  it('still publishes an in-memory completed attempt after a failed history save', () => {
    const submitted = createCompletedTestAttempt()
    expect(resolvePublishAttempt(submitted.id, [submitted])).toEqual(submitted)
    expect(resolvePublishAttempt(submitted.id, [null, undefined])).toBeNull()
  })
})
