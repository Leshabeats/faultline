import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange } from '@xyflow/react'
import { ArchitectureCanvas } from '../canvas/ArchitectureCanvas'
import type { SystemFlowEdge, SystemFlowNode } from '../canvas/types'
import { ReplayPanel } from './ReplayPanel'
import { PublicReplayState } from './PublicReplayState'
import { ReplayTimeline } from './ReplayTimeline'
import { TopBar } from './TopBar'
import { getChallengePack } from '../challenges/registry'
import {
  type CapacityTuning,
  type FaultMode,
  type FaultTarget,
  type Locale,
  type LoadMultiplier,
} from '../domain/system'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'
import { computeSimulation, formatMetric } from '../simulation/engine'
import { analyzeTargetedFault } from '../simulation/faultImpact'
import {
  playReplayAt,
  type ReplayAttemptV1,
} from '../replay'
import {
  presentReplayFrame,
  replayKeyMoment,
  replayTimelineEvents,
} from '../replay/presentation'
import { verifyImportedAttempt } from '../replay/verification'
import { applicationCopy } from '../application/copy'
import { initialLocale, scenarioLabels } from '../i18n'
import {
  FetchPublicReplayClient,
  createPublicReplayCapabilityStore,
  publicReplayErrorCopy,
  publicReplayShareUrl,
  workspaceHref,
  type PublicReplayClient,
  type PublicReplayError,
} from '../publicReplay'

interface PublicReplayPageProps {
  id: string
  locale?: Locale
  client?: PublicReplayClient
}

const emptyNodes: SystemFlowNode[] = []
const emptyEdges: SystemFlowEdge[] = []

export function PublicReplayPage({
  id,
  locale: localeOverride,
  client,
}: PublicReplayPageProps) {
  const [defaultClient] = useState(() => new FetchPublicReplayClient())
  const replayClient = client ?? defaultClient
  const [locale, setLocale] = useState<Locale>(localeOverride ?? initialLocale)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<PublicReplayError | null>(null)
  const [attempt, setAttempt] = useState<ReplayAttemptV1 | null>(null)
  const [cursorMs, setCursorMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [retryToken, setRetryToken] = useState(0)
  const [shareNotice, setShareNotice] = useState<string>()
  const [canvasNodes, setCanvasNodes] = useState<SystemFlowNode[]>(emptyNodes)
  const [canvasEdges, setCanvasEdges] = useState<SystemFlowEdge[]>(emptyEdges)
  const capabilities = useMemo(() => createPublicReplayCapabilityStore(), [])
  const owned = capabilities.getByPublicId(id)
  const ru = locale === 'ru'

  useEffect(() => {
    let cancelled = false
    setAttempt(null)
    setCursorMs(0)
    setPlaying(false)
    setStatus('loading')
    setError(null)
    setDeleteError(undefined)
    void replayClient.get(id).then((record) => {
      if (cancelled) return
      setAttempt(verifyImportedAttempt(record.envelope.replay.attempt))
      setStatus('ready')
    }).catch((caught) => {
      if (cancelled) return
      const next = caught as PublicReplayError
      setError({
        code: next?.code ?? 'unavailable',
        message: next?.message ?? 'The replay service is unavailable.',
      })
      setStatus('error')
    })
    return () => {
      cancelled = true
    }
  }, [id, replayClient, retryToken])

  useEffect(() => {
    document.documentElement.lang = locale
    try { window.localStorage.setItem('faultline.locale', locale) } catch { /* optional */ }
  }, [locale])

  const frame = useMemo(
    () => attempt ? playReplayAt(attempt, cursorMs) : null,
    [attempt, cursorMs],
  )
  const challengeId = attempt?.challengeId === 'news-feed' ? 'news-feed' : 'url-shortener'
  const pack = getChallengePack(challengeId)
  const events = useMemo(
    () => attempt ? replayTimelineEvents(attempt, locale) : [],
    [attempt, locale],
  )
  const activeEvent = useMemo(
    () => [...events].reverse().find((event) => event.atMs <= cursorMs) ?? null,
    [cursorMs, events],
  )
  const presentation = useMemo(() => {
    if (!frame || !attempt) {
      return {
        nodes: emptyNodes,
        edges: emptyEdges,
        faultImpact: analyzeTargetedFault(emptyNodes, emptyEdges, null),
      }
    }
    return presentReplayFrame(
      frame,
      Math.floor(cursorMs / 900),
      !playing,
      challengeId,
      locale,
    )
  }, [attempt, challengeId, cursorMs, frame, locale, playing])

  useEffect(() => {
    setCanvasNodes(presentation.nodes)
    setCanvasEdges(presentation.edges)
  }, [attempt?.id, cursorMs, locale, playing])
  const snapshot = useMemo(() => {
    const topology = analyzeTargetedFault(
      presentation.nodes,
      presentation.edges,
      frame?.fault === 'none' ? null : frame?.faultTarget ?? null,
    ).topology
    return computeSimulation({
      loadMultiplier: (frame?.load ?? 1) as LoadMultiplier,
      fault: (frame?.fault ?? 'none') as FaultMode,
      tick: Math.floor(cursorMs / 900),
      nodeCount: presentation.nodes.length,
      edgeCount: presentation.edges.length,
      componentCounts: topology.componentCounts,
      replicaCounts: topology.replicaCounts,
      criticalPathConnected: topology.criticalPathConnected,
      capacity: {
        ...DEFAULT_CAPACITY_TUNING,
        ...(frame?.capacity ?? {}),
      } as CapacityTuning,
      scenario: challengeId,
    })
  }, [challengeId, cursorMs, frame, presentation.edges, presentation.nodes])

  useEffect(() => {
    if (!attempt || !playing) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - previous) * speed
      previous = now
      setCursorMs((current) => {
        const next = Math.min(attempt.durationMs, current + delta)
        if (next >= attempt.durationMs) setPlaying(false)
        return next
      })
    }, 50)
    return () => window.clearInterval(timer)
  }, [attempt, playing, speed])

  const seek = useCallback((next: number) => {
    if (!attempt) return
    setPlaying(false)
    setCursorMs(Math.min(attempt.durationMs, Math.max(0, next)))
  }, [attempt])

  const seekEvent = useCallback((direction: -1 | 1) => {
    if (!attempt) return
    const event = direction < 0
      ? [...events].reverse().find((candidate) => candidate.atMs < cursorMs - 50)
      : events.find((candidate) => candidate.atMs > cursorMs + 50)
    seek(event?.atMs ?? (direction < 0 ? 0 : attempt.durationMs))
  }, [attempt, cursorMs, events, seek])

  const leavePublicReplay = useCallback(() => {
    window.location.assign(workspaceHref())
  }, [])

  const sharePublicLink = useCallback(async () => {
    const url = publicReplayShareUrl(
      id,
      typeof window === 'undefined' ? undefined : window.location.href,
    )
    const copy = applicationCopy[locale]
    try {
      await navigator.clipboard.writeText(url)
      setShareNotice(copy.publicLinkCopied)
    } catch {
      setShareNotice(`${copy.shareUnavailable}. ${copy.clipboardDenied}`)
    }
  }, [id, locale])

  const deletePublication = useCallback(async () => {
    if (!owned) return
    setDeleting(true)
    try {
      await replayClient.remove(id, owned.deleteToken)
      capabilities.remove(id)
      leavePublicReplay()
    } catch (caught) {
      const next = caught as PublicReplayError
      setDeleteError(publicReplayErrorCopy(locale, {
        code: next?.code ?? 'unavailable',
        message: next?.message ?? applicationCopy[locale].publishUnavailable,
      }))
      setDeleting(false)
    }
  }, [capabilities, id, leavePublicReplay, locale, owned, replayClient])

  return (
    <div className={`app-shell interviewer-closed simulation-${playing ? 'running' : 'paused'} replay-mode public-replay-page`}>
      <TopBar
        challengeId={challengeId}
        locale={locale}
        onLocaleChange={setLocale}
        challengeTitle={scenarioLabels[locale][challengeId].title}
        challengeOptions={[{
          id: challengeId,
          title: scenarioLabels[locale][challengeId].title,
          difficulty: scenarioLabels[locale][challengeId].difficulty,
        }]}
        onChallengeChange={() => undefined}
        elapsedSeconds={Math.floor(cursorMs / 1000)}
        playing={playing}
        onTogglePlaying={() => setPlaying((value) => !value)}
        interviewerOpen={false}
        onToggleInterviewer={() => undefined}
        onOpenCapacity={() => undefined}
        onOpenChallenge={() => undefined}
        onOpenHistory={() => { leavePublicReplay() }}
        onShare={() => void sharePublicLink()}
        replayMode
        replayDurationSeconds={Math.floor((attempt?.durationMs ?? 0) / 1000)}
        onExitReplay={() => { leavePublicReplay() }}
      />
      {status !== 'ready' || !attempt || !frame ? (
        <PublicReplayState
          locale={locale}
          status={status === 'error' ? 'error' : 'loading'}
          error={error}
          onRetry={() => setRetryToken((value) => value + 1)}
        />
      ) : (
        <div className="workspace">
          <ArchitectureCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            activeKind="service"
            load={frame.load}
            effectiveLoad={frame.load}
            fault={frame.fault}
            locale={locale}
            scenario={challengeId}
            selectedNode={null}
            selectedEdge={null}
            faultTarget={(frame.faultTarget ?? null) as FaultTarget | null}
            faultImpact={presentation.faultImpact}
            telemetry={[]}
            faults={pack.faults}
            telemetryLabels={locale === 'ru'
              ? challengeId === 'news-feed'
                ? { throughput: 'Доставки', p99: 'Свежесть', errorRate: 'Устаревшие', dbCpu: 'Воркеры' }
                : { throughput: 'Пропускная способность', p99: 'p99', errorRate: 'Ошибки', dbCpu: 'CPU БД' }
              : pack.telemetryLabels}
            canvasLabel={locale === 'ru'
              ? challengeId === 'news-feed' ? 'Архитектура ленты новостей' : 'Архитектура коротких ссылок'
              : pack.canvasLabel}
            onNodesChange={(changes: NodeChange<SystemFlowNode>[]) => {
              setCanvasNodes((current) => applyNodeChanges(changes, current))
            }}
            onEdgesChange={(changes: EdgeChange<SystemFlowEdge>[]) => {
              setCanvasEdges((current) => applyEdgeChanges(changes, current))
            }}
            onConnect={() => undefined}
            onAddNode={() => undefined}
            onNodeSelected={() => undefined}
            onEdgeSelected={() => undefined}
            onInspectorClose={() => undefined}
            onTopologyChange={() => undefined}
            onLoadChange={() => undefined}
            onFaultChange={() => undefined}
            readOnly
            fitViewKey={attempt.id}
            bottomOverlay={(
              <ReplayTimeline
                locale={locale}
                cursorMs={cursorMs}
                durationMs={attempt.durationMs}
                playing={playing}
                speed={speed}
                events={events}
                activeEvent={activeEvent}
                metrics={{
                  throughput: formatMetric(snapshot.metrics.throughput, 'throughput'),
                  p99: formatMetric(snapshot.metrics.p99, 'p99'),
                  errors: `${snapshot.metrics.errorRate.toFixed(1)}%`,
                  dbCpu: `${Math.round(snapshot.metrics.dbCpu)}%`,
                }}
                metricLabels={{
                  throughput: locale === 'ru'
                    ? challengeId === 'news-feed' ? 'Доставки' : 'Пропускная способность'
                    : pack.telemetryLabels.throughput,
                  p99: locale === 'ru'
                    ? challengeId === 'news-feed' ? 'Свежесть' : 'p99'
                    : pack.telemetryLabels.p99,
                  errors: locale === 'ru'
                    ? challengeId === 'news-feed' ? 'Устаревшие' : 'Ошибки'
                    : pack.telemetryLabels.errorRate,
                  dbCpu: locale === 'ru'
                    ? challengeId === 'news-feed' ? 'Воркеры' : 'CPU БД'
                    : pack.telemetryLabels.dbCpu,
                }}
                onCursorChange={seek}
                onTogglePlaying={() => {
                  if (cursorMs >= attempt.durationMs) setCursorMs(0)
                  setPlaying((current) => !current)
                }}
                onPreviousEvent={() => seekEvent(-1)}
                onNextEvent={() => seekEvent(1)}
                onSpeedChange={setSpeed}
              />
            )}
          />
          <ReplayPanel
            locale={locale}
            score={attempt.summary?.score}
            passed={attempt.summary?.passed}
            keyMoment={replayKeyMoment(attempt, locale)}
            events={events}
            cursorMs={cursorMs}
            activeEventId={activeEvent?.id}
            onSeek={seek}
            onExport={() => undefined}
            publicMode
            scoreDisclaimer={ru
              ? 'Оценка пересчитана локальным judge и не подтверждена сервером.'
              : 'Score is recomputed by the local judge and is not server-verified.'}
            onDeletePublication={owned ? () => void deletePublication() : undefined}
            deletingPublication={deleting}
            deleteError={deleteError}
          />
        </div>
      )}
      <div className="screen-reader-status" aria-live="polite">
        {deleteError ?? shareNotice ?? (status === 'ready'
          ? ru
            ? `Публичный повтор ${playing ? 'воспроизводится' : 'приостановлен'}.`
            : `Public replay ${playing ? 'playing' : 'paused'}.`
          : status === 'loading'
            ? ru ? 'Загружаем публичный повтор.' : 'Loading public replay.'
            : (error?.code === 'not-found'
              ? ru ? 'Публичный повтор не найден.' : 'Public replay was not found.'
              : error?.code === 'unsupported-version'
                ? ru ? 'Версия публичного повтора не поддерживается.' : 'This public replay version is not supported.'
                : ru ? 'Сервис публичных повторов недоступен.' : 'The replay service is unavailable.'))}
      </div>
    </div>
  )
}
