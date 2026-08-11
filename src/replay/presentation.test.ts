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

  it('presents the exact replayed connection as partitioned', () => {
    const attempt = createReplayAttempt({
      id: 'targeted-presentation',
      challengeId: 'url-shortener',
      startedAt: '2026-08-03T10:00:00.000Z',
      initial: toReplayInitial(
        seedNodes,
        seedEdges,
        1,
        'network-partition',
        undefined,
        { type: 'edge', id: 'api-cache' },
      ),
    })

    const presentation = presentReplayFrame(playReplayAt(attempt, 0), 0, false)
    const target = presentation.edges.find((edge) => edge.id === 'api-cache')

    expect(target?.data).toMatchObject({
      tone: 'critical',
      paused: true,
      faultRole: 'source',
    })
    expect(presentation.faultImpact.target)
      .toEqual({ type: 'edge', id: 'api-cache' })
  })

  it('presents the exact replayed replica loss on its source node', () => {
    const replicatedNodes = seedNodes.map((node) => node.id === 'api'
      ? { ...node, data: { ...node.data, replicas: 2 } }
      : node)
    const attempt = createReplayAttempt({
      id: 'targeted-node-presentation',
      challengeId: 'url-shortener',
      startedAt: '2026-08-03T10:00:00.000Z',
      initial: toReplayInitial(
        replicatedNodes,
        seedEdges,
        1,
        'component-outage',
        undefined,
        { type: 'node', id: 'api' },
      ),
    })

    const presentation = presentReplayFrame(playReplayAt(attempt, 0), 0, false)
    expect(presentation.nodes.find((node) => node.id === 'api')?.data)
      .toMatchObject({
        health: 'degraded',
        detail: 'One replica offline',
        faultRole: 'source',
        lostReplicas: 1,
      })
  })

  it('replays a Redis outage through the direct database fallback', () => {
    const attempt = createReplayAttempt({
      id: 'cache-fallback-presentation',
      challengeId: 'url-shortener',
      startedAt: '2026-08-03T10:00:00.000Z',
      initial: toReplayInitial(
        seedNodes,
        seedEdges,
        1,
        'component-outage',
        undefined,
        { type: 'node', id: 'cache' },
      ),
    })

    const presentation = presentReplayFrame(playReplayAt(attempt, 0), 0, false)

    expect(presentation.faultImpact.summary?.routeDisconnected).toBe(false)
    expect(presentation.nodes.find(({ id }) => id === 'cache')?.data)
      .toMatchObject({ health: 'failed', detail: 'Instance offline' })
    expect(presentation.nodes.find(({ id }) => id === 'api')?.data)
      .toMatchObject({ health: 'healthy' })
    expect(presentation.nodes.find(({ id }) => id === 'database')?.data)
      .toMatchObject({ health: 'healthy' })
    expect(presentation.nodes.filter((node) => node.data.faultRole === 'isolated'))
      .toHaveLength(0)
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

  it('renders a Russian-recorded event in English from its semantic payload', () => {
    const attempt = createTestAttempt()
    attempt.events = [{
      id: 'ru-load',
      atMs: 0,
      sequence: 0,
      source: 'user',
      type: 'load.changed',
      payload: { load: 3 },
      timeline: {
        title: 'Целевая нагрузка: 3×',
        detail: 'Подано 30k запросов/с',
        tone: 'healthy',
      },
    }]

    expect(replayTimelineEvents(attempt, 'en')[0]).toMatchObject({
      title: 'Target load: 3×',
      detail: '30k req/s offered',
    })
  })

  it('localizes the generated label of an added component', () => {
    const attempt = createTestAttempt()
    attempt.events = [{
      id: 'ru-node',
      atMs: 0,
      sequence: 0,
      source: 'user',
      type: 'node.added',
      payload: {
        node: {
          id: 'service-2',
          type: 'system',
          position: { x: 20, y: 40 },
          data: { kind: 'service', label: 'Сервис 2' },
        },
      },
      timeline: {
        title: 'Сервис 2: компонент добавлен',
        detail: 'Подключите компонент, чтобы изменить модель',
        tone: 'healthy',
      },
    }]

    expect(replayTimelineEvents(attempt, 'en')[0]).toMatchObject({
      title: 'Component added',
      detail: 'Service 2',
    })
  })
})
