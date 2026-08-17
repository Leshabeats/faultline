import { describe, expect, it } from 'vitest'
import { PublicReplayCapabilityStore } from './capabilities'

const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('public replay capability store', () => {
  it('remembers a delete token for the publishing browser only', () => {
    const store = new PublicReplayCapabilityStore(memory())
    store.save({
      publicId: 'pub-1',
      attemptId: 'attempt-1',
      url: 'http://127.0.0.1:4173/#/r/pub-1',
      deleteToken: 'secret-token',
      publishedAt: '2026-08-17T10:00:00.000Z',
    })

    expect(store.getByAttemptId('attempt-1')?.deleteToken).toBe('secret-token')
    store.remove('pub-1')
    expect(store.getByAttemptId('attempt-1')).toBeUndefined()
  })
})
