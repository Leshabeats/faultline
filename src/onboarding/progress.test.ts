import { describe, expect, it } from 'vitest'
import { completeOnboarding, hasCompletedOnboarding, ONBOARDING_STORAGE_KEY } from './progress'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('onboarding progress', () => {
  it('marks a completed versioned onboarding flow', () => {
    const storage = new MemoryStorage()

    expect(hasCompletedOnboarding(storage)).toBe(false)
    completeOnboarding(storage, 'workspace')
    expect(hasCompletedOnboarding(storage)).toBe(true)
  })

  it('fails closed for corrupt or unsupported progress', () => {
    const storage = new MemoryStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{broken')
    expect(hasCompletedOnboarding(storage)).toBe(false)

    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ version: 2, completed: true, mode: 'interview' }))
    expect(hasCompletedOnboarding(storage)).toBe(false)
  })
})
