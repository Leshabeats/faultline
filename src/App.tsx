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
import { seedEdges, seedNodes } from './canvas/seed'
import type { SystemFlowEdge, SystemFlowNode } from './canvas/types'
import { InterviewerPanel } from './components/InterviewerPanel'
import { ChallengePanel } from './components/ChallengePanel'
import { HistoryPanel, type HistoryAttemptItem } from './components/HistoryPanel'
import { ReplayPanel } from './components/ReplayPanel'
import { ReplayTimeline } from './components/ReplayTimeline'
import { TopBar } from './components/TopBar'
import { urlShortenerChallenge } from './challenges/urlShortener'
import {
  COMPONENT_LABELS,
  FAULT_LABELS,
  type ComponentHealth,
  type ComponentKind,
  type FaultMode,
  type TelemetryPoint,
  type TimelineEvent,
} from './domain/system'
import { interviewRouter } from './interview/router'
import type { InterviewAction, InterviewContext } from './interview/types'
import { judgeUrlShortener, type JudgeReport } from './judge'
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
import { verifyImportedUrlShortenerAttempt } from './replay/verification'

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

const initialEvents: TimelineEvent[] = [
  {
    id: 'initial-cache-outage',
    timestamp: '18:41',
    title: 'Redis became unavailable',
    detail: 'Cache node health check failed',
    tone: 'critical',
  },
  {
    id: 'initial-cache-miss',
    timestamp: '18:40',
    title: 'Cache miss rate elevated',
    detail: '82% miss rate detected',
    tone: 'warning',
  },
  {
    id: 'initial-load',
    timestamp: '18:39',
    title: 'Load increased to 10×',
    detail: 'Throughput is now 100k req/s',
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
  const [nodes, setNodes] = useState<SystemFlowNode[]>(seedNodes)
  const [edges, setEdges] = useState<SystemFlowEdge[]>(seedEdges)
  const [activeKind, setActiveKind] = useState<ComponentKind>('cache')
  const [load, setLoad] = useState<1 | 3 | 10>(10)
  const [fault, setFault] = useState<FaultMode>('cache-outage')
  const [playing, setPlaying] = useState(true)
  const [tick, setTick] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(18 * 60 + 42)
  const [interviewerOpen, setInterviewerOpen] = useState(true)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyNotice, setHistoryNotice] = useState<{
    message: string
    tone: 'success' | 'error'
  } | null>(null)
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [prompt, setPrompt] = useState(
    'Redis is unavailable. How would you protect the database from a cache stampede?',
  )
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
  const draftAttemptRef = useRef<ReplayAttemptV1 | null>(null)
  const recordingElapsedMsRef = useRef(0)
  const canonicalStateRef = useRef({ nodes, edges, load, fault })
  const liveStateBeforeReplayRef = useRef<{
    nodes: SystemFlowNode[]
    edges: SystemFlowEdge[]
    load: 1 | 3 | 10
    fault: FaultMode
    playing: boolean
  } | null>(null)

  canonicalStateRef.current = { nodes, edges, load, fault }

  // Simulation topology must not be invalidated by the live health/detail fields
  // that we write back into React Flow nodes on every tick.
  const componentTopology = nodes
    .map((node) => `${node.id}:${node.data.kind}`)
    .sort()
    .join('|')
  const graphTopology = `${componentTopology}::${edges
    .map((edge) => `${edge.id}:${edge.source}>${edge.target}`)
    .sort()
    .join('|')}`
  const { componentCounts, criticalPathConnected, routedNodeIds } = useMemo(
    () => analyzeTopology(nodes, edges),
    [graphTopology],
  )

  const snapshot = useMemo(
    () =>
      computeSimulation({
        loadMultiplier: load,
        fault,
        tick,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        componentCounts,
        criticalPathConnected,
      }),
    [componentCounts, criticalPathConnected, edges.length, fault, load, nodes.length, tick],
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
      title: attempt.challengeId === urlShortenerChallenge.id
        ? urlShortenerChallenge.title
        : attempt.challengeId,
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
        loadMultiplier: 10,
        fault: 'cache-outage',
        tick: index - 21,
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
        challengeId: urlShortenerChallenge.id,
        startedAt,
        initial: toReplayInitial(
          canonical.nodes,
          canonical.edges,
          canonical.load,
          canonical.fault,
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
  }, [graphTopology])

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
    const presentation = presentReplayFrame(replayFrame, replayTick, !replayPlaying)
    setLoad(replayFrame.load)
    setFault(replayFrame.fault)
    setTick(replayTick)
    setNodes(presentation.nodes)
    setEdges(presentation.edges)
  }, [replayCursorMs, replayFrame, replayPlaying])

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
          routedCaches.length > 1
        ) {
          health = node.id === faultedCacheId ? 'failed' : 'degraded'
          detail = node.id === faultedCacheId ? 'Unavailable' : detail
        }

        return {
          ...node,
          data: {
            ...node.data,
            health,
            detail,
            load,
          },
        }
      })
    })
  }, [
    criticalPathConnected,
    fault,
    load,
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
        if (edge.id === 'clients-edge') {
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
            intensity: load,
            paused: replayAttempt ? !replayPlaying : !playing,
          },
        }
      }),
    )
  }, [load, nodes, playing, replayAttempt, replayPlaying, snapshot.metrics])

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

  const changeLoad = useCallback(
    (nextLoad: 1 | 3 | 10) => {
      setLoad(nextLoad)
      addEvent(`Load increased to ${nextLoad}×`, `${nextLoad * 10}k req/s offered`, nextLoad === 10 ? 'warning' : 'healthy')
      recordAction({
        type: 'load.changed',
        source: 'user',
        payload: { load: nextLoad },
        timeline: {
          title: `Load changed to ${nextLoad}×`,
          detail: `${nextLoad * 10}k req/s offered`,
          tone: nextLoad === 10 ? 'warning' : 'healthy',
        },
      })
    },
    [addEvent, recordAction],
  )

  const changeFault = useCallback(
    (nextFault: FaultMode) => {
      setFault(nextFault)
      const tone: TimelineEvent['tone'] =
        nextFault === 'none' ? 'healthy' : nextFault === 'cache-outage' ? 'critical' : 'warning'
      addEvent(
        nextFault === 'none' ? 'Fault cleared' : FAULT_LABELS[nextFault],
        nextFault === 'none' ? 'System is recovering' : 'Fault injected into the simulation',
        tone,
      )
      recordAction({
        type: 'fault.changed',
        source: 'user',
        payload: { fault: nextFault },
        timeline: {
          title: nextFault === 'none'
            ? 'Fault cleared'
            : nextFault === 'cache-outage'
              ? 'Redis became unavailable'
              : FAULT_LABELS[nextFault],
          detail: nextFault === 'none' ? 'System is recovering' : 'Fault injected into the simulation',
          tone,
        },
      })
    },
    [addEvent, recordAction],
  )

  const submitDesign = useCallback(() => {
    const report = judgeUrlShortener({
      componentCounts,
      criticalPathConnected,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    })
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
    componentCounts,
    criticalPathConnected,
    edges.length,
    fault,
    load,
    nodes.length,
    recordAction,
    replayRepository,
  ])

  const shareScenario = useCallback(async () => {
    const serialized = replayAttempt
      ? serializeReplayEnvelope(replayAttempt, { redactAnswers: true, pretty: true })
      : JSON.stringify(
      {
        version: 1,
        challenge: urlShortenerChallenge.id,
        load,
        fault,
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
  }, [addEvent, edges, fault, load, nodes, replayAttempt])

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
        playing,
      }
    }
    setChallengeOpen(false)
    setHistoryOpen(false)
    setInterviewerOpen(false)
    setReplayAttempt(attempt)
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
      replayRepository.save(verifyImportedUrlShortenerAttempt(result.value.attempt))
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
      scenario: 'url-shortener',
      loadMultiplier: load,
      fault,
      metrics: snapshot.metrics,
      nodeLabels: nodes.map((node) => node.data.label),
      edgeCount: edges.length,
      recentEvents: events.slice(0, 5),
    }),
    [edges.length, events, fault, load, nodes, snapshot.metrics],
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
  }, [fault, load, criticalPathConnected, replayAttempt])

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

  return (
    <div
      className={`app-shell ${interviewerOpen ? 'interviewer-open' : 'interviewer-closed'} ${
        (replayAttempt ? replayPlaying : playing) ? 'simulation-running' : 'simulation-paused'
      } ${replayAttempt ? 'replay-mode' : ''}`}
    >
      <TopBar
        elapsedSeconds={replayAttempt ? Math.floor(replayCursorMs / 1000) : elapsedSeconds}
        playing={replayAttempt ? replayPlaying : playing}
        onTogglePlaying={() => setPlaying((value) => !value)}
        interviewerOpen={interviewerOpen && !historyOpen && !replayAttempt}
        onToggleInterviewer={() => setInterviewerOpen((value) => !value)}
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
          fault={fault}
          telemetry={telemetry}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onAddNode={addNode}
          onNodeKindSelected={setActiveKind}
          onLoadChange={changeLoad}
          onFaultChange={changeFault}
          readOnly={Boolean(replayAttempt)}
          fitViewKey={replayAttempt?.id ?? 'live'}
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
              onCursorChange={seekReplay}
              onTogglePlaying={toggleReplay}
              onPreviousEvent={() => seekReplayEvent(-1)}
              onNextEvent={() => seekReplayEvent(1)}
              onSpeedChange={setReplaySpeed}
            />
          ) : undefined}
        />
        {!historyOpen && !replayAttempt && <InterviewerPanel
          open={interviewerOpen}
          providerLabel="Local preview"
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
          onClose={() => setInterviewerOpen((value) => !value)}
        />}
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
        challenge={urlShortenerChallenge}
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
