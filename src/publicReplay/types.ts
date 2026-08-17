import type { ReplayEnvelopeV1 } from '../replay'

export const PUBLIC_REPLAY_SCHEMA = 'faultline.public-replay' as const
export const PUBLIC_REPLAY_SCHEMA_VERSION = 1 as const
export const REDACTED_INTERVIEW_ANSWER = '[redacted]' as const

export interface PublicReplayEnvelopeV1 {
  schema: typeof PUBLIC_REPLAY_SCHEMA
  version: typeof PUBLIC_REPLAY_SCHEMA_VERSION
  publishedAt: string
  replay: ReplayEnvelopeV1
}

export type PublicReplayErrorCode =
  | 'too-large'
  | 'invalid-json'
  | 'unsupported-version'
  | 'invalid-replay'
  | 'private-content'
  | 'not-found'
  | 'unauthorized'
  | 'rate-limited'
  | 'unavailable'

export interface PublicReplayError {
  code: PublicReplayErrorCode
  message: string
}

export interface PublishReplayResult {
  id: string
  url: string
  deleteToken: string
}

export interface PublicReplayRecord {
  id: string
  createdAt: string
  envelope: PublicReplayEnvelopeV1
}

export interface PublicReplayPreview {
  challengeId: string
  nodeCount: number
  edgeCount: number
  eventCount: number
  durationMs: number
  submitted: boolean
  answersRedacted: boolean
  includes: string[]
  excludes: string[]
}

export interface StoredReplayCapability {
  publicId: string
  attemptId: string
  url: string
  deleteToken: string
  publishedAt: string
}
