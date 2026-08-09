import { describe, expect, it } from 'vitest'
import { seedEdges, seedNodes } from '../canvas/seed'
import { createReplayAttempt, recordReplayEvent } from './recorder'
import { playReplayAt } from './reducer'
import { presentReplayFrame, replayKeyMoment, replayTimelineEvents, toReplayInitial } from './presentation'
import { createTestAttempt } from './testFixtures'

describe('replay presentation', () => {
  it('recomputes health and edge decoration without persisting derived state', () => {
    let attempt = createReplayAttempt({
      id: 'presentation-attempt',
      challengeId: 'url-shortener',
      startedAt: '2026-08-03T10:00:00.000Z',
      initial: toReplayInitial(seedNodes, seedEdges, 10, 'cache-outage'),
    })
    attempt = recordReplayEvent(attempt, {
      id: 'lower-load',
      atMs: 0,
      source: 'user',
      type: 'load.changed',
      payload: { load: 1 },
    })

    const frame = playReplayAt(attempt, 0)
    const presentation = presentReplayFrame(frame, 0, true)
    const redis = presentation.nodes.find((node) => node.id === 'cache')
    const databaseEdge = presentation.edges.find((edge) => edge.id === 'cache-database')

    expect(redis?.data).toMatchObject({ health: 'failed', detail: 'Unavailable', load: 1 })
    expect(databaseEdge?.data).toMatchObject({ tone: 'warning', intensity: 1, paused: true })
    expect(attempt.initial.architecture.nodes[0].data).toEqual({
      kind: 'client',
      label: 'Clients',
    })
  })

  it('sorts imported timeline events independently from their JSON order', () => {
    const attempt = createTestAttempt()
    attempt.events = [
      {
        id: 'late', atMs: 1000, sequence: 1, source: 'user', type: 'load.changed',
        payload: { load: 10 }, timeline: { title: 'Late', detail: 'Second', tone: 'warning' },
      },
      {
        id: 'early', atMs: 0, sequence: 0, source: 'user', type: 'load.changed',
        payload: { load: 1 }, timeline: { title: 'Early', detail: 'First', tone: 'healthy' },
      },
    ]
    attempt.durationMs = 1000

    expect(replayTimelineEvents(attempt).map((event) => event.id)).toEqual(['early', 'late'])
  })

  it('describes an initial failure without inventing a later causal event', () => {
    const attempt = createTestAttempt()
    attempt.initial.fault = 'cache-outage'
    attempt.events = []

    expect(replayKeyMoment(attempt)).toBe('Attempt started with Redis unavailable')
    expect(replayKeyMoment(attempt, 'ru')).toBe('Попытка началась при недоступном Redis')
  })

  it('localizes metadata from previously saved English replays at presentation time', () => {
    const attempt = createTestAttempt()
    attempt.summary = {
      score: 76,
      maxScore: 100,
      passed: false,
      keyMoment: {
        title: 'Attempt started with Redis unavailable',
        detail: 'This failure was already active in the initial state.',
        tone: 'critical',
        atMs: 0,
      },
    }

    expect(replayKeyMoment(attempt, 'ru')).toBe('Попытка началась при недоступном Redis')
  })
})
