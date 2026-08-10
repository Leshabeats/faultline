import type { SystemFlowEdge, SystemFlowNode } from '../canvas/types'
import type { ComponentHealth, FaultMode, Locale, ScenarioId } from '../domain/system'
import { componentLabels, faultLabels } from '../i18n'
import { normalizeNodeTopology } from '../domain/topology'
import type { CapacityTuning } from '../domain/system'
import { computeSimulation, formatMetric } from '../simulation/engine'
import { analyzeTopology } from '../simulation/topology'
import { serializeReplayEnvelope } from './serialization'
import { compareReplayEvents } from './reducer'
import type {
  ReplayAttemptV1,
  ReplayEdgeV1,
  ReplayEventV1,
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

export const toReplayNode = (node: SystemFlowNode): ReplayNodeV1 => {
  const topology = normalizeNodeTopology(node.data.kind, node.data)
  return {
    id: node.id,
    type: 'system',
    position: { ...node.position },
    data: {
      kind: node.data.kind,
      label: node.data.label,
      ...(topology.replicas > 1 ? { replicas: topology.replicas } : {}),
      ...(topology.shards > 1 ? { shards: topology.shards } : {}),
    },
  }
}

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

const fromReplayNode = (node: ReplayNodeV1, load: 1 | 3 | 10): SystemFlowNode => {
  const topology = normalizeNodeTopology(node.data.kind, node.data)
  return {
    ...node,
    selected: false,
    data: {
      ...node.data,
      ...topology,
      health: 'healthy',
      detail: 'Ready',
      load,
    },
  }
}

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

const legacyReplayTranslations = [
  ['Attempt started with Redis unavailable', 'Попытка началась при недоступном Redis'],
  ['Attempt started with a 50M-follower spike', 'Попытка началась со скачка на 50 млн подписчиков'],
  ['Architecture replay is ready', 'Повтор архитектуры готов'],
  ['Design submitted without an injected failure', 'Решение отправлено без включённого сбоя'],
  ['The submission captured the final architecture state.', 'Зафиксировано итоговое состояние архитектуры.'],
  ['This failure was already active in the initial state.', 'Сбой уже был активен в исходном состоянии.'],
  ['Database saturated', 'База данных насыщена'],
  ['The first critical state appeared at 100k req/s.', 'Первое критическое состояние возникло при 100 тыс. запросов/с.'],
  ['Topology updated', 'Топология обновлена'],
  ['Topology recalculated', 'Топология пересчитана'],
  ['Capacity tuning updated', 'Параметры ёмкости обновлены'],
  ['Answer reviewed', 'Ответ разобран'],
  ['Connection added', 'Связь добавлена'],
  ['Connection removed', 'Связь удалена'],
  ['Component removed', 'Компонент удалён'],
] as const

const localizeLegacyReplayText = (text: string, locale: Locale) => {
  const normalized = text.trim()
  const exact = legacyReplayTranslations.find(([en, ru]) => normalized === en || normalized === ru)
  if (exact) return locale === 'ru' ? exact[1] : exact[0]
  const cases = normalized.match(/^(\d+) of (\d+) cases passed$/)
  if (cases && locale === 'ru') return `Пройдено кейсов: ${cases[1]} из ${cases[2]}`
  const russianCases = normalized.match(/^Пройдено кейсов: (\d+) из (\d+)$/)
  if (russianCases && locale === 'en') return `${russianCases[1]} of ${russianCases[2]} cases passed`
  const offered = normalized.match(/^(\d+)k req\/s offered$/)
  if (offered && locale === 'ru') return `Подано ${offered[1]} тыс. запросов/с`
  const russianOffered = normalized.match(/^Подано (\d+)(?:k| тыс\.) запросов\/с$/)
  if (russianOffered && locale === 'en') return `${russianOffered[1]}k req/s offered`
  return normalized
}

const replayEventText = (
  attempt: ReplayAttemptV1,
  event: ReplayEventV1,
  locale: Locale,
) => {
  const ru = locale === 'ru'
  switch (event.type) {
    case 'load.changed':
      return {
        title: ru ? `Целевая нагрузка: ${event.payload.load}×` : `Target load: ${event.payload.load}×`,
        detail: attempt.challengeId === 'news-feed'
          ? ru
            ? `Подано ${event.payload.load * 30} тыс. чтений ленты/с`
            : `${event.payload.load * 30}k timeline reads/s offered`
          : ru
            ? `Подано ${event.payload.load * 10} тыс. запросов/с`
            : `${event.payload.load * 10}k req/s offered`,
      }
    case 'fault.changed':
      return event.payload.fault === 'none'
        ? {
            title: ru ? 'Сбой снят' : 'Fault cleared',
            detail: ru ? 'Система восстанавливается' : 'System is recovering',
          }
        : {
            title: faultLabels[locale][event.payload.fault],
            detail: ru ? 'Сбой добавлен в симуляцию' : 'Fault injected into the simulation',
          }
    case 'capacity.changed':
      return {
        title: ru ? 'Параметры ёмкости обновлены' : 'Capacity tuning updated',
        detail: ru ? 'Стоимость и пределы системы пересчитаны' : 'Cost and system limits recalculated',
      }
    case 'node.added': {
      const suffix = event.payload.node.data.label.match(/\s+\d+$/)?.[0] ?? ''
      return {
        title: ru ? 'Компонент добавлен' : 'Component added',
        detail: `${componentLabels[locale][event.payload.node.data.kind]}${suffix}`,
      }
    }
    case 'node.updated': {
      const topology = event.payload.patch.data
      return topology?.replicas !== undefined || topology?.shards !== undefined
        ? {
            title: ru ? 'Топология обновлена' : 'Topology updated',
            detail: `${event.payload.nodeId}: ${topology.replicas ?? 1}× / ${topology.shards ?? 1}`,
          }
        : {
            title: ru ? 'Расположение схемы обновлено' : 'Architecture layout updated',
            detail: event.payload.nodeId,
          }
    }
    case 'node.removed':
      return {
        title: ru ? 'Компонент удалён' : 'Component removed',
        detail: ru ? 'Топология пересчитана' : 'Topology recalculated',
      }
    case 'edge.added':
      return {
        title: ru ? 'Связь добавлена' : 'Connection added',
        detail: ru ? 'Топология пересчитана' : 'Topology recalculated',
      }
    case 'edge.updated':
      return {
        title: ru ? 'Связь обновлена' : 'Connection updated',
        detail: ru ? 'Топология пересчитана' : 'Topology recalculated',
      }
    case 'edge.removed':
      return {
        title: ru ? 'Связь удалена' : 'Connection removed',
        detail: ru ? 'Топология пересчитана' : 'Topology recalculated',
      }
    case 'architecture.replaced':
      return {
        title: ru ? 'Архитектура заменена' : 'Architecture replaced',
        detail: ru ? 'Состояние схемы восстановлено' : 'Diagram state restored',
      }
    case 'answer.submitted':
      return {
        title: event.payload.focus?.startsWith('prediction:')
          ? ru ? 'Прогноз проверен' : 'Prediction reviewed'
          : ru ? 'Ответ разобран' : 'Answer reviewed',
        detail: ru ? 'Обратная связь интервьюера сохранена' : 'Interviewer feedback saved',
      }
    case 'design.submitted':
      return {
        title: `${ru ? 'Решение отправлено' : 'Design submitted'} · ${event.payload.submission.score}/100`,
        detail: ru
          ? `Пройдено кейсов: ${event.payload.submission.passedCases} из ${event.payload.submission.totalCases}`
          : `${event.payload.submission.passedCases} of ${event.payload.submission.totalCases} cases passed`,
      }
  }
}

export const replayTimelineEvents = (
  attempt: ReplayAttemptV1,
  locale: Locale = 'en',
): ReplayTimelineItem[] =>
  [...attempt.events].sort(compareReplayEvents).flatMap((event) => {
    if (!event.timeline) return []
    const text = replayEventText(attempt, event, locale)
    return [{
        id: event.id,
        atMs: event.atMs,
        title: text.title,
        detail: text.detail,
        tone: event.timeline.tone,
      }]
  })

export const replayKeyMoment = (attempt: ReplayAttemptV1, locale: Locale = 'en') =>
  (attempt.summary?.keyMoment?.title
    ? (() => {
        const localized = localizeLegacyReplayText(attempt.summary!.keyMoment!.title, locale)
        const needsSemanticFallback = locale === 'en'
          ? /[А-Яа-яЁё]/.test(localized)
          : !/[А-Яа-яЁё]/.test(localized)
        const event = attempt.summary!.keyMoment!.eventId
          ? attempt.events.find(({ id }) => id === attempt.summary!.keyMoment!.eventId)
          : undefined
        return needsSemanticFallback && event
          ? replayEventText(attempt, event, locale).title
          : localized
      })()
    : undefined) ??
  replayTimelineEvents(attempt, locale).find((event) => event.tone === 'critical')?.title ??
  (attempt.initial.fault === 'cache-outage'
    ? locale === 'ru' ? 'Попытка началась при недоступном Redis' : 'Attempt started with Redis unavailable'
    : attempt.initial.fault === 'none'
      ? locale === 'ru' ? 'Повтор архитектуры готов' : 'Architecture replay is ready'
      : locale === 'ru'
        ? `Попытка началась со сбоя «${faultLabels.ru[attempt.initial.fault].toLowerCase()}»`
        : `Attempt started with ${faultLabels.en[attempt.initial.fault].toLowerCase()}`)

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
