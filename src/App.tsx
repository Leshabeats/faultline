import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { ArchitectureCanvas } from './canvas/ArchitectureCanvas'
import type { SystemFlowEdge, SystemFlowNode } from './canvas/types'
import { InterviewerPanel } from './components/InterviewerPanel'
import {
  BottleneckPanel,
  type BottleneckPrediction,
} from './components/BottleneckPanel'
import { ChallengePanel } from './components/ChallengePanel'
import { FanoutPanel, type FanoutPrediction } from './components/FanoutPanel'
import { HistoryPanel, type HistoryAttemptItem } from './components/HistoryPanel'
import { ReplayPanel } from './components/ReplayPanel'
import { ReplayTimeline } from './components/ReplayTimeline'
import { TopBar } from './components/TopBar'
import {
  challengeOptions,
  clonePackEdges,
  clonePackNodes,
  getChallengePack,
} from './challenges/registry'
import {
  COMPONENT_LABELS,
  FAULT_LABELS,
  type ComponentHealth,
  type ComponentKind,
  type CapacityTuning,
  type FaultMode,
  type Locale,
  type LoadMultiplier,
  type ScenarioId,
  type TelemetryPoint,
  type TimelineEvent,
} from './domain/system'
import {
  DEFAULT_CAPACITY_TUNING,
  estimateCapacity,
} from './capacity/model'
import {
  DEFAULT_NEWS_FEED_TUNING,
  estimateNewsFeed,
  normalizeNewsFeedTuning,
} from './newsFeed/model'
import { interviewRouter } from './interview/router'
import type { InterviewAction, InterviewContext } from './interview/types'
import { judgeNewsFeed, judgeUrlShortener, type JudgeReport } from './judge'
import { computeSimulation, formatMetric } from './simulation/engine'
import { analyzeTopology } from './simulation/topology'
import {
  ReplayAttemptRepository,
  createReplayAttempt,
  parseReplayEnvelope,
  playReplayAt,
  recordReplayEvent,
  serializeReplayEnvelope,
  type ReplayAttemptV1,
  type ReplayEventDraftV1,
} from './replay'
import {
  createStableId,
  downloadReplay,
  presentReplayFrame,
  replayKeyMoment,
  replayTimelineEvents,
  toReplayEdge,
  toReplayInitial,
  toReplayNode,
} from './replay/presentation'
import { verifyImportedAttempt } from './replay/verification'
import { faultLabels as localizedFaultLabels, initialLocale, localizeNodeDetail, localizeNodeLabel, scenarioLabels } from './i18n'
import { useTrafficRamp } from './simulation/useTrafficRamp'

const toneForHealth = (health: ComponentHealth) => {
  if (health === 'failed' || health === 'hot') return 'critical' as const
  if (health === 'degraded' || health === 'backlog') return 'warning' as const
  return 'healthy' as const
}

const formatClock = (elapsedSeconds: number) => {
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`
}

const initialEvents = (locale: Locale): TimelineEvent[] => [
  {
    id: 'initial-ready',
    timestamp: '18:41',
    title: locale === 'ru' ? 'Схема готова' : 'Architecture ready',
    detail: locale === 'ru' ? 'Штатная нагрузка 1×, сбоев нет' : 'Healthy 1× baseline, no faults',
    tone: 'healthy',
  },
]

type ReplayDraftWithoutClock = ReplayEventDraftV1 extends infer Event
  ? Event extends ReplayEventDraftV1
    ? Omit<Event, 'id' | 'atMs'>
    : never
  : never

const createReplayRepository = () => {
  try {
    return new ReplayAttemptRepository(window.localStorage)
  } catch {
    const values = new Map<string, string>()
    return new ReplayAttemptRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
      removeItem: (key) => { values.delete(key) },
    })
  }
}

export function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [challengeId, setChallengeId] = useState<ScenarioId>('url-shortener')
  const activePack = getChallengePack(challengeId)
  const [nodes, setNodes] = useState<SystemFlowNode[]>(() => clonePackNodes(getChallengePack('url-shortener')))
  const [edges, setEdges] = useState<SystemFlowEdge[]>(() => clonePackEdges(getChallengePack('url-shortener')))
  const [activeKind, setActiveKind] = useState<ComponentKind>('cache')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('api')
  const [load, setLoad] = useState<LoadMultiplier>(1)
  const [fault, setFault] = useState<FaultMode>('none')
  const [playing, setPlaying] = useState(true)
  const simulatedLoad = useTrafficRamp(load, playing)
  const [tick, setTick] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(18 * 60 + 42)
  const [interviewerOpen, setInterviewerOpen] = useState(false)
  const [rightPanelMode, setRightPanelMode] = useState<'interview' | 'bottleneck'>('bottleneck')
  const [capacity, setCapacity] = useState<CapacityTuning>(DEFAULT_CAPACITY_TUNING)
  const [bottleneckPrediction, setBottleneckPrediction] = useState<BottleneckPrediction | null>(null)
  const [predictionRationale, setPredictionRationale] = useState('')
  const [predictionLocked, setPredictionLocked] = useState(false)
  const [fanoutPrediction, setFanoutPrediction] = useState<FanoutPrediction | null>(null)
  const [fanoutPredictionRationale, setFanoutPredictionRationale] = useState('')
  const [fanoutPredictionLocked, setFanoutPredictionLocked] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyNotice, setHistoryNotice] = useState<{
    message: string
    tone: 'success' | 'error'
  } | null>(null)
  const [events, setEvents] = useState<TimelineEvent[]>(() => initialEvents(initialLocale()))
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [prompt, setPrompt] = useState(() => initialLocale() === 'ru'
    ? 'С чего начнёте проектирование сервиса коротких ссылок: с требований или с оценки нагрузки?'
    : 'Would you start the URL shortener design with requirements or a traffic estimate?')
  const [interviewBusy, setInterviewBusy] = useState(false)
  const [judgeReport, setJudgeReport] = useState<JudgeReport | null>(null)
  const [replayRepository] = useState(createReplayRepository)
  const [savedAttempts, setSavedAttempts] = useState<ReplayAttemptV1[]>(() => {
    try {
      return replayRepository.list()
    } catch {
      return []
    }
  })
  const [draftAttempt, setDraftAttempt] = useState<ReplayAttemptV1 | null>(null)
  const [replayAttempt, setReplayAttempt] = useState<ReplayAttemptV1 | null>(null)
  const [replayCursorMs, setReplayCursorMs] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(1)
  const effectiveLoad = replayAttempt ? load : simulatedLoad
  const draftAttemptRef = useRef<ReplayAttemptV1 | null>(null)
  const recordingElapsedMsRef = useRef(0)
  const canonicalStateRef = useRef({ nodes, edges, load, fault, capacity, challengeId })
  const liveStateBeforeReplayRef = useRef<{
    nodes: SystemFlowNode[]
    edges: SystemFlowEdge[]
    load: 1 | 3 | 10
    fault: FaultMode
    capacity: CapacityTuning
    challengeId: ScenarioId
    playing: boolean
  } | null>(null)

  canonicalStateRef.current = { nodes, edges, load, fault, capacity, challengeId }
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const localizedChallengeOptions = useMemo(
    () => challengeOptions.map((option) => ({
      ...option,
      title: scenarioLabels[locale][option.id].title,
      difficulty: scenarioLabels[locale][option.id].difficulty,
    })),
    [locale],
  )

  useEffect(() => {
    document.documentElement.lang = locale
    try { window.localStorage.setItem('faultline.locale', locale) } catch { /* optional */ }
  }, [locale])

  // Simulation topology must not be invalidated by the live health/detail fields
  // that we write back into React Flow nodes on every tick.
  const componentTopology = nodes
    .map((node) => `${node.id}:${node.data.kind}:${node.data.replicas ?? 1}:${node.data.shards ?? 1}`)
    .sort()
    .join('|')
  const graphTopology = `${componentTopology}::${edges
    .map((edge) => `${edge.id}:${edge.source}>${edge.target}`)
    .sort()
    .join('|')}`
  const { componentCounts, replicaCounts, criticalPathConnected, routedNodeIds } = useMemo(
    () => analyzeTopology(nodes, edges),
    [graphTopology],
  )

  const snapshot = useMemo(
    () =>
      computeSimulation({
        scenario: challengeId,
        loadMultiplier: effectiveLoad,
        fault,
        tick,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        componentCounts,
        replicaCounts,
        criticalPathConnected,
        capacity,
      }),
    [capacity, challengeId, componentCounts, criticalPathConnected, edges.length, effectiveLoad, fault, nodes.length, replicaCounts, tick],
  )

  const capacityReport = useMemo(
    () => estimateCapacity({
      loadMultiplier: effectiveLoad,
      fault,
      tuning: capacity,
      componentCounts,
      replicaCounts,
      criticalPathConnected,
    }),
    [capacity, componentCounts, criticalPathConnected, effectiveLoad, fault, replicaCounts],
  )
  const baselineCapacityReport = useMemo(
    () => estimateCapacity({
      loadMultiplier: effectiveLoad,
      fault,
      tuning: {
        ...DEFAULT_CAPACITY_TUNING,
        pricingPackId: capacity.pricingPackId,
        benchmarkPackId: capacity.benchmarkPackId,
      },
      componentCounts,
      replicaCounts,
      criticalPathConnected,
    }),
    [
      capacity.benchmarkPackId,
      capacity.pricingPackId,
      componentCounts,
      criticalPathConnected,
      fault,
      effectiveLoad,
      replicaCounts,
    ],
  )

  const newsFeedReport = useMemo(
    () => estimateNewsFeed({
      loadMultiplier: effectiveLoad,
      fault,
      tuning: capacity,
      componentCounts,
      criticalPathConnected,
    }),
    [capacity, componentCounts, criticalPathConnected, effectiveLoad, fault],
  )
  const baselineNewsFeedReport = useMemo(
    () => estimateNewsFeed({
      loadMultiplier: effectiveLoad,
      fault,
      tuning: DEFAULT_NEWS_FEED_TUNING,
      componentCounts,
      criticalPathConnected,
    }),
    [componentCounts, criticalPathConnected, effectiveLoad, fault],
  )

  const replayFrame = useMemo(
    () => replayAttempt ? playReplayAt(replayAttempt, replayCursorMs) : null,
    [replayAttempt, replayCursorMs],
  )
  const replayEvents = useMemo(
    () => replayAttempt ? replayTimelineEvents(replayAttempt) : [],
    [replayAttempt],
  )
  const activeReplayEvent = useMemo(
    () => [...replayEvents].reverse().find((event) => event.atMs <= replayCursorMs) ?? null,
    [replayCursorMs, replayEvents],
  )
  const historyItems = useMemo<HistoryAttemptItem[]>(
    () => savedAttempts.map((attempt) => ({
      id: attempt.id,
      title: challengeOptions.find((option) => option.id === attempt.challengeId)?.title
        ?? attempt.challengeId,
      completedAt: attempt.updatedAt,
      durationMs: attempt.durationMs,
      score: attempt.summary?.score,
      passed: attempt.summary?.passed,
      keyMoment: replayKeyMoment(attempt),
    })),
    [savedAttempts],
  )

  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>(() =>
    Array.from({ length: 22 }, (_, index) => ({
      tick: index - 21,
      ...computeSimulation({
        scenario: 'url-shortener',
        loadMultiplier: 1,
        fault: 'none',
        tick: index - 21,
        capacity: DEFAULT_CAPACITY_TUNING,
      }).metrics,
    })),
  )

  const addEvent = useCallback(
    (
      title: string,
      detail: string,
      tone: TimelineEvent['tone'] = 'neutral',
    ) => {
      setEvents((current) => [
        {
          id: `${Date.now()}-${title}`,
          timestamp: formatClock(elapsedSeconds),
          title,
          detail,
          tone,
        },
        ...current,
      ].slice(0, 12))
    },
    [elapsedSeconds],
  )

  const recordAction = useCallback((draft: ReplayDraftWithoutClock) => {
    const now = new Date()
    let current = draftAttemptRef.current
    let atMs = 0

    if (!current) {
      const canonical = canonicalStateRef.current
      const startedAt = now.toISOString()
      current = createReplayAttempt({
        id: createStableId('attempt'),
        challengeId: canonical.challengeId,
        startedAt,
        initial: toReplayInitial(
          canonical.nodes,
          canonical.edges,
          canonical.load,
          canonical.fault,
          canonical.capacity,
        ),
      })
      recordingElapsedMsRef.current = 0
      setElapsedSeconds(0)
    } else {
      atMs = recordingElapsedMsRef.current
    }

    const next = recordReplayEvent(
      current,
      {
        ...draft,
        id: createStableId('event'),
        atMs,
      } as ReplayEventDraftV1,
      now.toISOString(),
    )
    draftAttemptRef.current = next
    setDraftAttempt(next)
    return next
  }, [])

  useEffect(() => {
    setJudgeReport(null)
  }, [capacity, challengeId, graphTopology])

  useEffect(() => {
    if (replayAttempt || !playing) return
    const timer = window.setInterval(() => {
      setTick((value) => value + 1)
      setElapsedSeconds((value) => value + 1)
      if (draftAttemptRef.current) recordingElapsedMsRef.current += 1000
    }, 900)
    return () => window.clearInterval(timer)
  }, [playing, replayAttempt])

  useEffect(() => {
    if (!replayAttempt || !replayPlaying) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - previous) * replaySpeed
      previous = now
      setReplayCursorMs((current) => {
        const next = Math.min(replayAttempt.durationMs, current + delta)
        if (next >= replayAttempt.durationMs) setReplayPlaying(false)
        return next
      })
    }, 50)
    return () => window.clearInterval(timer)
  }, [replayAttempt, replayPlaying, replaySpeed])

  useEffect(() => {
    if (!replayFrame) return
    const replayTick = Math.floor(replayCursorMs / 900)
    const replayScenario = replayAttempt?.challengeId === 'news-feed' ? 'news-feed' : 'url-shortener'
    const presentation = presentReplayFrame(replayFrame, replayTick, !replayPlaying, replayScenario)
    setChallengeId(replayScenario)
    setLoad(replayFrame.load)
    setFault(replayFrame.fault)
    setCapacity({
      ...DEFAULT_CAPACITY_TUNING,
      ...(replayFrame.capacity ?? {}),
    })
    setTick(replayTick)
    setNodes(presentation.nodes)
    setEdges(presentation.edges)
  }, [replayAttempt?.challengeId, replayCursorMs, replayFrame, replayPlaying])

  useEffect(() => {
    if (replayAttempt) return
    setTelemetry((history) => [
      ...history.slice(-27),
      { tick, ...snapshot.metrics },
    ])
  }, [replayAttempt, snapshot.metrics, tick])

  useEffect(() => {
    setNodes((current) => {
      const routedNodeIdSet = new Set(routedNodeIds)
      const routedCaches = current.filter(
        (node) => node.data.kind === 'cache' && routedNodeIdSet.has(node.id),
      )
      const faultedCacheId = routedCaches[0]?.id

      return current.map((node) => {
        let health = snapshot.nodeHealth[node.data.kind] ?? 'healthy'
        let detail = snapshot.nodeDetails[node.data.kind] ?? 'Healthy'

        if (
          criticalPathConnected &&
          !routedNodeIdSet.has(node.id) &&
          node.data.kind !== 'queue' &&
          node.data.kind !== 'region'
        ) {
          health = 'healthy'
          detail = 'Not on active path'
        } else if (
          fault === 'cache-outage' &&
          node.data.kind === 'cache' &&
          (replicaCounts.cache ?? routedCaches.length) > 1
        ) {
          const separateFailedNode = routedCaches.length > 1 && node.id === faultedCacheId
          health = separateFailedNode ? 'failed' : 'degraded'
          detail = separateFailedNode ? 'Unavailable' : detail
        }

        return {
          ...node,
          data: {
            ...node.data,
            label: localizeNodeLabel(locale, challengeId, node.id, node.data.label),
            health,
            detail: localizeNodeDetail(locale, detail),
            load: effectiveLoad,
          },
        }
      })
    })
  }, [
    criticalPathConnected,
    challengeId,
    componentCounts.cache,
    fault,
    locale,
    effectiveLoad,
    replicaCounts.cache,
    routedNodeIds,
    snapshot.nodeDetails,
    snapshot.nodeHealth,
  ])

  useEffect(() => {
    const healthByNode = new Map(nodes.map((node) => [node.id, node.data.health]))
    setEdges((current) =>
      current.map((edge) => {
        const targetHealth = healthByNode.get(edge.target) ?? 'healthy'
        let label = edge.label
        if (challengeId === 'news-feed' && edge.id === 'feed-users-api') {
          label = `${formatMetric(snapshot.metrics.throughput, 'throughput')} deliveries/s`
        } else if (challengeId === 'news-feed' && edge.id === 'feed-api-store') {
          label = `${Math.round(effectiveLoad * 2)}k posts/s`
        } else if (challengeId === 'news-feed' && edge.id === 'feed-api-queue') {
          label = fault === 'celebrity-spike'
            ? '50M fan-out'
            : `${formatMetric(snapshot.metrics.queueDepth, 'queueDepth')} queued`
        } else if (challengeId === 'news-feed' && edge.id === 'feed-queue-workers') {
          label = formatMetric(snapshot.metrics.p99, 'p99')
        } else if (challengeId === 'news-feed' && edge.id === 'feed-workers-cache') {
          label = normalizeNewsFeedTuning(capacity).strategy
        } else if (edge.id === 'clients-edge') {
          label = `${formatMetric(snapshot.metrics.throughput, 'throughput')} req/s`
        } else if (edge.id === 'api-cache') {
          label = `${Math.round(snapshot.metrics.cacheMiss)}% miss`
        } else if (edge.id === 'cache-database') {
          label = formatMetric(snapshot.metrics.p99, 'p99')
        }

        return {
          ...edge,
          label,
          data: {
            tone: toneForHealth(targetHealth),
            intensity: challengeId === 'news-feed' && fault === 'celebrity-spike' ? 10 : effectiveLoad,
            paused: replayAttempt ? !replayPlaying : !playing,
          },
        }
      }),
    )
  }, [capacity, challengeId, effectiveLoad, fault, nodes, playing, replayAttempt, replayPlaying, snapshot.metrics])

  const onNodesChange = useCallback(
    (changes: NodeChange<SystemFlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current))
      changes.forEach((change) => {
        if (change.type !== 'remove') return
        recordAction({
          type: 'node.removed',
          source: 'user',
          payload: { nodeId: change.id },
          timeline: {
            title: 'Component removed',
            detail: 'Topology recalculated',
            tone: 'warning',
          },
        })
      })
    },
    [recordAction],
  )

  const onNodeDragStop = useCallback((node: SystemFlowNode) => {
    recordAction({
      type: 'node.updated',
      source: 'user',
      payload: { nodeId: node.id, patch: { position: { ...node.position } } },
      timeline: {
        title: `${node.data.label} moved`,
        detail: 'Architecture layout updated',
        tone: 'neutral',
      },
    })
  }, [recordAction])

  const onEdgesChange = useCallback(
    (changes: EdgeChange<SystemFlowEdge>[]) => {
      setEdges((current) => applyEdgeChanges(changes, current))
      changes.forEach((change) => {
        if (change.type !== 'remove') return
        recordAction({
          type: 'edge.removed',
          source: 'user',
          payload: { edgeId: change.id },
          timeline: {
            title: 'Connection removed',
            detail: 'Topology recalculated',
            tone: 'warning',
          },
        })
      })
    },
    [recordAction],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const edge: SystemFlowEdge = {
        ...connection,
        id: createStableId('edge'),
        type: 'traffic',
        data: { tone: 'healthy', intensity: load, paused: !playing },
      }
      setEdges((current) =>
        addEdge<SystemFlowEdge>(edge, current),
      )
      addEvent('Connection added', 'Topology recalculated', 'healthy')
      recordAction({
        type: 'edge.added',
        source: 'user',
        payload: { edge: toReplayEdge(edge) },
        timeline: {
          title: 'Connection added',
          detail: 'Topology recalculated',
          tone: 'healthy',
        },
      })
    },
    [addEvent, load, playing, recordAction],
  )

  const addNode = useCallback(
    (kind: ComponentKind) => {
      setActiveKind(kind)
      const current = canonicalStateRef.current.nodes
      const instance = current.filter((node) => node.data.kind === kind).length + 1
      const label = kind === 'service' && instance === 1
        ? 'Service'
        : `${COMPONENT_LABELS[kind]}${instance > 1 ? ` ${instance}` : ''}`
      const node: SystemFlowNode = {
        id: createStableId(kind),
        type: 'system',
        selected: true,
        position: {
          x: 360 + (current.length % 4) * 42,
          y: 120 + (current.length % 3) * 95,
        },
        data: {
          kind,
          label,
          health: snapshot.nodeHealth[kind] ?? 'healthy',
          detail: snapshot.nodeDetails[kind] ?? 'Healthy',
          load,
        },
      }
      setNodes((nodes) => [
        ...nodes.map((item) => ({ ...item, selected: false })),
        node,
      ])
      addEvent(`${COMPONENT_LABELS[kind]} added`, 'Connect it to change the live model', 'healthy')
      recordAction({
        type: 'node.added',
        source: 'user',
        payload: { node: toReplayNode(node) },
        timeline: {
          title: `${label} added`,
          detail: 'Connect it to change the live model',
          tone: 'healthy',
        },
      })
    },
    [addEvent, load, recordAction, snapshot.nodeDetails, snapshot.nodeHealth],
  )

  const changeNodeTopology = useCallback((
    nodeId: string,
    topology: { replicas: number; shards: number },
  ) => {
    const node = canonicalStateRef.current.nodes.find((item) => item.id === nodeId)
    if (!node) return
    const replicas = Math.min(4, Math.max(1, Math.floor(topology.replicas)))
    const shards = Math.min(8, Math.max(1, Math.floor(topology.shards)))
    setNodes((current) => current.map((item) => item.id === nodeId
      ? { ...item, data: { ...item.data, replicas, shards } }
      : item))

    if (node.data.kind === 'database') {
      const readReplicas = Math.min(2, Math.max(0, replicas - 1)) as CapacityTuning['readReplicas']
      const nextCapacity = { ...canonicalStateRef.current.capacity, readReplicas }
      setCapacity(nextCapacity)
      recordAction({
        type: 'capacity.changed',
        source: 'user',
        payload: { capacity: nextCapacity },
        timeline: {
          title: locale === 'ru' ? 'Репликация БД обновлена' : 'Database replication updated',
          detail: `${readReplicas} read replica${readReplicas === 1 ? '' : 's'}`,
          tone: 'neutral',
        },
      })
    }

    addEvent(
      locale === 'ru' ? 'Топология обновлена' : 'Topology updated',
      locale === 'ru'
        ? `${node.data.label}: ${replicas} репл., ${shards} шард.`
        : `${node.data.label}: ${replicas} replicas, ${shards} shards`,
      'neutral',
    )
    recordAction({
      type: 'node.updated',
      source: 'user',
      payload: { nodeId, patch: { data: { replicas, shards } } },
      timeline: {
        title: locale === 'ru' ? 'Топология обновлена' : 'Topology updated',
        detail: `${node.data.label}: ${replicas}× / ${shards} shards`,
        tone: 'neutral',
      },
    })
  }, [addEvent, locale, recordAction])

  const changeLoad = useCallback(
    (nextLoad: 1 | 3 | 10) => {
      setLoad(nextLoad)
      const offered = challengeId === 'news-feed'
        ? locale === 'ru' ? `Подано ${nextLoad * 30}k чтений ленты/с` : `${nextLoad * 30}k timeline reads/s offered`
        : locale === 'ru' ? `Подано ${nextLoad * 10}k запросов/с` : `${nextLoad * 10}k req/s offered`
      const title = locale === 'ru' ? `Целевая нагрузка: ${nextLoad}×` : `Load changed to ${nextLoad}×`
      addEvent(title, offered, nextLoad === 10 ? 'warning' : 'healthy')
      recordAction({
        type: 'load.changed',
        source: 'user',
        payload: { load: nextLoad },
        timeline: {
          title,
          detail: offered,
          tone: nextLoad === 10 ? 'warning' : 'healthy',
        },
      })
    },
    [addEvent, challengeId, locale, recordAction],
  )

  const changeFault = useCallback(
    (nextFault: FaultMode) => {
      setFault(nextFault)
      const tone: TimelineEvent['tone'] =
        nextFault === 'none'
          ? 'healthy'
          : nextFault === 'cache-outage' || nextFault === 'celebrity-spike'
            ? 'critical'
            : 'warning'
      addEvent(
        nextFault === 'none'
          ? locale === 'ru' ? 'Сбой снят' : 'Fault cleared'
          : localizedFaultLabels[locale][nextFault],
        nextFault === 'none'
          ? locale === 'ru' ? 'Система восстанавливается' : 'System is recovering'
          : locale === 'ru' ? 'Сбой добавлен в симуляцию' : 'Fault injected into the simulation',
        tone,
      )
      recordAction({
        type: 'fault.changed',
        source: 'user',
        payload: { fault: nextFault },
        timeline: {
          title: nextFault === 'none'
            ? locale === 'ru' ? 'Сбой снят' : 'Fault cleared'
            : nextFault === 'cache-outage'
              ? locale === 'ru' ? 'Redis стал недоступен' : 'Redis became unavailable'
              : localizedFaultLabels[locale][nextFault],
          detail: nextFault === 'none'
            ? locale === 'ru' ? 'Система восстанавливается' : 'System is recovering'
            : locale === 'ru' ? 'Сбой добавлен в симуляцию' : 'Fault injected into the simulation',
          tone,
        },
      })
    },
    [addEvent, locale, recordAction],
  )

  const changeCapacity = useCallback((nextCapacity: CapacityTuning) => {
    setCapacity(nextCapacity)
    setNodes((current) => current.map((node) => node.data.kind === 'database'
      ? { ...node, data: { ...node.data, replicas: nextCapacity.readReplicas + 1 } }
      : node))
    const changedKey = (Object.keys(nextCapacity) as Array<keyof CapacityTuning>)
      .find((key) => nextCapacity[key] !== capacity[key])
    const detail = changedKey
      ? `${changedKey.replace(/([A-Z])/g, ' $1').toLowerCase()} updated`
      : 'Reference tuning restored'
    addEvent('Capacity tuning updated', detail, 'neutral')
    recordAction({
      type: 'capacity.changed',
      source: 'user',
      payload: { capacity: { ...nextCapacity } },
      timeline: {
        title: 'Capacity tuning updated',
        detail,
        tone: 'neutral',
      },
    })
  }, [addEvent, capacity, recordAction])

  const switchChallenge = useCallback((nextId: ScenarioId) => {
    const pack = getChallengePack(nextId)
    setChallengeId(nextId)
    setNodes(clonePackNodes(pack))
    setEdges(clonePackEdges(pack))
    setActiveKind(pack.panel === 'fanout' ? 'queue' : 'cache')
    setSelectedNodeId(pack.seedNodes.find((node) => node.data.kind === 'service')?.id ?? null)
    setLoad(pack.defaults.load)
    setFault(pack.defaults.fault)
    setCapacity({ ...pack.defaults.tuning })
    setTick(0)
    setElapsedSeconds(0)
    setPlaying(true)
    setRightPanelMode('bottleneck')
    setInterviewerOpen(false)
    setChallengeOpen(true)
    setHistoryOpen(false)
    setJudgeReport(null)
    setBottleneckPrediction(null)
    setPredictionRationale('')
    setPredictionLocked(false)
    setFanoutPrediction(null)
    setFanoutPredictionRationale('')
    setFanoutPredictionLocked(false)
    const initial = computeSimulation({
      scenario: nextId,
      loadMultiplier: pack.defaults.load,
      fault: pack.defaults.fault,
      tick: 0,
      capacity: pack.defaults.tuning,
    }).metrics
    setTelemetry(Array.from({ length: 22 }, (_, index) => ({ tick: index - 21, ...initial })))
    setEvents([{
      id: `challenge-${nextId}`,
      timestamp: '00:00',
      title: `${pack.definition.title} loaded`,
      detail: pack.definition.summary,
      tone: 'neutral',
    }])
    draftAttemptRef.current = null
    recordingElapsedMsRef.current = 0
    setDraftAttempt(null)
  }, [])

  const commitPrediction = useCallback(() => {
    if (!bottleneckPrediction || predictionRationale.trim().length < 8) return
    setPredictionLocked(true)
    const matches = bottleneckPrediction === capacityReport.bottleneck
    addEvent(
      'Bottleneck prediction committed',
      matches ? 'Prediction matches the estimated model' : `Model points to ${capacityReport.bottleneck}`,
      matches ? 'healthy' : 'warning',
    )
    recordAction({
      type: 'answer.submitted',
      source: 'user',
      payload: {
        answer: predictionRationale.trim(),
        prompt: 'What saturates first at 100k redirects/s during a cache outage?',
        feedback: matches
          ? 'The prediction matches the current estimate.'
          : `The current estimate points to ${capacityReport.bottleneck}.`,
        focus: `prediction:${bottleneckPrediction}`,
      },
      timeline: {
        title: `Predicted ${bottleneckPrediction.replace('-', ' ')}`,
        detail: matches ? 'Prediction holds' : 'Counterfactual revealed another limit',
        tone: matches ? 'healthy' : 'warning',
      },
    })
  }, [
    addEvent,
    bottleneckPrediction,
    capacityReport.bottleneck,
    predictionRationale,
    recordAction,
  ])

  const commitFanoutPrediction = useCallback(() => {
    if (!fanoutPrediction || fanoutPredictionRationale.trim().length < 8) return
    setFanoutPredictionLocked(true)
    const matches = fanoutPrediction === baselineNewsFeedReport.bottleneck
    addEvent(
      'Spike prediction committed',
      matches
        ? 'Prediction matches the estimated fan-out model'
        : `Model points to ${baselineNewsFeedReport.bottleneck.replace(/-/g, ' ')}`,
      matches ? 'healthy' : 'warning',
    )
    recordAction({
      type: 'answer.submitted',
      source: 'user',
      payload: {
        answer: fanoutPredictionRationale.trim(),
        prompt: 'What saturates first when one post targets 50 million followers?',
        feedback: matches
          ? 'The prediction matches the current estimate.'
          : `The current estimate points to ${baselineNewsFeedReport.bottleneck}.`,
        focus: `prediction:${fanoutPrediction}`,
      },
      timeline: {
        title: `Predicted ${fanoutPrediction.replace(/-/g, ' ')}`,
        detail: matches ? 'Prediction holds' : 'Counterfactual revealed another limit',
        tone: matches ? 'healthy' : 'warning',
      },
    })
  }, [
    addEvent,
    baselineNewsFeedReport.bottleneck,
    fanoutPrediction,
    fanoutPredictionRationale,
    recordAction,
  ])

  const submitDesign = useCallback(() => {
    const judge = challengeId === 'news-feed' ? judgeNewsFeed : judgeUrlShortener
    const report = judge(
      {
        componentCounts,
        replicaCounts,
        criticalPathConnected,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
      { simulate: (input) => computeSimulation({ ...input, scenario: challengeId, capacity }) },
    )
    setJudgeReport(report)
    addEvent(
      'Design submitted',
      `${report.score}/100 · ${report.passedCases}/${report.totalCases} cases passed`,
      report.passed ? 'healthy' : report.score >= 60 ? 'warning' : 'critical',
    )
    const recorded = recordAction({
      type: 'design.submitted',
      source: 'user',
      payload: {
        submission: {
          judgeVersion: report.judgeVersion,
          score: report.score,
          maxScore: report.maxScore,
          passed: report.passed,
          passedCases: report.passedCases,
          totalCases: report.totalCases,
        },
      },
      timeline: {
        title: `Design submitted · ${report.score}/100`,
        detail: `${report.passedCases} of ${report.totalCases} cases passed`,
        tone: report.passed ? 'healthy' : report.score >= 60 ? 'warning' : 'critical',
      },
    })
    const criticalEvent = recorded.events.find((event) => event.timeline?.tone === 'critical')
    const initialFailure = recorded.initial.fault === 'none' ? null : {
      title: recorded.initial.fault === 'cache-outage'
        ? 'Attempt started with Redis unavailable'
        : recorded.initial.fault === 'celebrity-spike'
          ? 'Attempt started with a 50M-follower spike'
          : `Attempt started with ${FAULT_LABELS[recorded.initial.fault].toLowerCase()}`,
      detail: 'This failure was already active in the initial state.',
      tone: 'critical' as const,
      atMs: 0,
    }
    const completed: ReplayAttemptV1 = {
      ...recorded,
      summary: {
        score: report.score,
        maxScore: report.maxScore,
        passed: report.passed,
        keyMoment: criticalEvent?.timeline ? {
          ...criticalEvent.timeline,
          atMs: criticalEvent.atMs,
          eventId: criticalEvent.id,
        } : initialFailure ?? {
          title: 'Design submitted without an injected failure',
          detail: 'The submission captured the final architecture state.',
          tone: 'neutral',
          atMs: recorded.durationMs,
        },
      },
    }
    try {
      replayRepository.save(completed)
      setSavedAttempts(replayRepository.list())
      addEvent('Attempt saved', 'Replay is available in History', 'healthy')
    } catch {
      addEvent('Replay not saved', 'Local storage is unavailable', 'warning')
    }
    draftAttemptRef.current = null
    recordingElapsedMsRef.current = 0
    setDraftAttempt(null)
  }, [
    addEvent,
    capacity,
    challengeId,
    componentCounts,
    criticalPathConnected,
    edges.length,
    fault,
    load,
    nodes.length,
    replicaCounts,
    recordAction,
    replayRepository,
  ])

  const shareScenario = useCallback(async () => {
    const serialized = replayAttempt
      ? serializeReplayEnvelope(replayAttempt, { redactAnswers: true, pretty: true })
      : JSON.stringify(
      {
        version: 1,
        challenge: challengeId,
        load,
        fault,
        capacity,
        nodes: nodes.map((node) => ({
          id: node.id,
          kind: node.data.kind,
          label: node.data.label,
          position: node.position,
        })),
        edges: edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
        })),
      },
      null,
      2,
    )

    try {
      await navigator.clipboard.writeText(serialized)
      addEvent(
        replayAttempt ? 'Replay copied' : 'Scenario copied',
        replayAttempt ? 'The full attempt is ready to import' : 'Architecture snapshot is ready to share',
        'healthy',
      )
    } catch {
      addEvent('Share unavailable', 'Clipboard access was not granted', 'warning')
    }
  }, [addEvent, capacity, challengeId, edges, fault, load, nodes, replayAttempt])

  const openHistory = useCallback(() => {
    setChallengeOpen(false)
    setInterviewerOpen(false)
    setHistoryNotice(null)
    setHistoryOpen(true)
  }, [])

  const startReplay = useCallback((attemptId: string) => {
    const attempt = savedAttempts.find((candidate) => candidate.id === attemptId)
    if (!attempt) return
    if (!replayAttempt) {
      liveStateBeforeReplayRef.current = {
        nodes: canonicalStateRef.current.nodes,
        edges: canonicalStateRef.current.edges,
        load: canonicalStateRef.current.load,
        fault: canonicalStateRef.current.fault,
        capacity: canonicalStateRef.current.capacity,
        challengeId: canonicalStateRef.current.challengeId,
        playing,
      }
    }
    setChallengeOpen(false)
    setHistoryOpen(false)
    setInterviewerOpen(false)
    setReplayAttempt(attempt)
    setChallengeId(attempt.challengeId === 'news-feed' ? 'news-feed' : 'url-shortener')
    setReplayCursorMs(0)
    setReplayPlaying(false)
    setReplaySpeed(1)
  }, [playing, replayAttempt, savedAttempts])

  const exitReplay = useCallback(() => {
    const live = liveStateBeforeReplayRef.current
    setReplayPlaying(false)
    setReplayAttempt(null)
    setReplayCursorMs(0)
    setHistoryOpen(false)
    if (live) {
      setNodes(live.nodes)
      setEdges(live.edges)
      setLoad(live.load)
      setFault(live.fault)
      setCapacity(live.capacity)
      setChallengeId(live.challengeId)
      setPlaying(live.playing)
    }
    liveStateBeforeReplayRef.current = null
    setInterviewerOpen(true)
  }, [])

  const deleteReplay = useCallback((attemptId: string) => {
    try {
      replayRepository.remove(attemptId)
      setSavedAttempts(replayRepository.list())
      if (replayAttempt?.id === attemptId) exitReplay()
    } catch {
      setHistoryNotice({ message: 'Could not delete replay. Local storage is unavailable.', tone: 'error' })
      addEvent('Could not delete replay', 'Local storage is unavailable', 'warning')
    }
  }, [addEvent, exitReplay, replayAttempt?.id, replayRepository])

  const importReplay = useCallback(async (file: File) => {
    try {
      const result = parseReplayEnvelope(await file.text())
      if (!result.ok) {
        setHistoryNotice({ message: result.error.message, tone: 'error' })
        addEvent('Replay import failed', result.error.message, 'critical')
        return
      }
      replayRepository.save(verifyImportedAttempt(result.value.attempt))
      setSavedAttempts(replayRepository.list())
      setHistoryOpen(true)
      setHistoryNotice({
        message: result.migrated
          ? 'Imported and migrated the v0.1 scenario snapshot.'
          : 'Replay imported and saved on this device.',
        tone: 'success',
      })
      addEvent(
        result.migrated ? 'Scenario migrated' : 'Replay imported',
        result.migrated ? 'The v0.1 snapshot is now replayable' : 'Saved to this device',
        'healthy',
      )
    } catch {
      setHistoryNotice({ message: 'The selected replay file could not be read.', tone: 'error' })
      addEvent('Replay import failed', 'The selected file could not be read', 'critical')
    }
  }, [addEvent, replayRepository])

  const seekReplay = useCallback((cursorMs: number) => {
    if (!replayAttempt) return
    setReplayPlaying(false)
    setReplayCursorMs(Math.min(replayAttempt.durationMs, Math.max(0, cursorMs)))
  }, [replayAttempt])

  const toggleReplay = useCallback(() => {
    if (!replayAttempt) return
    if (replayCursorMs >= replayAttempt.durationMs) setReplayCursorMs(0)
    setReplayPlaying((current) => !current)
  }, [replayAttempt, replayCursorMs])

  const seekReplayEvent = useCallback((direction: -1 | 1) => {
    if (!replayAttempt) return
    const candidates = replayTimelineEvents(replayAttempt)
    const event = direction < 0
      ? [...candidates].reverse().find((candidate) => candidate.atMs < replayCursorMs - 50)
      : candidates.find((candidate) => candidate.atMs > replayCursorMs + 50)
    seekReplay(event?.atMs ?? (direction < 0 ? 0 : replayAttempt.durationMs))
  }, [replayAttempt, replayCursorMs, seekReplay])

  const interviewContext = useMemo<InterviewContext>(
    () => ({
      scenario: challengeId,
      loadMultiplier: load,
      fault,
      metrics: snapshot.metrics,
      nodeLabels: nodes.map((node) => node.data.label),
      edgeCount: edges.length,
      recentEvents: events.slice(0, 5),
    }),
    [challengeId, edges.length, events, fault, load, nodes, snapshot.metrics],
  )

  useEffect(() => {
    if (replayAttempt) return
    let cancelled = false
    interviewRouter
      .respond({ action: 'continue', context: interviewContext })
      .then((response) => {
        if (!cancelled) setPrompt(response.prompt)
      })
    return () => {
      cancelled = true
    }
  }, [challengeId, fault, load, criticalPathConnected, replayAttempt])

  const runInterviewAction = useCallback(
    async (action: InterviewAction) => {
      setInterviewBusy(true)
      try {
        const response = await interviewRouter.respond({
          action,
          answer: action === 'answer' ? answer : undefined,
          context: interviewContext,
        })
        setPrompt(response.prompt)
        setFeedback(response.message)
        if (action === 'answer') {
          addEvent('Answer reviewed', `Focus: ${response.focus}`, 'neutral')
          recordAction({
            type: 'answer.submitted',
            source: 'interviewer',
            payload: {
              answer,
              prompt,
              feedback: response.message,
              focus: response.focus,
            },
            timeline: {
              title: 'Answer reviewed',
              detail: `Focus: ${response.focus}`,
              tone: 'neutral',
            },
          })
          setAnswer('')
        }
      } finally {
        window.setTimeout(() => setInterviewBusy(false), 180)
      }
    },
    [addEvent, answer, interviewContext, prompt, recordAction],
  )

  const defendCapacity = useCallback(() => {
    if (challengeId === 'news-feed') {
      const tuning = normalizeNewsFeedTuning(capacity)
      setPrompt(
        `You chose ${tuning.strategy} fan-out, ${tuning.workers} workers, batches of ${tuning.batchSize}, ` +
        `and ${tuning.deduplication ? 'idempotent delivery' : 'no deduplication'}. Defend the ${Math.round(newsFeedReport.cost.total)} USD/month trade-off.`,
      )
      setFeedback('Explain when you would move an account between write and read fan-out, and which queue-lag alarm changes that decision.')
      setRightPanelMode('interview')
      setInterviewerOpen(true)
      addEvent('Design ready to defend', 'Interviewer is challenging freshness, cost, and delivery semantics', 'neutral')
      return
    }
    setPrompt(
      `You chose ${capacity.indexedLookup ? 'an indexed lookup' : 'a scan-prone lookup'}, ` +
      `${capacity.readReplicas} read replica${capacity.readReplicas === 1 ? '' : 's'}, and a ` +
      `${capacity.databaseProfile} database. Defend the ${Math.round(capacityReport.cost.total)} USD/month trade-off.`,
    )
    setFeedback('Explain which assumption you would benchmark first and what would make you reverse this decision.')
    setRightPanelMode('interview')
    setInterviewerOpen(true)
    addEvent('Design ready to defend', 'Interviewer is challenging the cost and bottleneck assumptions', 'neutral')
  }, [addEvent, capacity, capacityReport.cost.total, challengeId, newsFeedReport.cost.total])

  return (
    <div
      className={`app-shell ${interviewerOpen ? 'interviewer-open' : 'interviewer-closed'} ${
        (replayAttempt ? replayPlaying : playing) ? 'simulation-running' : 'simulation-paused'
      } ${replayAttempt ? 'replay-mode' : ''} ${rightPanelMode === 'bottleneck' ? 'bottleneck-mode' : ''} ${
        selectedNode ? 'node-inspector-open' : ''
      }`}
    >
      <TopBar
        challengeId={challengeId}
        locale={locale}
        onLocaleChange={setLocale}
        challengeTitle={scenarioLabels[locale][challengeId].title}
        challengeOptions={localizedChallengeOptions}
        onChallengeChange={switchChallenge}
        elapsedSeconds={replayAttempt ? Math.floor(replayCursorMs / 1000) : elapsedSeconds}
        playing={replayAttempt ? replayPlaying : playing}
        onTogglePlaying={() => setPlaying((value) => !value)}
        interviewerOpen={interviewerOpen && !historyOpen && !replayAttempt}
        onToggleInterviewer={() => {
          setSelectedNodeId(null)
          setInterviewerOpen((value) => !value)
        }}
        onOpenCapacity={() => {
          setSelectedNodeId(null)
          setRightPanelMode('bottleneck')
          setInterviewerOpen(true)
        }}
        defenseLabel={locale === 'ru'
          ? activePack.panel === 'fanout' ? 'Защита от скачка' : 'Защита узкого места'
          : activePack.panel === 'fanout' ? 'Celebrity Defense' : 'Bottleneck Defense'}
        capacityActive={rightPanelMode === 'bottleneck' && interviewerOpen}
        onOpenChallenge={() => {
          if (!replayAttempt) setChallengeOpen(true)
        }}
        onOpenHistory={openHistory}
        onShare={() => void shareScenario()}
        replayMode={Boolean(replayAttempt)}
        recording={Boolean(draftAttempt)}
        replayDurationSeconds={Math.floor((replayAttempt?.durationMs ?? 0) / 1000)}
        onExitReplay={exitReplay}
      />
      <div className="workspace">
        <ArchitectureCanvas
          nodes={nodes}
          edges={edges}
          activeKind={activeKind}
          load={load}
          effectiveLoad={effectiveLoad}
          fault={fault}
          locale={locale}
          scenario={challengeId}
          selectedNode={selectedNode}
          telemetry={telemetry}
          faults={activePack.faults}
          telemetryLabels={locale === 'ru'
            ? challengeId === 'news-feed'
              ? { throughput: 'Доставки', p99: 'Свежесть', errorRate: 'Устаревшие', dbCpu: 'Воркеры' }
              : { throughput: 'Пропускная способность', p99: 'p99', errorRate: 'Ошибки', dbCpu: 'CPU БД' }
            : activePack.telemetryLabels}
          canvasLabel={locale === 'ru'
            ? challengeId === 'news-feed' ? 'Архитектура ленты новостей' : 'Архитектура коротких ссылок'
            : activePack.canvasLabel}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onAddNode={addNode}
          onNodeSelected={(node) => {
            setActiveKind(node.data.kind)
            setSelectedNodeId(node.id)
          }}
          onInspectorClose={() => setSelectedNodeId(null)}
          onTopologyChange={changeNodeTopology}
          onLoadChange={changeLoad}
          onFaultChange={changeFault}
          readOnly={Boolean(replayAttempt)}
          fitViewKey={replayAttempt?.id ?? `${challengeId}-live`}
          bottomOverlay={replayAttempt ? (
            <ReplayTimeline
              cursorMs={replayCursorMs}
              durationMs={replayAttempt.durationMs}
              playing={replayPlaying}
              speed={replaySpeed}
              events={replayEvents}
              activeEvent={activeReplayEvent}
              metrics={{
                throughput: formatMetric(snapshot.metrics.throughput, 'throughput'),
                p99: formatMetric(snapshot.metrics.p99, 'p99'),
                errors: `${snapshot.metrics.errorRate.toFixed(1)}%`,
                dbCpu: `${Math.round(snapshot.metrics.dbCpu)}%`,
              }}
              metricLabels={{
                throughput: activePack.telemetryLabels.throughput,
                p99: activePack.telemetryLabels.p99,
                errors: activePack.telemetryLabels.errorRate,
                dbCpu: activePack.telemetryLabels.dbCpu,
              }}
              onCursorChange={seekReplay}
              onTogglePlaying={toggleReplay}
              onPreviousEvent={() => seekReplayEvent(-1)}
              onNextEvent={() => seekReplayEvent(1)}
              onSpeedChange={setReplaySpeed}
            />
          ) : undefined}
        />
        {!historyOpen && !replayAttempt && rightPanelMode === 'interview' && <InterviewerPanel
          open={interviewerOpen}
          locale={locale}
          providerLabel={locale === 'ru' ? 'Локальный режим' : 'Local preview'}
          prompt={prompt}
          feedback={feedback}
          answer={answer}
          busy={interviewBusy}
          events={events}
          onAnswerChange={setAnswer}
          onSubmit={() => void runInterviewAction('answer')}
          onHint={() => void runInterviewAction('hint')}
          onReview={() => void runInterviewAction('review')}
          onContinue={() => void runInterviewAction('continue')}
          onOpenCapacity={() => setRightPanelMode('bottleneck')}
          onClose={() => setInterviewerOpen((value) => !value)}
        />}
        {!historyOpen && !replayAttempt && rightPanelMode === 'bottleneck' && activePack.panel === 'capacity' && (
          <BottleneckPanel
            open={interviewerOpen}
            locale={locale}
            tuning={capacity}
            report={capacityReport}
            baseline={baselineCapacityReport}
            prediction={bottleneckPrediction}
            rationale={predictionRationale}
            predictionLocked={predictionLocked}
            onPredictionChange={setBottleneckPrediction}
            onRationaleChange={setPredictionRationale}
            onCommitPrediction={commitPrediction}
            onTuningChange={changeCapacity}
            onDefend={defendCapacity}
            onReset={() => changeCapacity({
              ...DEFAULT_CAPACITY_TUNING,
              pricingPackId: capacity.pricingPackId,
              benchmarkPackId: capacity.benchmarkPackId,
            })}
            onOpenInterviewer={() => {
              setSelectedNodeId(null)
              setRightPanelMode('interview')
            }}
            onClose={() => setInterviewerOpen((value) => !value)}
          />
        )}
        {!historyOpen && !replayAttempt && rightPanelMode === 'bottleneck' && activePack.panel === 'fanout' && (
          <FanoutPanel
            open={interviewerOpen}
            locale={locale}
            tuning={capacity}
            report={newsFeedReport}
            baseline={baselineNewsFeedReport}
            prediction={fanoutPrediction}
            rationale={fanoutPredictionRationale}
            predictionLocked={fanoutPredictionLocked}
            onPredictionChange={setFanoutPrediction}
            onRationaleChange={setFanoutPredictionRationale}
            onCommitPrediction={commitFanoutPrediction}
            onTuningChange={changeCapacity}
            onDefend={defendCapacity}
            onReset={() => changeCapacity({ ...DEFAULT_NEWS_FEED_TUNING })}
            onOpenInterviewer={() => {
              setSelectedNodeId(null)
              setRightPanelMode('interview')
            }}
            onClose={() => setInterviewerOpen((value) => !value)}
          />
        )}
        {historyOpen && (
          <HistoryPanel
            open
            attempts={historyItems}
            notice={historyNotice}
            onClose={() => {
              setHistoryOpen(false)
              if (!replayAttempt) setInterviewerOpen(true)
            }}
            onReplay={startReplay}
            onDelete={deleteReplay}
            onExport={(attemptId) => {
              const attempt = savedAttempts.find((candidate) => candidate.id === attemptId)
              if (attempt) downloadReplay(attempt)
            }}
            onImport={(file) => void importReplay(file)}
          />
        )}
        {replayAttempt && !historyOpen && (
          <ReplayPanel
            score={replayAttempt.summary?.score}
            passed={replayAttempt.summary?.passed}
            keyMoment={replayKeyMoment(replayAttempt)}
            events={replayEvents}
            cursorMs={replayCursorMs}
            activeEventId={activeReplayEvent?.id}
            onSeek={seekReplay}
            onExport={() => downloadReplay(replayAttempt)}
          />
        )}
      </div>
      <ChallengePanel
        challenge={activePack.definition}
        locale={locale}
        open={challengeOpen && !replayAttempt}
        onClose={() => setChallengeOpen(false)}
        onRunCase={(nextLoad, nextFault) => {
          changeLoad(nextLoad)
          changeFault(nextFault)
        }}
        report={judgeReport}
        onSubmitDesign={submitDesign}
      />
      <div className="screen-reader-status" aria-live="polite">
        {replayAttempt
          ? `Replay ${replayPlaying ? 'playing' : 'paused'} at ${formatClock(Math.floor(replayCursorMs / 1000))}.`
          : `${playing ? 'Simulation running' : 'Simulation paused'}. ${snapshot.severity} state.${draftAttempt ? ' Attempt recording.' : ''}`}
      </div>
    </div>
  )
}
