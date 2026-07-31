import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [prompt, setPrompt] = useState(
    'Redis is unavailable. How would you protect the database from a cache stampede?',
  )
  const [interviewBusy, setInterviewBusy] = useState(false)
  const [judgeReport, setJudgeReport] = useState<JudgeReport | null>(null)

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

  useEffect(() => {
    setJudgeReport(null)
  }, [graphTopology])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setTick((value) => value + 1)
      setElapsedSeconds((value) => value + 1)
    }, 900)
    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    setTelemetry((history) => [
      ...history.slice(-27),
      { tick, ...snapshot.metrics },
    ])
  }, [snapshot.metrics, tick])

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
            paused: !playing,
          },
        }
      }),
    )
  }, [load, nodes, playing, snapshot.metrics])

  const onNodesChange = useCallback(
    (changes: NodeChange<SystemFlowNode>[]) =>
      setNodes((current) => applyNodeChanges(changes, current)),
    [],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<SystemFlowEdge>[]) =>
      setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge<SystemFlowEdge>(
          {
            ...connection,
            id: `edge-${Date.now()}`,
            type: 'traffic',
            data: { tone: 'healthy', intensity: load, paused: !playing },
          },
          current,
        ),
      )
      addEvent('Connection added', 'Topology recalculated', 'healthy')
    },
    [addEvent, load, playing],
  )

  const addNode = useCallback(
    (kind: ComponentKind) => {
      setActiveKind(kind)
      setNodes((current) => {
        const instance = (current.filter((node) => node.data.kind === kind).length ?? 0) + 1
        const label =
          kind === 'service' && instance === 1
            ? 'Service'
            : `${COMPONENT_LABELS[kind]}${instance > 1 ? ` ${instance}` : ''}`
        const id = `${kind}-${Date.now()}`
        return [
          ...current.map((node) => ({ ...node, selected: false })),
          {
            id,
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
          } satisfies SystemFlowNode,
        ]
      })
      addEvent(`${COMPONENT_LABELS[kind]} added`, 'Connect it to change the live model', 'healthy')
    },
    [addEvent, load, snapshot.nodeDetails, snapshot.nodeHealth],
  )

  const changeLoad = useCallback(
    (nextLoad: 1 | 3 | 10) => {
      setLoad(nextLoad)
      addEvent(`Load increased to ${nextLoad}×`, `${nextLoad * 10}k req/s offered`, nextLoad === 10 ? 'warning' : 'healthy')
    },
    [addEvent],
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
    },
    [addEvent],
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
  }, [addEvent, componentCounts, criticalPathConnected, edges.length, nodes.length])

  const shareScenario = useCallback(async () => {
    const serialized = JSON.stringify(
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
      addEvent('Scenario copied', 'Architecture snapshot is ready to share', 'healthy')
    } catch {
      addEvent('Share unavailable', 'Clipboard access was not granted', 'warning')
    }
  }, [addEvent, edges, fault, load, nodes])

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
    let cancelled = false
    interviewRouter
      .respond({ action: 'continue', context: interviewContext })
      .then((response) => {
        if (!cancelled) setPrompt(response.prompt)
      })
    return () => {
      cancelled = true
    }
  }, [fault, load, criticalPathConnected])

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
          setAnswer('')
        }
      } finally {
        window.setTimeout(() => setInterviewBusy(false), 180)
      }
    },
    [addEvent, answer, interviewContext],
  )

  return (
    <div
      className={`app-shell ${interviewerOpen ? 'interviewer-open' : 'interviewer-closed'} ${
        playing ? 'simulation-running' : 'simulation-paused'
      }`}
    >
      <TopBar
        elapsedSeconds={elapsedSeconds}
        playing={playing}
        onTogglePlaying={() => setPlaying((value) => !value)}
        interviewerOpen={interviewerOpen}
        onToggleInterviewer={() => setInterviewerOpen((value) => !value)}
        onOpenChallenge={() => setChallengeOpen(true)}
        onShare={() => void shareScenario()}
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
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onAddNode={addNode}
          onNodeKindSelected={setActiveKind}
          onLoadChange={changeLoad}
          onFaultChange={changeFault}
        />
        <InterviewerPanel
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
        />
      </div>
      <ChallengePanel
        challenge={urlShortenerChallenge}
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        onRunCase={(nextLoad, nextFault) => {
          changeLoad(nextLoad)
          changeFault(nextFault)
        }}
        report={judgeReport}
        onSubmitDesign={submitDesign}
      />
      <div className="screen-reader-status" aria-live="polite">
        {playing ? 'Simulation running' : 'Simulation paused'}. {snapshot.severity} state.
      </div>
    </div>
  )
}
