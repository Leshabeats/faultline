import { createReplayAttempt, recordReplayEvent } from './recorder'
import type {
  ReplayArchitectureV1,
  ReplayAttemptV1,
  ReplayEventDraftV1,
} from './types'

export const testArchitecture: ReplayArchitectureV1 = {
  nodes: [
    {
      id: 'client',
      type: 'system',
      position: { x: 10, y: 20 },
      data: { kind: 'client', label: 'Clients' },
    },
    {
      id: 'database',
      type: 'system',
      position: { x: 500, y: 20 },
      data: { kind: 'database', label: 'Primary DB' },
    },
  ],
  edges: [
    {
      id: 'client-database',
      type: 'traffic',
      source: 'client',
      target: 'database',
    },
  ],
}

export const timestamp = '2026-08-03T10:00:00.000Z'

export function createTestAttempt(): ReplayAttemptV1 {
  return createReplayAttempt({
    id: 'attempt-1',
    challengeId: 'url-shortener',
    startedAt: timestamp,
    initial: {
      architecture: testArchitecture,
      load: 1,
      fault: 'none',
    },
  })
}

export const event = <T extends ReplayEventDraftV1>(value: T): T => value

export function createCompletedTestAttempt(): ReplayAttemptV1 {
  let attempt = createTestAttempt()
  attempt = recordReplayEvent(
    attempt,
    event({
      id: 'load-10',
      atMs: 0,
      source: 'user',
      type: 'load.changed',
      timeline: {
        title: 'Load increased to 10x',
        detail: '100k req/s offered',
        tone: 'warning',
      },
      payload: { load: 10 },
    }),
    '2026-08-03T10:00:01.000Z',
  )
  attempt = recordReplayEvent(
    attempt,
    event({
      id: 'answer-1',
      atMs: 2_000,
      source: 'user',
      type: 'answer.submitted',
      payload: {
        answer: 'Use request coalescing and a bounded stale cache.',
        prompt: 'How do you protect the database?',
        feedback: 'Good protection.',
      },
    }),
    '2026-08-03T10:00:03.000Z',
  )
  attempt = recordReplayEvent(
    attempt,
    event({
      id: 'submit-1',
      atMs: 4_000,
      source: 'user',
      type: 'design.submitted',
      timeline: {
        title: 'Design submitted',
        detail: '82/100',
        tone: 'healthy',
      },
      payload: {
        submission: {
          judgeVersion: 'url-shortener-v1',
          score: 82,
          maxScore: 100,
          passed: false,
          passedCases: 4,
          totalCases: 5,
        },
      },
    }),
    '2026-08-03T10:00:05.000Z',
  )
  return {
    ...attempt,
    summary: {
      score: 82,
      maxScore: 100,
      passed: false,
      keyMoment: {
        atMs: 0,
        eventId: 'load-10',
        title: 'Database saturated',
        detail: 'The first critical state appeared at 100k req/s.',
        tone: 'critical',
      },
    },
  }
}
