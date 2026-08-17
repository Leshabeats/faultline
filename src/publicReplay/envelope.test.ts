import { describe, expect, it } from 'vitest'
import { createCompletedTestAttempt } from '../replay/testFixtures'
import { serializeReplayEnvelope } from '../replay'
import {
  createPublicReplayEnvelope,
  hasPrivateInterviewContent,
  parsePublicReplayEnvelope,
  previewPublicReplay,
} from './envelope'
import { PUBLIC_REPLAY_SCHEMA } from './types'

describe('public replay envelope', () => {
  it('redacts interviewer answers before publication', () => {
    const attempt = createCompletedTestAttempt()
    expect(hasPrivateInterviewContent(attempt)).toBe(true)

    const envelope = createPublicReplayEnvelope(attempt, '2026-08-17T10:00:00.000Z')
    expect(envelope.schema).toBe(PUBLIC_REPLAY_SCHEMA)
    expect(hasPrivateInterviewContent(envelope.replay.attempt)).toBe(false)
    expect(JSON.stringify(envelope)).not.toContain('Use request coalescing')
    expect(JSON.stringify(envelope)).not.toContain('How do you protect the database')
    expect(JSON.stringify(envelope)).not.toContain('Good protection.')
  })

  it('rejects an unredacted public payload', () => {
    const attempt = createCompletedTestAttempt()
    const result = parsePublicReplayEnvelope({
      schema: PUBLIC_REPLAY_SCHEMA,
      version: 1,
      publishedAt: '2026-08-17T10:00:00.000Z',
      replay: JSON.parse(serializeReplayEnvelope(attempt)),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('private-content')
  })

  it('previews only the fields that become public', () => {
    const preview = previewPublicReplay(createCompletedTestAttempt())
    expect(preview.answersRedacted).toBe(true)
    expect(preview.submitted).toBe(true)
    expect(preview.includes).toContain('architecture')
    expect(preview.excludes).toContain('interviewer-answers')
  })
})
