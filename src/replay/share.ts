import { createReplayAttempt } from './recorder'
import { serializeReplayEnvelope } from './serialization'
import type { ReplayInitialStateV1 } from './types'

export interface ScenarioSnapshotInput {
  challengeId: string
  initial: ReplayInitialStateV1
  timestamp?: string
}

/**
 * Live architecture shares use the same validated envelope as saved attempts.
 * This keeps topology and capacity data on one import/export path.
 */
export function serializeScenarioSnapshot({
  challengeId,
  initial,
  timestamp = new Date().toISOString(),
}: ScenarioSnapshotInput) {
  const attempt = createReplayAttempt({
    id: `snapshot-${timestamp}`,
    challengeId,
    startedAt: timestamp,
    initial,
  })
  return serializeReplayEnvelope(attempt, { redactAnswers: true, pretty: true })
}
