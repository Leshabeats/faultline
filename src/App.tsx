import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArchitectureCanvas } from './canvas/ArchitectureCanvas'
import type { SystemFlowEdge, SystemFlowNode } from './canvas/types'
import { projectFaultEdges, projectFaultNodes } from './canvas/faultPresentation'
import {
  projectCacheAsideTraffic,
  summarizeCacheHealth,
} from './canvas/cacheAsidePresentation'
import { InterviewerPanel } from './components/InterviewerPanel'
import {
  BottleneckPanel,
  type BottleneckPrediction,
} from './components/BottleneckPanel'
import { ChallengePanel } from './components/ChallengePanel'
import { FanoutPanel, type FanoutPrediction } from './components/FanoutPanel'
import { HistoryPanel, type HistoryAttemptItem } from './components/HistoryPanel'
import { PublishReplayDialog } from './components/PublishReplayDialog'
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
  type ComponentKind,
  type CapacityTuning,
  type FaultMode,
  type FaultTarget,
  type Locale,
  type LoadMultiplier,
  type ScenarioId,
  type TelemetryPoint,
  type TimelineEvent,
} from './domain/system'
import {
  applicationCopy,
  bottleneckCopy,
  capacityChangeDetail,
  fallbackKeyMoment,
  replayImportErrorCopy,
} from './application/copy'
import { useInterviewSession } from './application/useInterviewSession'
import { useArchitectureEditor } from './canvas/useArchitectureEditor'
import {
  databaseReplicas,
  normalizeNodeTopology,
} from './domain/topology'
import {
  DEFAULT_CAPACITY_TUNING,
  estimateCapacity,
} from './capacity/model'
import {
  DEFAULT_NEWS_FEED_TUNING,
  estimateNewsFeed,
  normalizeNewsFeedTuning,
} from './newsFeed/model'
import type { InterviewContext } from './interview/types'
import { interviewRouter } from './interview/router'
import { judgeNewsFeed, judgeUrlShortener, type JudgeReport } from './judge'
import { computeSimulation, formatMetric } from './simulation/engine'
import { analyzeTargetedFault } from './simulation/faultImpact'
import { analyzeTopology } from './simulation/topology'
import {
  ReplayAttemptRepository,
  createReplayAttempt,
  createReplayFaultChangedPayload,
  parseReplayEnvelope,
  playReplayAt,
  recordReplayEvent,
  serializeScenarioSnapshot,
  serializeReplayEnvelope,
  type ReplayAttemptV1,
  type ReplayEventContentV1,
  type ReplayEventDraftV1,
} from './replay'
import {
  createStableId,
  downloadReplay,
  presentReplayFrame,
  replayKeyMoment,
  replayTimelineEvents,
  toReplayInitial,
} from './replay/presentation'
import { verifyImportedAttempt } from './replay/verification'
import { UI_COPY, faultLabels as localizedFaultLabels, initialLocale, localizeChallengeDefinition, localizeNodeDetail, localizeNodeLabel, scenarioLabels } from './i18n'
import { useTrafficRamp } from './simulation/useTrafficRamp'
import {
  FetchPublicReplayClient,
  createPublicReplayCapabilityStore,
  createPublicReplayEnvelope,
  previewPublicReplay,
  publicReplayHref,
  nextPublishRetry,
  publicReplayErrorCopy,
  resolvePublishAttempt,
  unpublishPublicReplay,
  unpublishResultTargetsActiveAttempt,
  type PublicReplayError,
} from './publicReplay'

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
    translations: {
      en: { title: 'Architecture ready', detail: 'Healthy 1× baseline, no faults' },
      ru: { title: 'Схема готова', detail: 'Штатная нагрузка 1×, сбоев нет' },
    },
    tone: 'healthy',
  },
]

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
  const copy = applicationCopy[locale]
  const [challengeId, setChallengeId] = useState<ScenarioId>('url-shortener')
  const activePack = getChallengePack(challengeId)
  const [nodes, setNodes] = useState<SystemFlowNode[]>(() => clonePackNodes(getChallengePack('url-shortener')))
  const [edges, setEdges] = useState<SystemFlowEdge[]>(() => clonePackEdges(getChallengePack('url-shortener')))
  const [activeKind, setActiveKind] = useState<ComponentKind>('cache')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('api')
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [load, setLoad] = useState<LoadMultiplier>(1)
  const [fault, setFault] = useState<FaultMode>('none')
  const [faultTarget, setFaultTarget] = useState<FaultTarget | null>(null)
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
  const [judgeReport, setJudgeReport] = useState<JudgeReport | null>(null)
  const [replayRepository] = useState(createReplayRepository)
  const [capabilityStore] = useState(createPublicReplayCapabilityStore)
  const [publicReplayClient] = useState(() => new FetchPublicReplayClient())
  const [capabilitiesVersion, setCapabilitiesVersion] = useState(0)
  const [publishAttempt, setPublishAttempt] = useState<ReplayAttemptV1 | null>(null)
  const publishAttemptRef = useRef<ReplayAttemptV1 | null>(null)
  publishAttemptRef.current = publishAttempt
  const [publishStatus, setPublishStatus] = useState<'confirm' | 'publishing' | 'ready' | 'error'>('confirm')
  const [publishUrl, setPublishUrl] = useState<string>()
  const [publishError, setPublishError] = useState<string>()
  const [publishCopied, setPublishCopied] = useState(false)
  const [publishAction, setPublishAction] = useState<'publish' | 'unpublish'>('publish')
  const [publishUnpublishing, setPublishUnpublishing] = useState(false)
  const unpublishInFlightRef = useRef(false)
  const [lastSubmittedAttempt, setLastSubmittedAttempt] = useState<ReplayAttemptV1 | null>(null)
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
  const canonicalStateRef = useRef({ nodes, edges, load, fault, faultTarget, capacity, challengeId })
  const liveStateBeforeReplayRef = useRef<{
    nodes: SystemFlowNode[]
    edges: SystemFlowEdge[]
    load: 1 | 3 | 10
    fault: FaultMode
    faultTarget: FaultTarget | null
    capacity: CapacityTuning
    challengeId: ScenarioId
    playing: boolean
  } | null>(null)

  canonicalStateRef.current = { nodes, edges, load, fault, faultTarget, capacity, challengeId }
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null
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
  const targetedFaultImpact = useMemo(
    () => analyzeTargetedFault(
      nodes,
      edges,
      fault === 'none' ? null : faultTarget,
    ),
    [fault, faultTarget, graphTopology],
  )
  const simulationTopology = targetedFaultImpact.topology

  useEffect(() => {
    if (!faultTarget) return
    const targetStillExists = faultTarget.type === 'node'
      ? nodes.some((node) => node.id === faultTarget.id)
      : edges.some((edge) => edge.id === faultTarget.id)
    if (!targetStillExists) {
      setFault('none')
      setFaultTarget(null)
    }
  }, [faultTarget, graphTopology])

  const snapshot = useMemo(
    () =>
      computeSimulation({
        scenario: challengeId,
        loadMultiplier: effectiveLoad,
        fault,
        tick,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        componentCounts: simulationTopology.componentCounts,
        replicaCounts: simulationTopology.replicaCounts,
        criticalPathConnected: simulationTopology.criticalPathConnected,
        faultImpact: targetedFaultImpact.summary,
        capacity,
      }),
    [capacity, challengeId, edges.length, effectiveLoad, fault, nodes.length, simulationTopology, targetedFaultImpact.summary, tick],
  )

  const capacityReport = useMemo(
    () => estimateCapacity({
      loadMultiplier: effectiveLoad,
      fault,
      tuning: capacity,
      componentCounts: simulationTopology.componentCounts,
      replicaCounts: simulationTopology.replicaCounts,
      criticalPathConnected: simulationTopology.criticalPathConnected,
    }),
    [capacity, effectiveLoad, fault, simulationTopology],
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
      componentCounts: simulationTopology.componentCounts,
      replicaCounts: simulationTopology.replicaCounts,
      criticalPathConnected: simulationTopology.criticalPathConnected,
    }),
    [
      capacity.benchmarkPackId,
      capacity.pricingPackId,
      simulationTopology,
      fault,
      effectiveLoad,
    ],
  )

  const newsFeedReport = useMemo(
    () => estimateNewsFeed({
      loadMultiplier: effectiveLoad,
      fault,
      tuning: capacity,
      componentCounts: simulationTopology.componentCounts,
      criticalPathConnected: simulationTopology.criticalPathConnected,
    }),
    [capacity, effectiveLoad, fault, simulationTopology],
  )
  const baselineNewsFeedReport = useMemo(
    () => estimateNewsFeed({
      loadMultiplier: effectiveLoad,
      fault,
      tuning: DEFAULT_NEWS_FEED_TUNING,
      componentCounts: simulationTopology.componentCounts,
      criticalPathConnected: simulationTopology.criticalPathConnected,
    }),
    [effectiveLoad, fault, simulationTopology],
  )

  const replayFrame = useMemo(
    () => replayAttempt ? playReplayAt(replayAttempt, replayCursorMs) : null,
    [replayAttempt, replayCursorMs],
  )
  const replayEvents = useMemo(
    () => replayAttempt ? replayTimelineEvents(replayAttempt, locale) : [],
    [locale, replayAttempt],
  )
  const activeReplayEvent = useMemo(
    () => [...replayEvents].reverse().find((event) => event.atMs <= replayCursorMs) ?? null,
    [replayCursorMs, replayEvents],
  )
  const historyItems = useMemo<HistoryAttemptItem[]>(
    () => savedAttempts.map((attempt) => {
      const challenge = challengeOptions.find((option) => option.id === attempt.challengeId)
      return {
        id: attempt.id,
        title: challenge ? scenarioLabels[locale][challenge.id].title : attempt.challengeId,
        completedAt: attempt.updatedAt,
        durationMs: attempt.durationMs,
        score: attempt.summary?.score,
        passed: attempt.summary?.passed,
        keyMoment: replayKeyMoment(attempt, locale),
        publicUrl: capabilityStore.getByAttemptId(attempt.id)?.url,
      }
    }),
    [capabilityStore, capabilitiesVersion, locale, savedAttempts],
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
      translations?: TimelineEvent['translations'],
    ) => {
      setEvents((current) => [
        {
          id: `${Date.now()}-${title}`,
          timestamp: formatClock(elapsedSeconds),
          title,
          detail,
          ...(translations ? { translations } : {}),
          tone,
        },
        ...current,
      ].slice(0, 12))
    },
    [elapsedSeconds],
  )

  const recordAction = useCallback((draft: ReplayEventContentV1) => {
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
          canonical.faultTarget,
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
    const presentation = presentReplayFrame(
      replayFrame,
      replayTick,
      !replayPlaying,
      replayScenario,
      locale,
    )
    setChallengeId(replayScenario)
    setLoad(replayFrame.load)
    setFault(replayFrame.fault)
    setFaultTarget(replayFrame.faultTarget ?? null)
    setCapacity({
      ...DEFAULT_CAPACITY_TUNING,
      ...(replayFrame.capacity ?? {}),
    })
    setTick(replayTick)
    setNodes(presentation.nodes)
    setEdges(presentation.edges)
  }, [locale, replayAttempt?.challengeId, replayCursorMs, replayFrame, replayPlaying])

  useEffect(() => {
    if (replayAttempt) return
    setTelemetry((history) => [
      ...history.slice(-27),
      { tick, ...snapshot.metrics },
    ])
  }, [replayAttempt, snapshot.metrics, tick])

  useEffect(() => {
    setNodes((current) => {
      return projectFaultNodes({
        nodes: current,
        fault,
        impact: targetedFaultImpact,
        routedNodeIds,
        criticalPathConnected,
        replicaCounts,
        nodeHealth: snapshot.nodeHealth,
        nodeDetails: snapshot.nodeDetails,
        load: effectiveLoad,
        resolveLabel: (node) => localizeNodeLabel(
          locale,
          challengeId,
          node.id,
          node.data.label,
        ),
        resolveDetail: (detail) => localizeNodeDetail(locale, detail),
      })
    })
  }, [
    criticalPathConnected,
    challengeId,
    fault,
    locale,
    effectiveLoad,
    replicaCounts.cache,
    routedNodeIds,
    snapshot.nodeDetails,
    snapshot.nodeHealth,
    targetedFaultImpact,
  ])

  useEffect(() => {
    const healthByNode = new Map(nodes.map((node) => [node.id, node.data.health]))
    const cacheHealth = summarizeCacheHealth(nodes)
    setEdges((current) => {
      const projected = projectFaultEdges({
        edges: current,
        nodeHealthById: healthByNode,
        impact: targetedFaultImpact,
        intensity: challengeId === 'news-feed' && fault === 'celebrity-spike' ? 10 : effectiveLoad,
        paused: replayAttempt ? !replayPlaying : !playing,
        resolveLabel: (edge) => {
          if (targetedFaultImpact.severedEdgeIds.includes(edge.id)) {
            return UI_COPY[locale].connectionPartitioned
          }
          if (challengeId === 'news-feed' && edge.id === 'feed-users-api') {
            return `${formatMetric(snapshot.metrics.throughput, 'throughput')} deliveries/s`
          }
          if (challengeId === 'news-feed' && edge.id === 'feed-api-store') {
            return `${Math.round(effectiveLoad * 2)}k posts/s`
          }
          if (challengeId === 'news-feed' && edge.id === 'feed-api-queue') {
            return fault === 'celebrity-spike'
              ? '50M fan-out'
              : `${formatMetric(snapshot.metrics.queueDepth, 'queueDepth')} queued`
          }
          if (challengeId === 'news-feed' && edge.id === 'feed-queue-workers') {
            return formatMetric(snapshot.metrics.p99, 'p99')
          }
          if (challengeId === 'news-feed' && edge.id === 'feed-workers-cache') {
            return normalizeNewsFeedTuning(capacity).strategy
          }
          if (edge.id === 'clients-edge') {
            return `${formatMetric(snapshot.metrics.throughput, 'throughput')} req/s`
          }
          return edge.label
        },
      })
      return challengeId === 'url-shortener'
        ? projectCacheAsideTraffic({
            edges: projected,
            snapshot,
            cacheHealth,
            locale,
          })
        : projected
    })
  }, [capacity, challengeId, effectiveLoad, fault, locale, nodes, playing, replayAttempt, replayPlaying, snapshot.metrics, targetedFaultImpact])

  const {
    onNodesChange,
    onNodeDragStop,
    onEdgesChange,
    onConnect,
    addNode,
    changeNodeTopology,
  } = useArchitectureEditor({
    nodes,
    load,
    playing,
    locale,
    capacity,
    snapshot,
    setNodes,
    setEdges,
    setCapacity,
    setActiveKind,
    addEvent,
    recordAction,
  })

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
    (nextFault: FaultMode, target?: FaultTarget) => {
      const nextTarget = nextFault === 'none' ? null : target ?? null
      setFault(nextFault)
      setFaultTarget(nextTarget)
      const impact = analyzeTargetedFault(
        canonicalStateRef.current.nodes,
        canonicalStateRef.current.edges,
        nextTarget,
      )
      const tone: TimelineEvent['tone'] =
        nextFault === 'none'
          ? 'healthy'
          : nextFault === 'cache-outage' || nextFault === 'celebrity-spike' || impact.summary?.routeDisconnected
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
        payload: createReplayFaultChangedPayload(nextFault, nextTarget),
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
    const databaseTopology = canonicalStateRef.current.nodes
      .filter((node) => node.data.kind === 'database')
      .map((node) => {
        const topology = normalizeNodeTopology(node.data.kind, {
          ...node.data,
          replicas: databaseReplicas(nextCapacity.readReplicas),
        })
        return { nodeId: node.id, ...topology }
      })
    setNodes((current) => current.map((node) => {
      const topology = databaseTopology.find((item) => item.nodeId === node.id)
      return topology
        ? { ...node, data: { ...node.data, replicas: topology.replicas, shards: topology.shards } }
        : node
    }))
    const changedKey = (Object.keys(nextCapacity) as Array<keyof CapacityTuning>)
      .find((key) => nextCapacity[key] !== capacity[key])
    const detail = capacityChangeDetail(locale, changedKey)
    addEvent(copy.capacityUpdated, detail, 'neutral')
    recordAction({
      type: 'capacity.changed',
      source: 'user',
      payload: {
        capacity: { ...nextCapacity },
        ...(nextCapacity.readReplicas !== capacity.readReplicas
          ? { topology: databaseTopology }
          : {}),
      },
      timeline: {
        title: copy.capacityUpdated,
        detail,
        tone: 'neutral',
      },
    })
  }, [addEvent, capacity, copy.capacityUpdated, locale, recordAction])

  const switchChallenge = useCallback((nextId: ScenarioId) => {
    const pack = getChallengePack(nextId)
    const localizedDefinition = localizeChallengeDefinition(pack.definition, locale)
    const translatedDefinitions = {
      en: localizeChallengeDefinition(pack.definition, 'en'),
      ru: localizeChallengeDefinition(pack.definition, 'ru'),
    }
    setChallengeId(nextId)
    setNodes(clonePackNodes(pack))
    setEdges(clonePackEdges(pack))
    setActiveKind(pack.panel === 'fanout' ? 'queue' : 'cache')
    setSelectedNodeId(pack.seedNodes.find((node) => node.data.kind === 'service')?.id ?? null)
    setSelectedEdgeId(null)
    setLoad(pack.defaults.load)
    setFault(pack.defaults.fault)
    setFaultTarget(null)
    setCapacity({ ...pack.defaults.tuning })
    setTick(0)
    setElapsedSeconds(0)
    setPlaying(true)
    setRightPanelMode('bottleneck')
    setInterviewerOpen(false)
    setChallengeOpen(true)
    setHistoryOpen(false)
    setJudgeReport(null)
    setLastSubmittedAttempt(null)
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
      title: locale === 'ru'
        ? `${localizedDefinition.title}: задача загружена`
        : `${localizedDefinition.title} loaded`,
      detail: localizedDefinition.summary,
      translations: {
        en: {
          title: `${translatedDefinitions.en.title} loaded`,
          detail: translatedDefinitions.en.summary,
        },
        ru: {
          title: `${translatedDefinitions.ru.title}: задача загружена`,
          detail: translatedDefinitions.ru.summary,
        },
      },
      tone: 'neutral',
    }])
    draftAttemptRef.current = null
    recordingElapsedMsRef.current = 0
    setDraftAttempt(null)
  }, [locale])

  const commitPrediction = useCallback(() => {
    if (!bottleneckPrediction || predictionRationale.trim().length < 8) return
    setPredictionLocked(true)
    const matches = bottleneckPrediction === capacityReport.bottleneck
    const estimatedBottleneck = bottleneckCopy(locale, capacityReport.bottleneck)
    const predictedBottleneck = bottleneckCopy(locale, bottleneckPrediction)
    const estimatedByLocale = {
      en: bottleneckCopy('en', capacityReport.bottleneck),
      ru: bottleneckCopy('ru', capacityReport.bottleneck),
    }
    const predictionTranslations: NonNullable<TimelineEvent['translations']> = {
      en: {
        title: 'Bottleneck prediction committed',
        detail: matches
          ? 'Prediction matches the estimated model'
          : `Model points to ${estimatedByLocale.en}`,
      },
      ru: {
        title: 'Прогноз узкого места зафиксирован',
        detail: matches
          ? 'Прогноз совпадает с оценочной моделью'
          : `Модель указывает на ${estimatedByLocale.ru}`,
      },
    }
    addEvent(
      predictionTranslations[locale].title,
      predictionTranslations[locale].detail,
      matches ? 'healthy' : 'warning',
      predictionTranslations,
    )
    recordAction({
      type: 'answer.submitted',
      source: 'user',
      payload: {
        answer: predictionRationale.trim(),
        prompt: locale === 'ru'
          ? 'Что первым насытится при 100 тыс. редиректов/с и отказе кеша?'
          : 'What saturates first at 100k redirects/s during a cache outage?',
        feedback: matches
          ? locale === 'ru' ? 'Прогноз совпадает с текущей оценкой.' : 'The prediction matches the current estimate.'
          : locale === 'ru' ? `Текущая оценка указывает на ${estimatedBottleneck}.` : `The current estimate points to ${estimatedBottleneck}.`,
        focus: `prediction:${bottleneckPrediction}`,
      },
      timeline: {
        title: locale === 'ru'
          ? `Прогноз: ${predictedBottleneck}`
          : `Predicted ${predictedBottleneck}`,
        detail: matches
          ? locale === 'ru' ? 'Прогноз подтвердился' : 'Prediction holds'
          : locale === 'ru' ? 'Проверка выявила другой предел' : 'Counterfactual revealed another limit',
        tone: matches ? 'healthy' : 'warning',
      },
    })
  }, [
    addEvent,
    bottleneckPrediction,
    capacityReport.bottleneck,
    locale,
    predictionRationale,
    recordAction,
  ])

  const commitFanoutPrediction = useCallback(() => {
    if (!fanoutPrediction || fanoutPredictionRationale.trim().length < 8) return
    setFanoutPredictionLocked(true)
    const matches = fanoutPrediction === baselineNewsFeedReport.bottleneck
    const estimatedBottleneck = bottleneckCopy(locale, baselineNewsFeedReport.bottleneck)
    const predictedBottleneck = bottleneckCopy(locale, fanoutPrediction)
    const estimatedByLocale = {
      en: bottleneckCopy('en', baselineNewsFeedReport.bottleneck),
      ru: bottleneckCopy('ru', baselineNewsFeedReport.bottleneck),
    }
    const predictionTranslations: NonNullable<TimelineEvent['translations']> = {
      en: {
        title: 'Spike prediction committed',
        detail: matches
          ? 'Prediction matches the estimated fan-out model'
          : `Model points to ${estimatedByLocale.en}`,
      },
      ru: {
        title: 'Прогноз скачка зафиксирован',
        detail: matches
          ? 'Прогноз совпадает с оценочной fan-out моделью'
          : `Модель указывает на ${estimatedByLocale.ru}`,
      },
    }
    addEvent(
      predictionTranslations[locale].title,
      predictionTranslations[locale].detail,
      matches ? 'healthy' : 'warning',
      predictionTranslations,
    )
    recordAction({
      type: 'answer.submitted',
      source: 'user',
      payload: {
        answer: fanoutPredictionRationale.trim(),
        prompt: locale === 'ru'
          ? 'Что первым насытится, когда один пост нужно доставить 50 миллионам подписчиков?'
          : 'What saturates first when one post targets 50 million followers?',
        feedback: matches
          ? locale === 'ru' ? 'Прогноз совпадает с текущей оценкой.' : 'The prediction matches the current estimate.'
          : locale === 'ru' ? `Текущая оценка указывает на ${estimatedBottleneck}.` : `The current estimate points to ${estimatedBottleneck}.`,
        focus: `prediction:${fanoutPrediction}`,
      },
      timeline: {
        title: locale === 'ru'
          ? `Прогноз: ${predictedBottleneck}`
          : `Predicted ${predictedBottleneck}`,
        detail: matches
          ? locale === 'ru' ? 'Прогноз подтвердился' : 'Prediction holds'
          : locale === 'ru' ? 'Проверка выявила другой предел' : 'Counterfactual revealed another limit',
        tone: matches ? 'healthy' : 'warning',
      },
    })
  }, [
    addEvent,
    baselineNewsFeedReport.bottleneck,
    fanoutPrediction,
    fanoutPredictionRationale,
    locale,
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
    const submissionTranslations: NonNullable<TimelineEvent['translations']> = {
      en: {
        title: applicationCopy.en.designSubmitted,
        detail: `${report.score}/100 · ${report.passedCases}/${report.totalCases} cases passed`,
      },
      ru: {
        title: applicationCopy.ru.designSubmitted,
        detail: `${report.score}/100 · пройдено кейсов: ${report.passedCases}/${report.totalCases}`,
      },
    }
    addEvent(
      submissionTranslations[locale].title,
      submissionTranslations[locale].detail,
      report.passed ? 'healthy' : report.score >= 60 ? 'warning' : 'critical',
      submissionTranslations,
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
        title: `${copy.designSubmitted} · ${report.score}/100`,
        detail: locale === 'ru'
          ? `Пройдено кейсов: ${report.passedCases} из ${report.totalCases}`
          : `${report.passedCases} of ${report.totalCases} cases passed`,
        tone: report.passed ? 'healthy' : report.score >= 60 ? 'warning' : 'critical',
      },
    })
    const criticalEvent = recorded.events.find((event) => event.timeline?.tone === 'critical')
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
        } : fallbackKeyMoment(locale, recorded.initial.fault, recorded.durationMs),
      },
    }
    setLastSubmittedAttempt(completed)
    try {
      replayRepository.save(completed)
      setSavedAttempts(replayRepository.list())
      addEvent(copy.attemptSaved, copy.replayInHistory, 'healthy', {
        en: {
          title: applicationCopy.en.attemptSaved,
          detail: applicationCopy.en.replayInHistory,
        },
        ru: {
          title: applicationCopy.ru.attemptSaved,
          detail: applicationCopy.ru.replayInHistory,
        },
      })
    } catch {
      addEvent(copy.replayNotSaved, copy.storageUnavailable, 'warning', {
        en: {
          title: applicationCopy.en.replayNotSaved,
          detail: applicationCopy.en.storageUnavailable,
        },
        ru: {
          title: applicationCopy.ru.replayNotSaved,
          detail: applicationCopy.ru.storageUnavailable,
        },
      })
    }
    draftAttemptRef.current = null
    recordingElapsedMsRef.current = 0
    setDraftAttempt(null)
  }, [
    addEvent,
    capacity,
    challengeId,
    componentCounts,
    copy.attemptSaved,
    copy.designSubmitted,
    copy.replayInHistory,
    copy.replayNotSaved,
    copy.storageUnavailable,
    criticalPathConnected,
    edges.length,
    fault,
    load,
    locale,
    nodes.length,
    replicaCounts,
    recordAction,
    replayRepository,
  ])

  const shareScenario = useCallback(async () => {
    const serialized = replayAttempt
      ? serializeReplayEnvelope(replayAttempt, { redactAnswers: true, pretty: true })
      : serializeScenarioSnapshot({
          challengeId,
          initial: toReplayInitial(nodes, edges, load, fault, capacity, faultTarget),
        })

    try {
      await navigator.clipboard.writeText(serialized)
      addEvent(
        replayAttempt ? copy.replayCopied : copy.scenarioCopied,
        replayAttempt ? copy.replayReadyToImport : copy.snapshotReadyToShare,
        'healthy',
      )
    } catch {
      addEvent(copy.shareUnavailable, copy.clipboardDenied, 'warning')
    }
  }, [addEvent, capacity, challengeId, copy, edges, fault, faultTarget, load, nodes, replayAttempt])

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
        faultTarget: canonicalStateRef.current.faultTarget,
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
      setFaultTarget(live.faultTarget)
      setCapacity(live.capacity)
      setChallengeId(live.challengeId)
      setPlaying(live.playing)
    }
    liveStateBeforeReplayRef.current = null
    setInterviewerOpen(true)
  }, [])

  const publishErrorCopy = useCallback((error: PublicReplayError) => {
    return publicReplayErrorCopy(locale, error)
  }, [locale])

  const openPublish = useCallback((attemptId: string) => {
    const attempt = resolvePublishAttempt(attemptId, [
      lastSubmittedAttempt,
      replayAttempt,
      ...savedAttempts,
    ])
    if (!attempt) return
    const existing = capabilityStore.getByAttemptId(attempt.id)
    setPublishAttempt(attempt)
    setPublishStatus(existing ? 'ready' : 'confirm')
    setPublishUrl(existing?.url)
    setPublishError(undefined)
    setPublishCopied(false)
    setPublishAction('publish')
  }, [capabilityStore, lastSubmittedAttempt, replayAttempt, savedAttempts])

  const confirmPublish = useCallback(async () => {
    if (!publishAttempt) return
    const attemptId = publishAttempt.id
    setPublishAction('publish')
    setPublishStatus('publishing')
    setPublishError(undefined)
    try {
      const result = await publicReplayClient.publish(createPublicReplayEnvelope(publishAttempt))
      const url = result.url || publicReplayHref(result.id)
      const persisted = capabilityStore.save({
        publicId: result.id,
        attemptId,
        url,
        deleteToken: result.deleteToken,
        publishedAt: new Date().toISOString(),
      })
      setCapabilitiesVersion((value) => value + 1)
      if (!persisted) {
        addEvent(copy.capabilityNotSaved, copy.capabilityNotSavedDetail, 'warning', {
          en: {
            title: applicationCopy.en.capabilityNotSaved,
            detail: applicationCopy.en.capabilityNotSavedDetail,
          },
          ru: {
            title: applicationCopy.ru.capabilityNotSaved,
            detail: applicationCopy.ru.capabilityNotSavedDetail,
          },
        })
      } else {
        addEvent(copy.replayPublished, copy.publicLinkReady, 'healthy', {
          en: {
            title: applicationCopy.en.replayPublished,
            detail: applicationCopy.en.publicLinkReady,
          },
          ru: {
            title: applicationCopy.ru.replayPublished,
            detail: applicationCopy.ru.publicLinkReady,
          },
        })
      }
      if (publishAttemptRef.current?.id !== attemptId) return
      setPublishUrl(url)
      setPublishStatus('ready')
      if (!persisted) {
        setPublishError(`${copy.capabilityNotSaved}. ${copy.capabilityNotSavedDetail}`)
      }
    } catch (caught) {
      const error = caught as PublicReplayError
      const message = publishErrorCopy({
        code: error?.code ?? 'unavailable',
        message: error?.message ?? copy.publishUnavailable,
      })
      if (publishAttemptRef.current?.id !== attemptId) {
        addEvent(copy.publishFailed, message, 'warning')
        return
      }
      setPublishError(message)
      setPublishStatus('error')
      addEvent(copy.publishFailed, message, 'warning')
    }
  }, [
    addEvent,
    capabilityStore,
    copy.capabilityNotSaved,
    copy.capabilityNotSavedDetail,
    copy.publicLinkReady,
    copy.publishFailed,
    copy.publishUnavailable,
    copy.replayPublished,
    publishAttempt,
    publishErrorCopy,
    publicReplayClient,
  ])

  const unpublishReplay = useCallback(async () => {
    if (!publishAttempt || unpublishInFlightRef.current) return
    const attemptId = publishAttempt.id
    const existing = capabilityStore.getByAttemptId(attemptId)
    if (!existing) return
    unpublishInFlightRef.current = true
    setPublishUnpublishing(true)
    setPublishAction('unpublish')
    setPublishError(undefined)
    try {
      const result = await unpublishPublicReplay(
        publicReplayClient,
        capabilityStore,
        existing,
      )
      const targetsActiveAttempt = unpublishResultTargetsActiveAttempt(
        publishAttemptRef.current?.id,
        attemptId,
      )
      if (!result.ok) {
        if (!targetsActiveAttempt) return
        const message = publishErrorCopy({
          code: result.error?.code ?? 'unavailable',
          message: result.error?.message ?? copy.publishUnavailable,
        })
        setPublishError(message)
        setPublishStatus('error')
        return
      }

      setCapabilitiesVersion((value) => value + 1)
      addEvent(copy.replayUnpublished, copy.publicLinkRemoved, 'healthy')
      const cleanupWarning = result.cleanupPersisted
        ? undefined
        : `${copy.capabilityCleanupFailed}. ${copy.capabilityCleanupFailedDetail}`
      if (cleanupWarning) {
        addEvent(copy.capabilityCleanupFailed, copy.capabilityCleanupFailedDetail, 'warning')
      }
      if (!targetsActiveAttempt) return
      setPublishUrl(undefined)
      setPublishStatus('confirm')
      setPublishError(cleanupWarning)
    } catch (caught) {
      const error = caught as PublicReplayError
      if (!unpublishResultTargetsActiveAttempt(publishAttemptRef.current?.id, attemptId)) return
      const message = publishErrorCopy({
        code: error?.code ?? 'unavailable',
        message: error?.message ?? copy.publishUnavailable,
      })
      setPublishError(message)
      setPublishStatus('error')
    } finally {
      unpublishInFlightRef.current = false
      setPublishUnpublishing(false)
    }
  }, [
    addEvent,
    capabilityStore,
    copy.capabilityCleanupFailed,
    copy.capabilityCleanupFailedDetail,
    copy.publicLinkRemoved,
    copy.publishUnavailable,
    copy.replayUnpublished,
    publishAttempt,
    publishErrorCopy,
    publicReplayClient,
  ])

  const copyPublicLink = useCallback(async () => {
    if (!publishUrl) return
    try {
      await navigator.clipboard.writeText(publishUrl)
      setPublishCopied(true)
    } catch {
      setPublishCopied(false)
      addEvent(copy.shareUnavailable, copy.clipboardDenied, 'warning')
    }
  }, [addEvent, copy.clipboardDenied, copy.shareUnavailable, publishUrl])

  const deleteReplay = useCallback((attemptId: string) => {
    try {
      replayRepository.remove(attemptId)
      setSavedAttempts(replayRepository.list())
      if (replayAttempt?.id === attemptId) exitReplay()
    } catch {
      setHistoryNotice({ message: `${copy.deleteFailed}. ${copy.storageUnavailable}.`, tone: 'error' })
      addEvent(copy.deleteFailed, copy.storageUnavailable, 'warning')
    }
  }, [addEvent, copy.deleteFailed, copy.storageUnavailable, exitReplay, replayAttempt?.id, replayRepository])

  const importReplay = useCallback(async (file: File) => {
    try {
      const result = parseReplayEnvelope(await file.text())
      if (!result.ok) {
        const message = replayImportErrorCopy(locale, result.error.code, result.error.message)
        setHistoryNotice({ message, tone: 'error' })
        addEvent(copy.importFailed, message, 'critical')
        return
      }
      replayRepository.save(verifyImportedAttempt(result.value.attempt))
      setSavedAttempts(replayRepository.list())
      setHistoryOpen(true)
      setHistoryNotice({
        message: result.migrated
          ? copy.migratedNotice
          : copy.importedNotice,
        tone: 'success',
      })
      addEvent(
        result.migrated ? copy.scenarioMigrated : copy.replayImported,
        result.migrated ? copy.migratedDetail : copy.importedDetail,
        'healthy',
      )
    } catch {
      setHistoryNotice({ message: copy.fileUnreadable, tone: 'error' })
      addEvent(copy.importFailed, copy.fileUnreadable, 'critical')
    }
  }, [addEvent, copy, locale, replayRepository])

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
      locale,
      scenario: challengeId,
      loadMultiplier: load,
      fault,
      metrics: snapshot.metrics,
      nodeLabels: nodes.map((node) => node.data.label),
      edgeCount: edges.length,
      recentEvents: events.slice(0, 5),
    }),
    [challengeId, edges.length, events, fault, load, locale, nodes, snapshot.metrics],
  )

  const openInterview = useCallback(() => {
    setRightPanelMode('interview')
    setInterviewerOpen(true)
  }, [])

  const interview = useInterviewSession({
    interviewer: interviewRouter,
    locale,
    context: interviewContext,
    questionRevision: `${locale}:${challengeId}:${fault}:${load}:${criticalPathConnected}`,
    replayActive: Boolean(replayAttempt),
    capacity,
    capacityMonthlyCost: capacityReport.cost.total,
    newsFeedMonthlyCost: newsFeedReport.cost.total,
    addEvent,
    recordAction,
    openInterview,
  })

  return (
    <div
      className={`app-shell ${interviewerOpen ? 'interviewer-open' : 'interviewer-closed'} ${
        (replayAttempt ? replayPlaying : playing) ? 'simulation-running' : 'simulation-paused'
      } ${replayAttempt ? 'replay-mode' : ''} ${rightPanelMode === 'bottleneck' ? 'bottleneck-mode' : ''} ${
        selectedNode || selectedEdge ? 'node-inspector-open' : ''
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
          setSelectedEdgeId(null)
          setInterviewerOpen((value) => !value)
        }}
        onOpenCapacity={() => {
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
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
          selectedEdge={selectedEdge}
          faultTarget={faultTarget}
          faultImpact={targetedFaultImpact}
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
            setSelectedEdgeId(null)
          }}
          onEdgeSelected={(edge) => {
            setSelectedNodeId(null)
            setSelectedEdgeId(edge.id)
          }}
          onInspectorClose={() => {
            setSelectedNodeId(null)
            setSelectedEdgeId(null)
          }}
          onTopologyChange={changeNodeTopology}
          onLoadChange={changeLoad}
          onFaultChange={changeFault}
          readOnly={Boolean(replayAttempt)}
          fitViewKey={replayAttempt?.id ?? `${challengeId}-live`}
          bottomOverlay={replayAttempt ? (
            <ReplayTimeline
              locale={locale}
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
                throughput: locale === 'ru'
                  ? challengeId === 'news-feed' ? 'Доставки' : 'Пропускная способность'
                  : activePack.telemetryLabels.throughput,
                p99: locale === 'ru'
                  ? challengeId === 'news-feed' ? 'Свежесть' : 'p99'
                  : activePack.telemetryLabels.p99,
                errors: locale === 'ru'
                  ? challengeId === 'news-feed' ? 'Устаревшие' : 'Ошибки'
                  : activePack.telemetryLabels.errorRate,
                dbCpu: locale === 'ru'
                  ? challengeId === 'news-feed' ? 'Воркеры' : 'CPU БД'
                  : activePack.telemetryLabels.dbCpu,
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
          prompt={interview.prompt}
          feedback={interview.feedback}
          answer={interview.answer}
          busy={interview.busy}
          events={events}
          onAnswerChange={interview.setAnswer}
          onSubmit={() => void interview.runAction('answer')}
          onHint={() => void interview.runAction('hint')}
          onReview={() => void interview.runAction('review')}
          onContinue={() => void interview.runAction('continue')}
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
            onDefend={interview.defend}
            onReset={() => changeCapacity({
              ...DEFAULT_CAPACITY_TUNING,
              pricingPackId: capacity.pricingPackId,
              benchmarkPackId: capacity.benchmarkPackId,
            })}
            onOpenInterviewer={() => {
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
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
            onDefend={interview.defend}
            onReset={() => changeCapacity({ ...DEFAULT_NEWS_FEED_TUNING })}
            onOpenInterviewer={() => {
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
              setRightPanelMode('interview')
            }}
            onClose={() => setInterviewerOpen((value) => !value)}
          />
        )}
        {historyOpen && (
          <HistoryPanel
            open
            locale={locale}
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
            onPublish={openPublish}
          />
        )}
        {replayAttempt && !historyOpen && (
          <ReplayPanel
            locale={locale}
            score={replayAttempt.summary?.score}
            passed={replayAttempt.summary?.passed}
            keyMoment={replayKeyMoment(replayAttempt, locale)}
            events={replayEvents}
            cursorMs={replayCursorMs}
            activeEventId={activeReplayEvent?.id}
            onSeek={seekReplay}
            onExport={() => downloadReplay(replayAttempt)}
            onPublish={() => openPublish(replayAttempt.id)}
            publishedUrl={capabilityStore.getByAttemptId(replayAttempt.id)?.url}
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
        onPublishReplay={lastSubmittedAttempt ? () => openPublish(lastSubmittedAttempt.id) : undefined}
      />
      <PublishReplayDialog
        locale={locale}
        open={Boolean(publishAttempt)}
        preview={publishAttempt ? previewPublicReplay(publishAttempt) : null}
        challengeTitle={publishAttempt
          ? (publishAttempt.challengeId === 'news-feed'
            ? scenarioLabels[locale]['news-feed'].title
            : scenarioLabels[locale]['url-shortener'].title)
          : scenarioLabels[locale][challengeId].title}
        status={publishStatus}
        publicUrl={publishUrl}
        error={publishError}
        copied={publishCopied}
        unpublishing={publishUnpublishing}
        onClose={() => {
          setPublishAttempt(null)
          setPublishStatus('confirm')
          setPublishCopied(false)
          setPublishAction('publish')
        }}
        onConfirm={() => void confirmPublish()}
        onRetry={() => {
          if (nextPublishRetry(publishAction) === 'unpublish') void unpublishReplay()
          else void confirmPublish()
        }}
        onCopy={() => void copyPublicLink()}
        onUnpublish={publishUrl ? () => void unpublishReplay() : undefined}
      />
      <div className="screen-reader-status" aria-live="polite">
        {replayAttempt
          ? locale === 'ru'
            ? `Повтор ${replayPlaying ? 'воспроизводится' : 'приостановлен'} на ${formatClock(Math.floor(replayCursorMs / 1000))}.`
            : `Replay ${replayPlaying ? 'playing' : 'paused'} at ${formatClock(Math.floor(replayCursorMs / 1000))}.`
          : locale === 'ru'
            ? `Симуляция ${playing ? 'запущена' : 'приостановлена'}. Состояние: ${snapshot.severity === 'normal' ? 'штатное' : snapshot.severity === 'degraded' ? 'деградация' : 'критическое'}.${draftAttempt ? ' Попытка записывается.' : ''}`
            : `${playing ? 'Simulation running' : 'Simulation paused'}. ${snapshot.severity} state.${draftAttempt ? ' Attempt recording.' : ''}`}
      </div>
    </div>
  )
}
