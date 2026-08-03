import type { SystemFlowEdge, SystemFlowNode } from '../canvas/types'
import type { ComponentHealth, FaultMode, ScenarioId } from '../domain/system'
import type { CapacityTuning } from '../domain/system'
import { computeSimulation, formatMetric } from '../simulation/engine'
import { analyzeTopology } from '../simulation/topology'
import { serializeReplayEnvelope } from './serialization'
import { compareReplayEvents } from './reducer'
import type {
  ReplayAttemptV1,
  ReplayEdgeV1,
  ReplayInitialStateV1,
  ReplayNodeV1,
  ReplayPlaybackStateV1,
  ReplayTimelineTone,
} from './types'

export interface ReplayTimelineItem {
  id: string
  atMs: number
  title: string
  detail: string
  tone: ReplayTimelineTone
}

const toneForHealth = (health: ComponentHealth) => {
  if (health === 'failed' || health === 'hot') return 'critical' as const
  if (health === 'degraded' || health === 'backlog') return 'warning' as const
  return 'healthy' as const
}

export const createStableId = (prefix: string) => {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${id}`
}

export const toReplayNode = (node: SystemFlowNode): ReplayNodeV1 => ({
  id: node.id,
  type: 'system',
  position: { ...node.position },
  data: {
    kind: node.data.kind,
    label: node.data.label,
    ...(node.data.replicas && node.data.replicas > 1 ? { replicas: node.data.replicas } : {}),
    ...(node.data.shards && node.data.shards > 1 ? { shards: node.data.shards } : {}),
  },
})

export const toReplayEdge = (edge: SystemFlowEdge): ReplayEdgeV1 => ({
  id: edge.id,
  type: 'traffic',
  source: edge.source,
  target: edge.target,
  ...(edge.sourceHandle !== undefined ? { sourceHandle: edge.sourceHandle } : {}),
  ...(edge.targetHandle !== undefined ? { targetHandle: edge.targetHandle } : {}),
})

export const toReplayInitial = (
  nodes: SystemFlowNode[],
  edges: SystemFlowEdge[],
  load: 1 | 3 | 10,
  fault: FaultMode,
  capacity?: CapacityTuning,
): ReplayInitialStateV1 => ({
  architecture: { nodes: nodes.map(toReplayNode), edges: edges.map(toReplayEdge) },
  load,
  fault,
  ...(capacity ? { capacity: { ...capacity } } : {}),
})

const fromReplayNode = (node: ReplayNodeV1, load: 1 | 3 | 10): SystemFlowNode => ({
  ...node,
  selected: false,
  data: { ...node.data, health: 'healthy', detail: 'Ready', load },
})

const fromReplayEdge = (
  edge: ReplayEdgeV1,
  load: 1 | 3 | 10,
  paused: boolean,
): SystemFlowEdge => ({
  ...edge,
  data: { tone: 'healthy', intensity: load, paused },
})

export const presentReplayFrame = (
  frame: ReplayPlaybackStateV1,
  tick: number,
  paused: boolean,
  scenario: ScenarioId = 'url-shortener',
) => {
  const baseNodes = frame.architecture.nodes.map((node) => fromReplayNode(node, frame.load))
  const baseEdges = frame.architecture.edges.map((edge) => fromReplayEdge(edge, frame.load, paused))
  const analysis = analyzeTopology(baseNodes, baseEdges)
  const simulation = computeSimulation({
    loadMultiplier: frame.load,
    fault: frame.fault,
    tick,
    nodeCount: baseNodes.length,
    edgeCount: baseEdges.length,
    componentCounts: analysis.componentCounts,
    replicaCounts: analysis.replicaCounts,
    criticalPathConnected: analysis.criticalPathConnected,
    capacity: frame.capacity,
    scenario,
  })
  const routedNodeIdSet = new Set(analysis.routedNodeIds)
  const routedCaches = baseNodes.filter(
    (node) => node.data.kind === 'cache' && routedNodeIdSet.has(node.id),
  )
  const faultedCacheId = routedCaches[0]?.id
  const nodes = baseNodes.map((node) => {
    let health = simulation.nodeHealth[node.data.kind] ?? 'healthy'
    let detail = simulation.nodeDetails[node.data.kind] ?? 'Healthy'
    if (
      analysis.criticalPathConnected &&
      !routedNodeIdSet.has(node.id) &&
      node.data.kind !== 'queue' &&
      node.data.kind !== 'region'
    ) {
      health = 'healthy'
      detail = 'Not on active path'
    } else if (
      frame.fault === 'cache-outage' &&
      node.data.kind === 'cache' &&
      (analysis.replicaCounts.cache ?? routedCaches.length) > 1
    ) {
      health = node.id === faultedCacheId ? 'failed' : 'degraded'
      detail = node.id === faultedCacheId ? 'Unavailable' : detail
    }
    return { ...node, data: { ...node.data, health, detail } }
  })
  const healthByNode = new Map(nodes.map((node) => [node.id, node.data.health]))
  const edges = baseEdges.map((edge) => {
    const targetHealth = healthByNode.get(edge.target) ?? 'healthy'
    let label = edge.label
    if (scenario === 'news-feed' && edge.id === 'feed-users-api') {
      label = `${formatMetric(simulation.metrics.throughput, 'throughput')} deliveries/s`
    } else if (scenario === 'news-feed' && edge.id === 'feed-api-queue') {
      label = frame.fault === 'celebrity-spike' ? '50M fan-out' : `${formatMetric(simulation.metrics.queueDepth, 'queueDepth')} queued`
    } else if (scenario === 'news-feed' && edge.id === 'feed-queue-workers') {
      label = formatMetric(simulation.metrics.p99, 'p99')
    } else if (edge.id === 'clients-edge') {
      label = `${formatMetric(simulation.metrics.throughput, 'throughput')} req/s`
    } else if (edge.id === 'api-cache') {
      label = `${Math.round(simulation.metrics.cacheMiss)}% miss`
    } else if (edge.id === 'cache-database') {
      label = formatMetric(simulation.metrics.p99, 'p99')
    }
    return {
      ...edge,
      label,
      data: {
        tone: toneForHealth(targetHealth),
        intensity: frame.load,
        paused,
      },
    }
  })
  return { nodes, edges }
}

export const replayTimelineEvents = (attempt: ReplayAttemptV1): ReplayTimelineItem[] =>
  [...attempt.events].sort(compareReplayEvents).flatMap((event) => event.timeline
    ? [{ id: event.id, atMs: event.atMs, ...event.timeline }]
    : [])

export const replayKeyMoment = (attempt: ReplayAttemptV1) =>
  attempt.summary?.keyMoment?.title ??
  replayTimelineEvents(attempt).find((event) => event.tone === 'critical')?.title ??
  (attempt.initial.fault === 'cache-outage'
    ? 'Attempt started with Redis unavailable'
    : attempt.initial.fault === 'none'
      ? 'Architecture replay is ready'
      : `Attempt started with ${attempt.initial.fault.replace(/-/g, ' ')}`)

export const downloadReplay = (attempt: ReplayAttemptV1) => {
  const blob = new Blob([
    serializeReplayEnvelope(attempt, { redactAnswers: true, pretty: true }),
  ], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `faultline-${attempt.challengeId}-${attempt.id}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
