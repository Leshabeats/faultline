import { describe, expect, it, vi } from 'vitest'
import type { InterviewProvider, InterviewRequest } from './types'
import { InterviewRouter } from './router'

const request: InterviewRequest = {
  action: 'answer',
  answer: 'Use request coalescing and serve stale data with bounded concurrency.',
  context: {
    scenario: 'url-shortener',
    loadMultiplier: 10,
    fault: 'cache-outage',
    metrics: {
      throughput: 100_000,
      p99: 842,
      errorRate: 12.4,
      dbCpu: 96,
      cacheMiss: 82,
      queueDepth: 4_800,
    },
    nodeLabels: ['Short Link API', 'Redis', 'Primary DB'],
    edgeCount: 2,
    recentEvents: [],
  },
}

describe('InterviewRouter', () => {
  it('uses the local provider as a provider-neutral fallback', async () => {
    const router = new InterviewRouter()
    const explicitLocal = await router.respond(request, 'local')

    await expect(router.respond(request, 'future-provider')).resolves.toEqual(
      explicitLocal,
    )
  })

  it('can register a future OpenAI-like provider and forwards the request unchanged', async () => {
    const provider: InterviewProvider = {
      id: 'compatible',
      label: 'Compatible API',
      respond: vi.fn(async () => ({
        message: 'remote',
        prompt: 'remote prompt',
        focus: 'remote',
      })),
    }
    const router = new InterviewRouter().register(provider)

    await expect(router.respond(request, 'compatible')).resolves.toMatchObject({
      message: 'remote',
    })
    expect(provider.respond).toHaveBeenCalledOnce()
    expect(provider.respond).toHaveBeenCalledWith(request)
  })

  it('allows a compatible provider to replace the local fallback explicitly', async () => {
    const localReplacement: InterviewProvider = {
      id: 'local',
      label: 'Offline interview fixture',
      respond: vi.fn(async () => ({
        message: 'offline fallback',
        prompt: 'offline prompt',
        focus: 'fallback',
      })),
    }
    const router = new InterviewRouter([]).register(localReplacement)

    await expect(router.respond(request, 'missing-provider')).resolves.toMatchObject(
      {
        message: 'offline fallback',
      },
    )
    expect(localReplacement.respond).toHaveBeenCalledWith(request)
  })

  it('replaces duplicate provider ids instead of exposing ambiguous routes', async () => {
    const first: InterviewProvider = {
      id: 'compatible',
      label: 'First compatible provider',
      respond: vi.fn(async () => ({
        message: 'first',
        prompt: 'first',
        focus: 'first',
      })),
    }
    const replacement: InterviewProvider = {
      id: 'compatible',
      label: 'Replacement provider',
      respond: vi.fn(async () => ({
        message: 'replacement',
        prompt: 'replacement',
        focus: 'replacement',
      })),
    }
    const router = new InterviewRouter([first]).register(replacement)

    await expect(router.respond(request, 'compatible')).resolves.toMatchObject({
      message: 'replacement',
    })
    expect(first.respond).not.toHaveBeenCalled()
    expect(router.listProviders()).toEqual([
      { id: 'compatible', label: 'Replacement provider' },
    ])
  })

  it('fails clearly when neither the requested provider nor a local fallback exists', async () => {
    await expect(
      new InterviewRouter([]).respond(request, 'missing-provider'),
    ).rejects.toThrow('No interview provider is registered')
  })
})
