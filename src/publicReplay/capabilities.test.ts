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

  it('keeps the delete token in memory when persistence fails', () => {
    const store = new PublicReplayCapabilityStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => undefined,
    })

    const persisted = store.save({
      publicId: 'pub-2',
      attemptId: 'attempt-2',
      url: 'http://127.0.0.1:4173/#/r/pub-2',
      deleteToken: 'session-only-token',
      publishedAt: '2026-08-17T10:00:00.000Z',
    })

    expect(persisted).toBe(false)
    expect(store.getByAttemptId('attempt-2')?.deleteToken).toBe('session-only-token')
    expect(store.getByPublicId('pub-2')?.url).toContain('#/r/pub-2')
  })

  it('falls back to memory when storage reads throw', () => {
    const store = new PublicReplayCapabilityStore({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    expect(store.list()).toEqual([])
    store.save({
      publicId: 'pub-3',
      attemptId: 'attempt-3',
      url: 'http://127.0.0.1:4173/#/r/pub-3',
      deleteToken: 'memory-token',
      publishedAt: '2026-08-17T10:00:00.000Z',
    })
    expect(store.getByPublicId('pub-3')?.deleteToken).toBe('memory-token')
  })

  it('merges capabilities written by another tab before saving', () => {
    const values = new Map<string, string>()
    const shared = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const first = new PublicReplayCapabilityStore(shared)
    const second = new PublicReplayCapabilityStore(shared)
    first.save({
      publicId: 'pub-a',
      attemptId: 'attempt-a',
      url: 'http://127.0.0.1:4173/#/r/pub-a',
      deleteToken: 'token-a',
      publishedAt: '2026-08-17T10:00:00.000Z',
    })
    second.save({
      publicId: 'pub-b',
      attemptId: 'attempt-b',
      url: 'http://127.0.0.1:4173/#/r/pub-b',
      deleteToken: 'token-b',
      publishedAt: '2026-08-17T10:01:00.000Z',
    })

    expect(second.getByPublicId('pub-a')?.deleteToken).toBe('token-a')
    expect(second.getByPublicId('pub-b')?.deleteToken).toBe('token-b')
    expect(first.list().map((item) => item.publicId).sort()).toEqual(['pub-a', 'pub-b'])
  })

  it('never evicts an older delete token while its replay can still be public', () => {
    const store = new PublicReplayCapabilityStore(memory())
    for (let index = 0; index < 60; index += 1) {
      store.save({
        publicId: `pub-${index}`,
        attemptId: `attempt-${index}`,
        url: `http://127.0.0.1:4173/#/r/pub-${index}`,
        deleteToken: `token-${index}`,
        publishedAt: new Date(Date.UTC(2026, 7, 17, 10, index)).toISOString(),
      })
    }

    expect(store.list()).toHaveLength(60)
    expect(store.getByPublicId('pub-0')?.deleteToken).toBe('token-0')
  })

  it('keeps a removed capability hidden in-session when persistent cleanup fails', () => {
    const values = new Map<string, string>()
    let rejectWrites = false
    const store = new PublicReplayCapabilityStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (rejectWrites) throw new Error('storage blocked')
        values.set(key, value)
      },
      removeItem: (key) => {
        if (rejectWrites) throw new Error('storage blocked')
        values.delete(key)
      },
    })
    store.save({
      publicId: 'pub-stale',
      attemptId: 'attempt-stale',
      url: 'http://127.0.0.1:4173/#/r/pub-stale',
      deleteToken: 'token-stale',
      publishedAt: '2026-08-17T10:00:00.000Z',
    })

    rejectWrites = true
    expect(store.remove('pub-stale')).toBe(false)
    expect(store.getByPublicId('pub-stale')).toBeUndefined()
    expect(store.getByAttemptId('attempt-stale')).toBeUndefined()
  })
})
