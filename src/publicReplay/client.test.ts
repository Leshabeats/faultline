import { afterEach, describe, expect, it, vi } from 'vitest'
import { FetchPublicReplayClient } from './client'
import { PUBLIC_REPLAY_SCHEMA } from './types'

const envelope = {
  schema: PUBLIC_REPLAY_SCHEMA,
  version: 1,
  publishedAt: '2026-08-17T10:00:00.000Z',
  replay: {
    schema: 'faultline.replay',
    version: 1,
    exportedAt: '2026-08-03T10:00:05.000Z',
    attempt: {
      id: 'attempt-1',
      challengeId: 'url-shortener',
      startedAt: '2026-08-03T10:00:00.000Z',
      updatedAt: '2026-08-03T10:00:05.000Z',
      durationMs: 0,
      initial: {
        architecture: {
          nodes: [{
            id: 'client',
            type: 'system',
            position: { x: 10, y: 20 },
            data: { kind: 'client', label: 'Clients' },
          }],
          edges: [],
        },
        load: 1,
        fault: 'none',
      },
      events: [],
    },
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('FetchPublicReplayClient', () => {
  it('rejects a GET payload that leaks a delete token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'pub-1',
      createdAt: '2026-08-17T10:00:00.000Z',
      envelope,
      deleteToken: 'should-not-leak',
    }), { status: 200 })))

    const client = new FetchPublicReplayClient('http://127.0.0.1:8787')
    await expect(client.get('pub-1')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('maps a missing replay to not-found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'not-found',
      message: 'Public replay was not found.',
    }), { status: 404 })))

    const client = new FetchPublicReplayClient('http://127.0.0.1:8787')
    await expect(client.get('missing-id-12345678')).rejects.toMatchObject({ code: 'not-found' })
  })
})
