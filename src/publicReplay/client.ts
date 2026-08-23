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
  remove(id: string, deleteToken: string, signal?: AbortSignal): Promise<void>
}

const defaultDeleteTimeoutMs = 15_000

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

interface HttpResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

const readError = async (response: HttpResponse): Promise<PublicReplayError> => {
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
  if (response.status === 429) return asError('rate-limited', message || 'Too many replay requests. Try again shortly.')
  if (response.status === 507 || code === 'storage-quota') {
    return asError('storage-quota', message || 'Public replay storage is full.')
  }
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
  constructor(
    private readonly apiBase = defaultApiBase(),
    private readonly deleteTimeoutMs = defaultDeleteTimeoutMs,
  ) {}

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

  async remove(id: string, deleteToken: string, signal?: AbortSignal): Promise<void> {
    const timedSignal = signalWithTimeout(signal, this.deleteTimeoutMs)
    try {
      const response = await this.request(`/api/public-replays/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-faultline-delete-token': deleteToken },
        signal: timedSignal.signal,
      })
      if (!response.ok) throw await readError(response)
    } finally {
      timedSignal.cleanup()
    }
  }

  private async request(path: string, init?: RequestInit) {
    const url = `${this.apiBase}${path}`
    if (typeof fetch === 'function') {
      try {
        return await fetch(url, init)
      } catch {
        throw asError('unavailable', 'The replay service is unavailable.')
      }
    }
    try {
      return await xhrRequest(url, init)
    } catch {
      throw asError('unavailable', 'The replay service is unavailable.')
    }
  }
}

function signalWithTimeout(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, Math.max(1, timeoutMs))

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parent?.removeEventListener('abort', abort)
    },
  }
}

function xhrRequest(url: string, init?: RequestInit): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const signal = init?.signal
    const cleanup = () => signal?.removeEventListener('abort', abort)
    const abort = () => request.abort()
    request.open(init?.method ?? 'GET', url)
    const headers = init?.headers
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      Object.entries(headers as Record<string, string>).forEach(([key, value]) => {
        request.setRequestHeader(key, value)
      })
    }
    request.onload = () => {
      cleanup()
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        json: async () => JSON.parse(request.responseText) as unknown,
      })
    }
    request.onerror = () => {
      cleanup()
      reject(new TypeError('Network request failed'))
    }
    request.onabort = () => {
      cleanup()
      reject(new DOMException('Request aborted', 'AbortError'))
    }
    if (signal?.aborted) {
      cleanup()
      reject(new DOMException('Request aborted', 'AbortError'))
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    request.send(typeof init?.body === 'string' ? init.body : null)
  })
}
