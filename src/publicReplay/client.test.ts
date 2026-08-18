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

  it('does not fall back to XHR after an in-flight fetch failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network lost after the request left the browser')
    })
    const xhrMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('XMLHttpRequest', xhrMock)

    const client = new FetchPublicReplayClient('http://127.0.0.1:8787')
    await expect(client.publish(envelope as never)).rejects.toMatchObject({ code: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(xhrMock).not.toHaveBeenCalled()
  })

  it('uses XHR only when fetch is unavailable', async () => {
    class FakeXHR {
      status = 201
      statusText = 'Created'
      responseText = JSON.stringify({
        id: 'pub-xhr',
        url: 'http://127.0.0.1:4173/#/r/pub-xhr',
        deleteToken: 'token',
      })
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      open() {}
      setRequestHeader() {}
      getResponseHeader() { return 'application/json' }
      send() { this.onload?.() }
    }
    vi.stubGlobal('fetch', undefined)
    vi.stubGlobal('Response', undefined)
    vi.stubGlobal('XMLHttpRequest', vi.fn(() => new FakeXHR()))

    const client = new FetchPublicReplayClient('http://127.0.0.1:8787')
    await expect(client.publish(envelope as never)).resolves.toMatchObject({
      id: 'pub-xhr',
      deleteToken: 'token',
    })
    expect(XMLHttpRequest).toHaveBeenCalledOnce()
  })
})
