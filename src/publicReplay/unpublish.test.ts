import { describe, expect, it, vi } from 'vitest'
import type { StoredReplayCapability } from './types'
import {
  UnpublishOperationGate,
  unpublishPublicReplay,
  unpublishResultTargetsActiveAttempt,
} from './unpublish'

const capability: StoredReplayCapability = {
  publicId: 'pub-1',
  attemptId: 'attempt-1',
  url: 'http://127.0.0.1:4173/#/r/pub-1',
  deleteToken: 'token-1',
  publishedAt: '2026-08-17T10:00:00.000Z',
}

describe('unpublish public replay', () => {
  it('treats not-found as convergence to the unpublished state', async () => {
    const removeRemote = vi.fn(async () => {
      throw { code: 'not-found', message: 'Already gone' }
    })
    const removeCapability = vi.fn(() => true)

    await expect(unpublishPublicReplay(
      { remove: removeRemote },
      { remove: removeCapability },
      capability,
    )).resolves.toEqual({ ok: true, cleanupPersisted: true })
    expect(removeCapability).toHaveBeenCalledWith('pub-1')
  })

  it('keeps the capability when remote deletion has not converged', async () => {
    const removeCapability = vi.fn(() => true)
    const result = await unpublishPublicReplay(
      { remove: vi.fn(async () => { throw { code: 'unavailable', message: 'Offline' } }) },
      { remove: removeCapability },
      capability,
    )

    expect(result).toEqual({
      ok: false,
      error: { code: 'unavailable', message: 'Offline' },
    })
    expect(removeCapability).not.toHaveBeenCalled()
  })

  it('reports persistent cleanup failure after successful deletion', async () => {
    await expect(unpublishPublicReplay(
      { remove: vi.fn(async () => undefined) },
      { remove: vi.fn(() => false) },
      capability,
    )).resolves.toEqual({ ok: true, cleanupPersisted: false })
  })

  it('applies request results only to the dialog that started them', () => {
    expect(unpublishResultTargetsActiveAttempt('attempt-1', 'attempt-1')).toBe(true)
    expect(unpublishResultTargetsActiveAttempt('attempt-2', 'attempt-1')).toBe(false)
    expect(unpublishResultTargetsActiveAttempt(undefined, 'attempt-1')).toBe(false)
    expect(unpublishResultTargetsActiveAttempt('attempt-1', 'attempt-1', false)).toBe(false)
  })

  it('forwards cancellation to the remote delete request', async () => {
    const controller = new AbortController()
    const removeRemote = vi.fn(async () => undefined)

    await unpublishPublicReplay(
      { remove: removeRemote },
      { remove: vi.fn(() => true) },
      capability,
      controller.signal,
    )

    expect(removeRemote).toHaveBeenCalledWith('pub-1', 'token-1', controller.signal)
  })

  it('cancels a hung operation without letting it finish a newer one', () => {
    const operations = new UnpublishOperationGate()
    const first = operations.start('attempt-1')
    expect(first).not.toBeNull()
    expect(operations.start('attempt-1')).toBeNull()

    operations.cancel()
    expect(first?.controller.signal.aborted).toBe(true)

    const second = operations.start('attempt-1')
    expect(second).not.toBeNull()
    expect(first && operations.finish(first)).toBe(false)
    expect(second && operations.isCurrent(second)).toBe(true)
    expect(second && operations.finish(second)).toBe(true)
  })
})
