import { describe, expect, it } from 'vitest'
import { createCompletedTestAttempt } from '../replay/testFixtures'
import { playReplayAt } from '../replay'
import { presentReplayFrame } from '../replay/presentation'
import { createPublicReplayEnvelope } from './envelope'

describe('public replay presentation', () => {
  it('rebuilds architecture from a redacted public envelope', () => {
    const envelope = createPublicReplayEnvelope(createCompletedTestAttempt())
    const frame = playReplayAt(envelope.replay.attempt, 0)
    const presented = presentReplayFrame(frame, 0, true, 'url-shortener', 'en')
    expect(presented.nodes.map((node) => node.id)).toEqual(['client', 'database'])
    expect(presented.edges.map((edge) => edge.id)).toEqual(['client-database'])
    expect(JSON.stringify(envelope)).not.toContain('Use request coalescing')
  })
})
