import { parsePublicReplayEnvelope } from './envelope'
import type {
  PublicReplayError,
  PublicReplayErrorCode,
  PublicReplayRecord,
  PublishReplayResult,
  PublicReplayEnvelopeV1,
} from './types'

export interface PublicReplayClient {
  publish(envelope: PublicReplayEnvelopeV1): Promise<PublishReplayResult>
  get(id: string): Promise<PublicReplayRecord>
  remove(id: string, deleteToken: string): Promise<void>
}

const defaultApiBase = () => {
  const configured = import.meta.env.VITE_FAULTLINE_API_BASE
  if (typeof configured === 'string' && configured.length > 0) {
    return configured.replace(/\/$/, '')
  }
  return ''
}

const asError = (
  code: PublicReplayErrorCode,
  message: string,
): PublicReplayError => ({ code, message })

const readError = async (response: Response): Promise<PublicReplayError> => {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }
  const code = typeof parsed === 'object' && parsed && 'code' in parsed
    ? String((parsed as { code: unknown }).code)
    : ''
  const message = typeof parsed === 'object' && parsed && 'message' in parsed
    ? String((parsed as { message: unknown }).message)
    : ''

  if (response.status === 404) return asError('not-found', message || 'Public replay was not found.')
  if (response.status === 401 || response.status === 403) {
    return asError('unauthorized', message || 'This replay cannot be deleted with the provided token.')
  }
  if (response.status === 413 || code === 'too-large') {
    return asError('too-large', message || 'Public replay is larger than the safe limit.')
  }
  if (response.status === 429) return asError('rate-limited', message || 'Too many publish requests. Try again shortly.')
  if (code === 'unsupported-version') {
    return asError('unsupported-version', message || 'This public replay version is not supported.')
  }
  if (code === 'private-content') {
    return asError('private-content', message || 'Public replay still contains interviewer answers.')
  }
  if (code === 'invalid-json') return asError('invalid-json', message || 'Public replay is not valid JSON.')
  if (response.status >= 500) return asError('unavailable', message || 'The replay service is unavailable.')
  return asError('invalid-replay', message || 'The replay service rejected this payload.')
}

export class FetchPublicReplayClient implements PublicReplayClient {
  constructor(private readonly apiBase = defaultApiBase()) {}

  async publish(envelope: PublicReplayEnvelopeV1): Promise<PublishReplayResult> {
    const response = await this.request('/api/public-replays', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    })
    if (!response.ok) throw await readError(response)
    const payload = await response.json() as Partial<PublishReplayResult>
    if (!payload.id || !payload.url || !payload.deleteToken) {
      throw asError('unavailable', 'The replay service returned an incomplete publish response.')
    }
    return {
      id: payload.id,
      url: payload.url,
      deleteToken: payload.deleteToken,
    }
  }

  async get(id: string): Promise<PublicReplayRecord> {
    const response = await this.request(`/api/public-replays/${encodeURIComponent(id)}`)
    if (!response.ok) throw await readError(response)
    const payload = await response.json() as {
      id?: string
      createdAt?: string
      envelope?: unknown
      deleteToken?: unknown
    }
    if (payload.deleteToken !== undefined) {
      throw asError('unavailable', 'The replay service leaked a delete token.')
    }
    const parsed = parsePublicReplayEnvelope(payload.envelope)
    if (!parsed.ok) throw parsed.error
    if (!payload.id || !payload.createdAt) {
      throw asError('invalid-replay', 'The replay service returned an incomplete record.')
    }
    return {
      id: payload.id,
      createdAt: payload.createdAt,
      envelope: parsed.value,
    }
  }

  async remove(id: string, deleteToken: string): Promise<void> {
    const response = await this.request(`/api/public-replays/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-faultline-delete-token': deleteToken },
    })
    if (!response.ok) throw await readError(response)
  }

  private async request(path: string, init?: RequestInit) {
    const url = `${this.apiBase}${path}`
    try {
      if (typeof fetch === 'function') {
        return await fetch(url, init)
      }
    } catch {
      // Some embedded browsers expose a non-functional fetch.
    }
    try {
      return await xhrRequest(url, init)
    } catch {
      throw asError('unavailable', 'The replay service is unavailable.')
    }
  }
}

function xhrRequest(url: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(init?.method ?? 'GET', url)
    const headers = init?.headers
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      Object.entries(headers as Record<string, string>).forEach(([key, value]) => {
        request.setRequestHeader(key, value)
      })
    }
    request.onload = () => {
      resolve(new Response(request.responseText, {
        status: request.status,
        statusText: request.statusText,
        headers: { 'content-type': request.getResponseHeader('content-type') ?? 'application/json' },
      }))
    }
    request.onerror = () => reject(new TypeError('Network request failed'))
    request.send(typeof init?.body === 'string' ? init.body : null)
  })
}
