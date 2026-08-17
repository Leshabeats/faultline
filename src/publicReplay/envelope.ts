import {
  parseReplayEnvelope,
  redactReplayAnswers,
  type ReplayAttemptV1,
  type ReplayEnvelopeV1,
} from '../replay'
import {
  PUBLIC_REPLAY_SCHEMA,
  PUBLIC_REPLAY_SCHEMA_VERSION,
  REDACTED_INTERVIEW_ANSWER,
  type PublicReplayEnvelopeV1,
  type PublicReplayError,
  type PublicReplayPreview,
} from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))

export function interviewAnswerIsPublic(value: string) {
  return value === REDACTED_INTERVIEW_ANSWER
}

export function hasPrivateInterviewContent(attempt: ReplayAttemptV1) {
  return attempt.events.some((event) => {
    if (event.type !== 'answer.submitted') return false
    return (
      !interviewAnswerIsPublic(event.payload.answer) ||
      event.payload.prompt !== undefined ||
      event.payload.feedback !== undefined ||
      event.payload.focus !== undefined ||
      event.timeline !== undefined
    )
  })
}

export function redactPublicReplayAnswers(envelope: ReplayEnvelopeV1): ReplayEnvelopeV1 {
  const redacted = redactReplayAnswers(envelope)
  return {
    ...redacted,
    attempt: {
      ...redacted.attempt,
      events: redacted.attempt.events.map((event) => {
        if (event.type !== 'answer.submitted') return event
        return {
          ...event,
          timeline: undefined,
          payload: {
            answer: REDACTED_INTERVIEW_ANSWER,
          },
        }
      }),
    },
  }
}

export function createPublicReplayEnvelope(
  attempt: ReplayAttemptV1,
  publishedAt = new Date().toISOString(),
): PublicReplayEnvelopeV1 {
  const serialized = JSON.stringify(redactPublicReplayAnswers({
    schema: 'faultline.replay',
    version: 1,
    exportedAt: attempt.updatedAt,
    attempt,
  }))
  const parsed = parseReplayEnvelope(serialized)
  if (!parsed.ok) {
    throw new TypeError(parsed.error.message)
  }
  if (hasPrivateInterviewContent(parsed.value.attempt)) {
    throw new TypeError('Public replay still contains interviewer answers.')
  }
  return {
    schema: PUBLIC_REPLAY_SCHEMA,
    version: PUBLIC_REPLAY_SCHEMA_VERSION,
    publishedAt,
    replay: parsed.value,
  }
}

export function parsePublicReplayEnvelope(
  value: unknown,
): { ok: true; value: PublicReplayEnvelopeV1 } | { ok: false; error: PublicReplayError } {
  if (typeof value === 'string') {
    if (value.length > 1_100_000) {
      return {
        ok: false,
        error: { code: 'too-large', message: 'Public replay is larger than the safe limit.' },
      }
    }
    try {
      return parsePublicReplayEnvelope(JSON.parse(value) as unknown)
    } catch {
      return {
        ok: false,
        error: { code: 'invalid-json', message: 'Public replay is not valid JSON.' },
      }
    }
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      error: { code: 'invalid-replay', message: 'JSON does not contain a public Faultline replay.' },
    }
  }

  if (value.schema === PUBLIC_REPLAY_SCHEMA && value.version !== PUBLIC_REPLAY_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'unsupported-version',
        message: `Public replay version ${String(value.version)} is not supported.`,
      },
    }
  }

  if (
    value.schema !== PUBLIC_REPLAY_SCHEMA ||
    value.version !== PUBLIC_REPLAY_SCHEMA_VERSION ||
    !isIsoDate(value.publishedAt) ||
    !isRecord(value.replay)
  ) {
    return {
      ok: false,
      error: { code: 'invalid-replay', message: 'JSON does not contain a public Faultline replay.' },
    }
  }

  const parsed = parseReplayEnvelope(JSON.stringify(value.replay))
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: parsed.error.code === 'unsupported-version' ? 'unsupported-version' : parsed.error.code,
        message: parsed.error.message,
      },
    }
  }
  if (hasPrivateInterviewContent(parsed.value.attempt)) {
    return {
      ok: false,
      error: {
        code: 'private-content',
        message: 'Public replay still contains interviewer answers.',
      },
    }
  }

  return {
    ok: true,
    value: {
      schema: PUBLIC_REPLAY_SCHEMA,
      version: PUBLIC_REPLAY_SCHEMA_VERSION,
      publishedAt: value.publishedAt,
      replay: parsed.value,
    },
  }
}

export function previewPublicReplay(attempt: ReplayAttemptV1): PublicReplayPreview {
  const envelope = createPublicReplayEnvelope(attempt)
  const publicAttempt = envelope.replay.attempt
  return {
    challengeId: publicAttempt.challengeId,
    nodeCount: publicAttempt.initial.architecture.nodes.length,
    edgeCount: publicAttempt.initial.architecture.edges.length,
    eventCount: publicAttempt.events.length,
    durationMs: publicAttempt.durationMs,
    submitted: publicAttempt.events.some((event) => event.type === 'design.submitted'),
    answersRedacted: !hasPrivateInterviewContent(publicAttempt),
    includes: [
      'challenge',
      'architecture',
      'load-and-faults',
      'capacity-tuning',
      'event-timeline',
      'submission-summary',
    ],
    excludes: [
      'interviewer-answers',
      'interviewer-prompts',
      'interviewer-feedback',
      'answer-metadata',
      'api-keys',
    ],
  }
}

export function toRedactedReplayEnvelope(attempt: ReplayAttemptV1): ReplayEnvelopeV1 {
  return redactPublicReplayAnswers({
    schema: 'faultline.replay',
    version: 1,
    exportedAt: attempt.updatedAt,
    attempt,
  })
}
