import type {
  CapacityTuning,
  ComponentKind,
  FaultMode,
  LoadMultiplier,
} from '../domain/system'

export const REPLAY_SCHEMA = 'faultline.replay' as const
export const REPLAY_SCHEMA_VERSION = 1 as const

export type ReplayLoadMultiplier = LoadMultiplier
export type ReplayEventSource = 'user' | 'system' | 'interviewer'

export interface ReplayPositionV1 {
  x: number
  y: number
}

export interface ReplayNodeDataV1 {
  kind: ComponentKind
  label: string
  replicas?: number
  shards?: number
}

/** Serializable subset of a React Flow system node. */
export interface ReplayNodeV1 {
  id: string
  type: 'system'
  position: ReplayPositionV1
  data: ReplayNodeDataV1
}

/** Serializable subset of a React Flow traffic edge. */
export interface ReplayEdgeV1 {
  id: string
  type: 'traffic'
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface ReplayArchitectureV1 {
  nodes: ReplayNodeV1[]
  edges: ReplayEdgeV1[]
}

export interface ReplayInitialStateV1 {
  architecture: ReplayArchitectureV1
  load: ReplayLoadMultiplier
  fault: FaultMode
  capacity?: CapacityTuning
}

export interface ReplaySubmissionSummaryV1 {
  judgeVersion: string
  score: number
  maxScore: number
  passed: boolean
  passedCases: number
  totalCases: number
}

export type ReplayTimelineTone =
  | 'neutral'
  | 'healthy'
  | 'warning'
  | 'critical'

export interface ReplayEventMetadataV1 {
  title: string
  detail: string
  tone: ReplayTimelineTone
}

export interface ReplayKeyMomentV1 extends ReplayEventMetadataV1 {
  atMs: number
  eventId?: string
}

export interface ReplayAttemptSummaryV1 {
  score: number
  maxScore: number
  passed: boolean
  keyMoment?: ReplayKeyMomentV1
}

interface ReplayEventBaseV1 {
  id: string
  /** Milliseconds since the attempt started. */
  atMs: number
  /** Monotonic tie-breaker for events recorded at the same millisecond. */
  sequence: number
  source: ReplayEventSource
  timeline?: ReplayEventMetadataV1
}

export interface ReplayLoadChangedEventV1 extends ReplayEventBaseV1 {
  type: 'load.changed'
  payload: { load: ReplayLoadMultiplier }
}

export interface ReplayFaultChangedEventV1 extends ReplayEventBaseV1 {
  type: 'fault.changed'
  payload: { fault: FaultMode; targetNodeId?: string }
}

export interface ReplayCapacityChangedEventV1 extends ReplayEventBaseV1 {
  type: 'capacity.changed'
  payload: { capacity: CapacityTuning }
}

export interface ReplayNodeAddedEventV1 extends ReplayEventBaseV1 {
  type: 'node.added'
  payload: { node: ReplayNodeV1 }
}

export interface ReplayNodeUpdatedEventV1 extends ReplayEventBaseV1 {
  type: 'node.updated'
  payload: {
    nodeId: string
    patch: {
      position?: ReplayPositionV1
      data?: Partial<ReplayNodeDataV1>
    }
  }
}

export interface ReplayNodeRemovedEventV1 extends ReplayEventBaseV1 {
  type: 'node.removed'
  payload: { nodeId: string }
}

export interface ReplayEdgeAddedEventV1 extends ReplayEventBaseV1 {
  type: 'edge.added'
  payload: { edge: ReplayEdgeV1 }
}

export interface ReplayEdgeUpdatedEventV1 extends ReplayEventBaseV1 {
  type: 'edge.updated'
  payload: {
    edgeId: string
    patch: {
      source?: string
      target?: string
      sourceHandle?: string | null
      targetHandle?: string | null
    }
  }
}

export interface ReplayEdgeRemovedEventV1 extends ReplayEventBaseV1 {
  type: 'edge.removed'
  payload: { edgeId: string }
}

/** A full checkpoint used by import, reset, and future collaborative edits. */
export interface ReplayArchitectureReplacedEventV1 extends ReplayEventBaseV1 {
  type: 'architecture.replaced'
  payload: { architecture: ReplayArchitectureV1 }
}

export interface ReplayAnswerSubmittedEventV1 extends ReplayEventBaseV1 {
  type: 'answer.submitted'
  payload: {
    answer: string
    prompt?: string
    feedback?: string
    focus?: string
  }
}

export interface ReplayDesignSubmittedEventV1 extends ReplayEventBaseV1 {
  type: 'design.submitted'
  payload: { submission: ReplaySubmissionSummaryV1 }
}

export type ReplayEventV1 =
  | ReplayLoadChangedEventV1
  | ReplayFaultChangedEventV1
  | ReplayCapacityChangedEventV1
  | ReplayNodeAddedEventV1
  | ReplayNodeUpdatedEventV1
  | ReplayNodeRemovedEventV1
  | ReplayEdgeAddedEventV1
  | ReplayEdgeUpdatedEventV1
  | ReplayEdgeRemovedEventV1
  | ReplayArchitectureReplacedEventV1
  | ReplayAnswerSubmittedEventV1
  | ReplayDesignSubmittedEventV1

type WithoutRecordingMetadata<T> = T extends ReplayEventV1
  ? Omit<T, 'sequence'>
  : never

export type ReplayEventDraftV1 = WithoutRecordingMetadata<ReplayEventV1>

export interface ReplayAttemptV1 {
  id: string
  challengeId: string
  startedAt: string
  updatedAt: string
  durationMs: number
  initial: ReplayInitialStateV1
  events: ReplayEventV1[]
  summary?: ReplayAttemptSummaryV1
}

export interface ReplayEnvelopeV1 {
  schema: typeof REPLAY_SCHEMA
  version: typeof REPLAY_SCHEMA_VERSION
  exportedAt: string
  attempt: ReplayAttemptV1
}

export interface ReplayAnswerV1 {
  eventId: string
  atMs: number
  answer: string
  prompt?: string
  feedback?: string
  focus?: string
}

export interface ReplaySubmissionV1 extends ReplaySubmissionSummaryV1 {
  eventId: string
  atMs: number
}

export interface ReplayPlaybackStateV1 extends ReplayInitialStateV1 {
  currentTimeMs: number
  appliedEventIds: string[]
  answers: ReplayAnswerV1[]
  submissions: ReplaySubmissionV1[]
}
