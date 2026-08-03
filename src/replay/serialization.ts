import type { CapacityTuning, ComponentKind, FaultMode } from '../domain/system'
import { cloneInitialReplayState } from './reducer'
import {
  REPLAY_SCHEMA,
  REPLAY_SCHEMA_VERSION,
  type ReplayArchitectureV1,
  type ReplayAttemptSummaryV1,
  type ReplayAttemptV1,
  type ReplayEdgeV1,
  type ReplayEnvelopeV1,
  type ReplayEventV1,
  type ReplayLoadMultiplier,
  type ReplayNodeV1,
  type ReplaySubmissionSummaryV1,
} from './types'

export const REPLAY_IMPORT_LIMITS = {
  maxSerializedCharacters: 1_000_000,
  maxEvents: 500,
  maxNodes: 100,
  maxEdges: 250,
  maxStringCharacters: 20_000,
} as const

export type ReplayImportErrorCode =
  | 'too-large'
  | 'invalid-json'
  | 'unsupported-version'
  | 'invalid-replay'

export type ReplayImportResult =
  | {
      ok: true
      value: ReplayEnvelopeV1
      migrated: boolean
      warnings: string[]
    }
  | {
      ok: false
      error: { code: ReplayImportErrorCode; message: string }
    }

const componentKinds: ComponentKind[] = [
  'client',
  'gateway',
  'service',
  'cache',
  'queue',
  'database',
  'region',
]
const faultModes: FaultMode[] = [
  'none',
  'cache-outage',
  'slow-database',
  'network-partition',
  'retry-storm',
]
const loads: ReplayLoadMultiplier[] = [1, 3, 10]
const cacheHitRates = [0.9, 0.95, 0.99]
const poolSizes = [100, 300, 600]
const readReplicaCounts = [0, 1, 2]
const databaseProfiles = ['compact', 'balanced', 'performance']
const pricingPackIds = ['reference-2026.08', 'aws-us-east-1-2026.07']
const benchmarkPackIds = ['reference-2026.08', 'local-m1-pro-2026.08']
const sources = ['user', 'system', 'interviewer'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) => Object.keys(value).every((key) => allowedKeys.includes(key))

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && isFiniteNumber(value) && value >= 0

const isBoundedString = (
  value: unknown,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): value is string =>
  typeof value === 'string' &&
  value.length <= REPLAY_IMPORT_LIMITS.maxStringCharacters &&
  (allowEmpty || value.length > 0)

const isOptionalBoundedString = (value: unknown) =>
  value === undefined || isBoundedString(value, { allowEmpty: true })

const isLoad = (value: unknown): value is ReplayLoadMultiplier =>
  loads.includes(value as ReplayLoadMultiplier)

const isFault = (value: unknown): value is FaultMode =>
  faultModes.includes(value as FaultMode)

const isCapacityTuning = (value: unknown) =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'cacheHitRate',
    'indexedLookup',
    'poolSize',
    'readReplicas',
    'databaseProfile',
    'pricingPackId',
    'benchmarkPackId',
  ]) &&
  cacheHitRates.includes(value.cacheHitRate as number) &&
  typeof value.indexedLookup === 'boolean' &&
  poolSizes.includes(value.poolSize as number) &&
  readReplicaCounts.includes(value.readReplicas as number) &&
  databaseProfiles.includes(value.databaseProfile as string) &&
  (value.pricingPackId === undefined || pricingPackIds.includes(value.pricingPackId as string)) &&
  (value.benchmarkPackId === undefined || benchmarkPackIds.includes(value.benchmarkPackId as string))

const isIsoDate = (value: unknown): value is string =>
  isBoundedString(value) && Number.isFinite(Date.parse(value))

const isPosition = (value: unknown) =>
  isRecord(value) &&
  hasOnlyKeys(value, ['x', 'y']) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y)

const isNodeData = (value: unknown): value is ReplayNodeV1['data'] =>
  isRecord(value) &&
  hasOnlyKeys(value, ['kind', 'label']) &&
  componentKinds.includes(value.kind as ComponentKind) &&
  isBoundedString(value.label)

const isPartialNodeData = (value: unknown) => {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, ['kind', 'label']) &&
    (value.kind === undefined || componentKinds.includes(value.kind as ComponentKind)) &&
    (value.label === undefined || isBoundedString(value.label))
  )
}

const isNode = (value: unknown): value is ReplayNodeV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, ['id', 'type', 'position', 'data']) &&
  isBoundedString(value.id) &&
  value.type === 'system' &&
  isPosition(value.position) &&
  isNodeData(value.data)

const isHandle = (value: unknown) =>
  value === undefined || value === null || isBoundedString(value)

const isEdge = (value: unknown): value is ReplayEdgeV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'id',
    'type',
    'source',
    'target',
    'sourceHandle',
    'targetHandle',
  ]) &&
  isBoundedString(value.id) &&
  value.type === 'traffic' &&
  isBoundedString(value.source) &&
  isBoundedString(value.target) &&
  isHandle(value.sourceHandle) &&
  isHandle(value.targetHandle)

const isArchitecture = (value: unknown): value is ReplayArchitectureV1 => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['nodes', 'edges']) ||
    !Array.isArray(value.nodes) ||
    value.nodes.length > REPLAY_IMPORT_LIMITS.maxNodes ||
    !value.nodes.every(isNode) ||
    new Set(value.nodes.map((node: ReplayNodeV1) => node.id)).size !== value.nodes.length ||
    !Array.isArray(value.edges) ||
    value.edges.length > REPLAY_IMPORT_LIMITS.maxEdges ||
    !value.edges.every(isEdge) ||
    new Set(value.edges.map((edge: ReplayEdgeV1) => edge.id)).size !== value.edges.length
  ) {
    return false
  }
  const nodeIds = new Set(value.nodes.map((node: ReplayNodeV1) => node.id))
  return value.edges.every(
    (edge: ReplayEdgeV1) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  )
}

const isSubmission = (value: unknown): value is ReplaySubmissionSummaryV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'judgeVersion',
    'score',
    'maxScore',
    'passed',
    'passedCases',
    'totalCases',
  ]) &&
  isBoundedString(value.judgeVersion) &&
  isNonNegativeInteger(value.score) &&
  isNonNegativeInteger(value.maxScore) &&
  value.score <= value.maxScore &&
  typeof value.passed === 'boolean' &&
  isNonNegativeInteger(value.passedCases) &&
  isNonNegativeInteger(value.totalCases) &&
  value.passedCases <= value.totalCases

const hasEventBase = (value: Record<string, unknown>) =>
  hasOnlyKeys(value, ['id', 'atMs', 'sequence', 'source', 'timeline', 'type', 'payload']) &&
  isBoundedString(value.id) &&
  isNonNegativeInteger(value.atMs) &&
  isNonNegativeInteger(value.sequence) &&
  sources.includes(value.source as (typeof sources)[number]) &&
  (value.timeline === undefined || isEventMetadata(value.timeline)) &&
  isRecord(value.payload)

const hasEventMetadataFields = (value: Record<string, unknown>) =>
  isBoundedString(value.title) &&
  isBoundedString(value.detail, { allowEmpty: true }) &&
  ['neutral', 'healthy', 'warning', 'critical'].includes(value.tone as string)

const isEventMetadata = (value: unknown) =>
  isRecord(value) &&
  hasOnlyKeys(value, ['title', 'detail', 'tone']) &&
  hasEventMetadataFields(value)

const isAttemptSummary = (value: unknown): value is ReplayAttemptSummaryV1 => {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, ['score', 'maxScore', 'passed', 'keyMoment']) ||
    !isNonNegativeInteger(value.score) ||
    !isNonNegativeInteger(value.maxScore) ||
    value.score > value.maxScore ||
    typeof value.passed !== 'boolean'
  ) {
    return false
  }
  if (value.keyMoment === undefined) return true
  return (
    isRecord(value.keyMoment) &&
    hasOnlyKeys(value.keyMoment, [
      'atMs',
      'eventId',
      'title',
      'detail',
      'tone',
    ]) &&
    hasEventMetadataFields(value.keyMoment) &&
    isNonNegativeInteger(value.keyMoment.atMs) &&
    isOptionalBoundedString(value.keyMoment.eventId)
  )
}

const isEvent = (value: unknown): value is ReplayEventV1 => {
  if (!isRecord(value) || !hasEventBase(value)) return false
  const payload = value.payload as Record<string, unknown>

  switch (value.type) {
    case 'load.changed':
      return hasOnlyKeys(payload, ['load']) && isLoad(payload.load)
    case 'fault.changed':
      return (
        hasOnlyKeys(payload, ['fault', 'targetNodeId']) &&
        isFault(payload.fault) &&
        isOptionalBoundedString(payload.targetNodeId)
      )
    case 'capacity.changed':
      return (
        hasOnlyKeys(payload, ['capacity']) &&
        isCapacityTuning(payload.capacity)
      )
    case 'node.added':
      return hasOnlyKeys(payload, ['node']) && isNode(payload.node)
    case 'node.updated': {
      if (
        !hasOnlyKeys(payload, ['nodeId', 'patch']) ||
        !isBoundedString(payload.nodeId) ||
        !isRecord(payload.patch)
      ) return false
      const patch = payload.patch
      return (
        hasOnlyKeys(patch, ['position', 'data']) &&
        (patch.position === undefined || isPosition(patch.position)) &&
        (patch.data === undefined || isPartialNodeData(patch.data))
      )
    }
    case 'node.removed':
      return hasOnlyKeys(payload, ['nodeId']) && isBoundedString(payload.nodeId)
    case 'edge.added':
      return hasOnlyKeys(payload, ['edge']) && isEdge(payload.edge)
    case 'edge.updated': {
      if (
        !hasOnlyKeys(payload, ['edgeId', 'patch']) ||
        !isBoundedString(payload.edgeId) ||
        !isRecord(payload.patch)
      ) return false
      const patch = payload.patch
      return (
        hasOnlyKeys(patch, [
          'source',
          'target',
          'sourceHandle',
          'targetHandle',
        ]) &&
        (patch.source === undefined || isBoundedString(patch.source)) &&
        (patch.target === undefined || isBoundedString(patch.target)) &&
        isHandle(patch.sourceHandle) &&
        isHandle(patch.targetHandle)
      )
    }
    case 'edge.removed':
      return hasOnlyKeys(payload, ['edgeId']) && isBoundedString(payload.edgeId)
    case 'architecture.replaced':
      return (
        hasOnlyKeys(payload, ['architecture']) &&
        isArchitecture(payload.architecture)
      )
    case 'answer.submitted':
      return (
        hasOnlyKeys(payload, ['answer', 'prompt', 'feedback', 'focus']) &&
        isBoundedString(payload.answer, { allowEmpty: true }) &&
        isOptionalBoundedString(payload.prompt) &&
        isOptionalBoundedString(payload.feedback) &&
        isOptionalBoundedString(payload.focus)
      )
    case 'design.submitted':
      return (
        hasOnlyKeys(payload, ['submission']) &&
        isSubmission(payload.submission)
      )
    default:
      return false
  }
}

export function validateReplayAttempt(value: unknown): value is ReplayAttemptV1 {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, [
      'id',
      'challengeId',
      'startedAt',
      'updatedAt',
      'durationMs',
      'initial',
      'events',
      'summary',
    ]) ||
    !isBoundedString(value.id) ||
    !isBoundedString(value.challengeId) ||
    !isIsoDate(value.startedAt) ||
    !isIsoDate(value.updatedAt) ||
    !isNonNegativeInteger(value.durationMs) ||
    !isRecord(value.initial) ||
    !hasOnlyKeys(value.initial, ['architecture', 'load', 'fault', 'capacity']) ||
    !isArchitecture(value.initial.architecture) ||
    !isLoad(value.initial.load) ||
    !isFault(value.initial.fault) ||
    (value.initial.capacity !== undefined && !isCapacityTuning(value.initial.capacity)) ||
    !Array.isArray(value.events) ||
    value.events.length > REPLAY_IMPORT_LIMITS.maxEvents ||
    !value.events.every(isEvent) ||
    (value.summary !== undefined && !isAttemptSummary(value.summary))
  ) {
    return false
  }

  const events = value.events as ReplayEventV1[]
  return (
    new Set(events.map((event) => event.id)).size === events.length &&
    new Set(events.map((event) => event.sequence)).size === events.length &&
    events.every((event) => event.atMs <= (value.durationMs as number)) &&
    (events.length === 0 || Math.min(...events.map((event) => event.atMs)) === 0) &&
    (value.summary === undefined ||
      value.summary.keyMoment === undefined ||
      value.summary.keyMoment.atMs <= (value.durationMs as number))
  )
}

export function validateReplayEnvelope(value: unknown): value is ReplayEnvelopeV1 {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['schema', 'version', 'exportedAt', 'attempt']) &&
    value.schema === REPLAY_SCHEMA &&
    value.version === REPLAY_SCHEMA_VERSION &&
    isIsoDate(value.exportedAt) &&
    validateReplayAttempt(value.attempt)
  )
}

interface LegacyScenarioNode {
  id: string
  kind: ComponentKind
  label: string
  position: { x: number; y: number }
}

interface LegacyScenarioEdge {
  source: string
  target: string
}

interface LegacyScenarioV1 {
  version: 1
  challenge: string
  load: ReplayLoadMultiplier
  fault: FaultMode
  capacity?: CapacityTuning
  nodes: LegacyScenarioNode[]
  edges: LegacyScenarioEdge[]
}

const isLegacyScenarioNode = (value: unknown): value is LegacyScenarioNode =>
  isRecord(value) &&
  isBoundedString(value.id) &&
  componentKinds.includes(value.kind as ComponentKind) &&
  isBoundedString(value.label) &&
  isPosition(value.position)

const isLegacyScenarioEdge = (value: unknown): value is LegacyScenarioEdge =>
  isRecord(value) &&
  isBoundedString(value.source) &&
  isBoundedString(value.target)

const isLegacyScenario = (value: unknown): value is LegacyScenarioV1 =>
  isRecord(value) &&
  value.version === 1 &&
  isBoundedString(value.challenge) &&
  isLoad(value.load) &&
  isFault(value.fault) &&
  (value.capacity === undefined || isCapacityTuning(value.capacity)) &&
  Array.isArray(value.nodes) &&
  value.nodes.length <= REPLAY_IMPORT_LIMITS.maxNodes &&
  value.nodes.every(isLegacyScenarioNode) &&
  Array.isArray(value.edges) &&
  value.edges.length <= REPLAY_IMPORT_LIMITS.maxEdges &&
  value.edges.every(isLegacyScenarioEdge)

const stableHash = (input: string) => {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const migrateLegacyScenario = (
  scenario: LegacyScenarioV1,
  source: string,
): ReplayEnvelopeV1 => {
  const timestamp = '1970-01-01T00:00:00.000Z'
  const architecture: ReplayArchitectureV1 = {
    nodes: scenario.nodes.map((node) => ({
      id: node.id,
      type: 'system',
      position: { ...node.position },
      data: {
        kind: node.kind,
        label: node.label,
      },
    })),
    edges: scenario.edges.map((edge, index) => ({
      id: `imported-edge-${index}-${edge.source}-${edge.target}`,
      type: 'traffic',
      source: edge.source,
      target: edge.target,
    })),
  }

  return {
    schema: REPLAY_SCHEMA,
    version: REPLAY_SCHEMA_VERSION,
    exportedAt: timestamp,
    attempt: {
      id: `imported-${stableHash(source)}`,
      challengeId: scenario.challenge,
      startedAt: timestamp,
      updatedAt: timestamp,
      durationMs: 0,
      initial: {
        architecture,
        load: scenario.load,
        fault: scenario.fault,
        ...(scenario.capacity ? { capacity: { ...scenario.capacity } } : {}),
      },
      events: [],
    },
  }
}

export function parseReplayEnvelope(serialized: string): ReplayImportResult {
  if (serialized.length > REPLAY_IMPORT_LIMITS.maxSerializedCharacters) {
    return {
      ok: false,
      error: {
        code: 'too-large',
        message: 'Replay is larger than the safe import limit.',
      },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return {
      ok: false,
      error: { code: 'invalid-json', message: 'Replay is not valid JSON.' },
    }
  }

  if (validateReplayEnvelope(parsed)) {
    return { ok: true, value: parsed, migrated: false, warnings: [] }
  }
  if (isLegacyScenario(parsed)) {
    const migrated = migrateLegacyScenario(parsed, serialized)
    if (!validateReplayEnvelope(migrated)) {
      return {
        ok: false,
        error: {
          code: 'invalid-replay',
          message: 'The v0.1 snapshot contains an invalid architecture.',
        },
      }
    }
    return {
      ok: true,
      value: migrated,
      migrated: true,
      warnings: ['Imported a v0.1 scenario snapshot without timeline events.'],
    }
  }
  if (
    isRecord(parsed) &&
    parsed.schema === REPLAY_SCHEMA &&
    parsed.version !== REPLAY_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      error: {
        code: 'unsupported-version',
        message: `Replay version ${String(parsed.version)} is not supported.`,
      },
    }
  }
  return {
    ok: false,
    error: {
      code: 'invalid-replay',
      message: 'JSON does not contain a valid Faultline replay.',
    },
  }
}

export function redactReplayAnswers(envelope: ReplayEnvelopeV1): ReplayEnvelopeV1 {
  return {
    ...envelope,
    attempt: {
      ...envelope.attempt,
      initial: cloneInitialReplayState(envelope.attempt.initial),
      events: envelope.attempt.events.map((event) =>
        event.type === 'answer.submitted'
          ? {
              ...event,
              payload: {
                ...event.payload,
                answer: '[redacted]',
                prompt: undefined,
                feedback: undefined,
              },
            }
          : event,
      ),
    },
  }
}

export function serializeReplayEnvelope(
  value: ReplayEnvelopeV1 | ReplayAttemptV1,
  options: { redactAnswers?: boolean; pretty?: boolean } = {},
) {
  const envelope: ReplayEnvelopeV1 = validateReplayEnvelope(value)
    ? value
    : validateReplayAttempt(value)
      ? {
          schema: REPLAY_SCHEMA,
          version: REPLAY_SCHEMA_VERSION,
          exportedAt: value.updatedAt,
          attempt: value,
        }
      : (() => {
          throw new TypeError('Cannot serialize an invalid Faultline replay.')
        })()
  if (!validateReplayEnvelope(envelope)) {
    throw new TypeError('Cannot serialize an invalid Faultline replay.')
  }
  const serializable = options.redactAnswers
    ? redactReplayAnswers(envelope)
    : envelope
  return JSON.stringify(serializable, null, options.pretty ? 2 : undefined)
}
