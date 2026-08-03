import { compareReplayEvents, cloneInitialReplayState } from './reducer'
import {
  REPLAY_SCHEMA,
  REPLAY_SCHEMA_VERSION,
  type ReplayAttemptV1,
  type ReplayEnvelopeV1,
  type ReplayEventDraftV1,
  type ReplayEventV1,
  type ReplayInitialStateV1,
} from './types'

export interface CreateReplayAttemptInput {
  id: string
  challengeId: string
  startedAt: string
  initial: ReplayInitialStateV1
}

export function createReplayAttempt(
  input: CreateReplayAttemptInput,
): ReplayAttemptV1 {
  return {
    id: input.id,
    challengeId: input.challengeId,
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    durationMs: 0,
    initial: cloneInitialReplayState(input.initial),
    events: [],
  }
}

export function recordReplayEvent(
  attempt: ReplayAttemptV1,
  draft: ReplayEventDraftV1,
  updatedAt = attempt.updatedAt,
): ReplayAttemptV1 {
  if (attempt.events.length === 0 && draft.atMs !== 0) {
    throw new RangeError('The first replay event must anchor the timeline at 0ms.')
  }
  const nextSequence = attempt.events.reduce(
    (highest, event) => Math.max(highest, event.sequence + 1),
    0,
  )
  const event = { ...draft, sequence: nextSequence } as ReplayEventV1

  return {
    ...attempt,
    updatedAt,
    durationMs: Math.max(attempt.durationMs, event.atMs),
    initial: cloneInitialReplayState(attempt.initial),
    events: [...attempt.events, event].sort(compareReplayEvents),
  }
}

export function createReplayEnvelope(
  attempt: ReplayAttemptV1,
  exportedAt = attempt.updatedAt,
): ReplayEnvelopeV1 {
  return {
    schema: REPLAY_SCHEMA,
    version: REPLAY_SCHEMA_VERSION,
    exportedAt,
    attempt: {
      ...attempt,
      initial: cloneInitialReplayState(attempt.initial),
      events: [...attempt.events].sort(compareReplayEvents),
    },
  }
}
