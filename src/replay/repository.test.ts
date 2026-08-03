import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPLAY_STORAGE_KEY,
  MAX_REPLAY_STORAGE_CHARACTERS,
  ReplayAttemptRepository,
  type StorageLike,
} from './repository'
import { createReplayEnvelope } from './recorder'
import { createCompletedTestAttempt, createTestAttempt } from './testFixtures'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe('ReplayAttemptRepository', () => {
  it('saves, updates, orders, removes, and clears attempts', () => {
    const storage = new MemoryStorage()
    const repository = new ReplayAttemptRepository(storage)
    const older = createTestAttempt()
    const newer = {
      ...createCompletedTestAttempt(),
      id: 'attempt-2',
      updatedAt: '2026-08-03T11:00:00.000Z',
    }

    repository.save(older)
    repository.save(newer)
    expect(repository.list().map(({ id }) => id)).toEqual(['attempt-2', 'attempt-1'])
    expect(repository.get('attempt-2')?.summary?.score).toBe(82)

    repository.save({ ...older, updatedAt: '2026-08-03T12:00:00.000Z' })
    expect(repository.list().map(({ id }) => id)).toEqual(['attempt-1', 'attempt-2'])

    repository.remove('attempt-2')
    expect(repository.list().map(({ id }) => id)).toEqual(['attempt-1'])
    repository.clear()
    expect(repository.list()).toEqual([])
  })

  it('migrates flat pre-v1 arrays and drops corrupt entries independently', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      DEFAULT_REPLAY_STORAGE_KEY,
      JSON.stringify([
        createTestAttempt(),
        createReplayEnvelope(createCompletedTestAttempt()),
        { nope: true },
      ]),
    )
    const result = new ReplayAttemptRepository(storage).readAll()

    expect(result.attempts).toHaveLength(2)
    expect(result.migrated).toBe(true)
    expect(result.droppedEntries).toBe(1)
    expect(result.warnings).toContain('Skipped an invalid replay.')
  })

  it('does not parse corrupt or unexpectedly large repository data', () => {
    const storage = new MemoryStorage()
    const repository = new ReplayAttemptRepository(storage)

    storage.setItem(DEFAULT_REPLAY_STORAGE_KEY, '{')
    expect(repository.readAll()).toMatchObject({
      attempts: [],
      warnings: ['Stored replay history was corrupt and was ignored.'],
    })

    storage.setItem(
      DEFAULT_REPLAY_STORAGE_KEY,
      ' '.repeat(MAX_REPLAY_STORAGE_CHARACTERS + 1),
    )
    expect(repository.readAll()).toMatchObject({
      attempts: [],
      warnings: ['Stored replay history exceeded the safe read limit.'],
    })
  })

  it('caps retained history without touching unrelated storage keys', () => {
    const storage = new MemoryStorage()
    storage.setItem('unrelated', 'keep-me')
    const repository = new ReplayAttemptRepository(storage, 'test-replays', 2)

    repository.save({ ...createTestAttempt(), id: 'a' })
    repository.save({
      ...createTestAttempt(),
      id: 'b',
      updatedAt: '2026-08-03T10:01:00.000Z',
    })
    repository.save({
      ...createTestAttempt(),
      id: 'c',
      updatedAt: '2026-08-03T10:02:00.000Z',
    })

    expect(repository.list().map(({ id }) => id)).toEqual(['c', 'b'])
    expect(storage.getItem('unrelated')).toBe('keep-me')
  })
})
