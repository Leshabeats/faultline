import type {
  ReplayArchitectureV1,
  ReplayAttemptV1,
  ReplayEdgeV1,
  ReplayEventV1,
  ReplayInitialStateV1,
  ReplayNodeV1,
  ReplayPlaybackStateV1,
} from './types'

const cloneNode = (node: ReplayNodeV1): ReplayNodeV1 => ({
  ...node,
  position: { ...node.position },
  data: { ...node.data },
})

const cloneEdge = (edge: ReplayEdgeV1): ReplayEdgeV1 => ({
  ...edge,
})

export const cloneArchitecture = (
  architecture: ReplayArchitectureV1,
): ReplayArchitectureV1 => ({
  nodes: architecture.nodes.map(cloneNode),
  edges: architecture.edges.map(cloneEdge),
})

export const cloneInitialReplayState = (
  initial: ReplayInitialStateV1,
): ReplayInitialStateV1 => ({
  architecture: cloneArchitecture(initial.architecture),
  load: initial.load,
  fault: initial.fault,
  ...(initial.capacity ? { capacity: { ...initial.capacity } } : {}),
})

export const compareReplayEvents = (left: ReplayEventV1, right: ReplayEventV1) =>
  left.atMs - right.atMs ||
  left.sequence - right.sequence ||
  left.id.localeCompare(right.id)

export function createPlaybackState(
  initial: ReplayInitialStateV1,
): ReplayPlaybackStateV1 {
  return {
    ...cloneInitialReplayState(initial),
    currentTimeMs: 0,
    appliedEventIds: [],
    answers: [],
    submissions: [],
  }
}

const replaceById = <T extends { id: string }>(items: T[], item: T) => [
  ...items.filter((candidate) => candidate.id !== item.id),
  item,
]

export function reduceReplayEvent(
  current: ReplayPlaybackStateV1,
  event: ReplayEventV1,
): ReplayPlaybackStateV1 {
  const state: ReplayPlaybackStateV1 = {
    ...current,
    architecture: cloneArchitecture(current.architecture),
    currentTimeMs: Math.max(current.currentTimeMs, event.atMs),
    appliedEventIds: [...current.appliedEventIds, event.id],
    answers: current.answers.map((answer) => ({ ...answer })),
    submissions: current.submissions.map((submission) => ({ ...submission })),
  }

  switch (event.type) {
    case 'load.changed':
      state.load = event.payload.load
      break
    case 'fault.changed':
      state.fault = event.payload.fault
      break
    case 'capacity.changed':
      state.capacity = { ...event.payload.capacity }
      break
    case 'node.added':
      state.architecture.nodes = replaceById(
        state.architecture.nodes,
        cloneNode(event.payload.node),
      )
      break
    case 'node.updated':
      state.architecture.nodes = state.architecture.nodes.map((node) => {
        if (node.id !== event.payload.nodeId) return node
        const patch = event.payload.patch
        return {
          ...node,
          ...(patch.position ? { position: { ...patch.position } } : {}),
          ...(patch.data
            ? {
                data: {
                  ...node.data,
                  ...patch.data,
                },
              }
            : {}),
        }
      })
      break
    case 'node.removed':
      state.architecture.nodes = state.architecture.nodes.filter(
        (node) => node.id !== event.payload.nodeId,
      )
      state.architecture.edges = state.architecture.edges.filter(
        (edge) =>
          edge.source !== event.payload.nodeId &&
          edge.target !== event.payload.nodeId,
      )
      break
    case 'edge.added':
      state.architecture.edges = replaceById(
        state.architecture.edges,
        cloneEdge(event.payload.edge),
      )
      break
    case 'edge.updated':
      state.architecture.edges = state.architecture.edges.map((edge) => {
        if (edge.id !== event.payload.edgeId) return edge
        const patch = event.payload.patch
        return {
          ...edge,
          ...(patch.source !== undefined ? { source: patch.source } : {}),
          ...(patch.target !== undefined ? { target: patch.target } : {}),
          ...(patch.sourceHandle !== undefined
            ? { sourceHandle: patch.sourceHandle }
            : {}),
          ...(patch.targetHandle !== undefined
            ? { targetHandle: patch.targetHandle }
            : {}),
        }
      })
      break
    case 'edge.removed':
      state.architecture.edges = state.architecture.edges.filter(
        (edge) => edge.id !== event.payload.edgeId,
      )
      break
    case 'architecture.replaced':
      state.architecture = cloneArchitecture(event.payload.architecture)
      break
    case 'answer.submitted':
      state.answers.push({
        eventId: event.id,
        atMs: event.atMs,
        ...event.payload,
      })
      break
    case 'design.submitted':
      state.submissions.push({
        eventId: event.id,
        atMs: event.atMs,
        ...event.payload.submission,
      })
      break
  }

  return state
}

/**
 * Rebuilds an attempt from its immutable initial state on every call. Events
 * are ordered by timestamp and sequence, so scrubbing is independent of the
 * order in which imported JSON happened to store them.
 */
export function playReplayAt(
  attempt: ReplayAttemptV1,
  requestedTimeMs: number,
): ReplayPlaybackStateV1 {
  const finiteTimeMs = Number.isNaN(requestedTimeMs)
    ? 0
    : requestedTimeMs === Number.POSITIVE_INFINITY
      ? attempt.durationMs
      : requestedTimeMs === Number.NEGATIVE_INFINITY
        ? 0
        : requestedTimeMs
  const targetTimeMs = Math.min(
    attempt.durationMs,
    Math.max(0, finiteTimeMs),
  )
  const events = [...attempt.events]
    .sort(compareReplayEvents)
    .filter((event) => event.atMs <= targetTimeMs)
  const state = events.reduce(reduceReplayEvent, createPlaybackState(attempt.initial))
  return { ...state, currentTimeMs: targetTimeMs }
}
