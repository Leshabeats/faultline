import type {
  ComponentHealth,
  Locale,
  SimulationSnapshot,
} from '../domain/system'
import { UI_COPY } from '../i18n'
import { formatMetric } from '../simulation/engine'
import type { SystemEdgeData, SystemFlowEdge, SystemFlowNode } from './types'

interface CacheAsidePresentationInput {
  edges: SystemFlowEdge[]
  snapshot: SimulationSnapshot
  cacheHealth: ComponentHealth
  locale: Locale
}

const clampRatio = (value: number) => Math.min(1, Math.max(0, value))

export function summarizeCacheHealth(nodes: SystemFlowNode[]): ComponentHealth {
  const caches = nodes.filter((node) => node.data.kind === 'cache')
  if (caches.length === 0 || caches.every((node) => node.data.health === 'failed')) {
    return 'failed'
  }
  if (caches.some((node) => node.data.health === 'failed' || node.data.health === 'degraded')) {
    return 'degraded'
  }
  return caches.some((node) => node.data.health === 'hot') ? 'hot' : 'healthy'
}

/**
 * Projects the URL-shortener's cache-aside semantics onto the two real calls:
 * API -> Redis for lookups and API -> DB for misses or cache bypass.
 */
export function projectCacheAsideTraffic({
  edges,
  snapshot,
  cacheHealth,
  locale,
}: CacheAsidePresentationInput): SystemFlowEdge[] {
  const copy = UI_COPY[locale]
  const missRate = Math.min(100, Math.max(0, snapshot.metrics.cacheMiss))
  const cacheUnavailable = cacheHealth === 'failed' || missRate >= 99.5
  const modeledOfferedRps = snapshot.capacity?.workload.redirectRps
  const offeredRps = modeledOfferedRps ?? snapshot.metrics.throughput
  const databaseReadRps = offeredRps * missRate / 100
  const fallbackRatio = offeredRps > 0
    ? clampRatio(databaseReadRps / offeredRps)
    : 0

  return edges.filter((edge) => edge.id !== 'cache-database').map((edge) => {
    const data: SystemEdgeData = edge.data ?? {
      tone: 'healthy',
      intensity: 1,
      paused: false,
    }
    if (edge.id === 'api-cache') {
      return {
        ...edge,
        label: cacheUnavailable
          ? copy.cacheUnavailable
          : locale === 'ru'
            ? `${Math.round(missRate)}% промахов`
            : `${Math.round(missRate)}% miss`,
        data: {
          ...data,
          flowRatio: cacheUnavailable ? 0 : 1,
          paused: data.paused || cacheUnavailable,
        },
      }
    }

    if (edge.id === 'api-database') {
      const rate = `${formatMetric(databaseReadRps, 'throughput')} ${copy.requestRateShort}`
      return {
        ...edge,
        label: cacheUnavailable
          ? `${rate} · ${copy.databaseFallback} · p99 ${formatMetric(snapshot.metrics.p99, 'p99')}`
          : `${rate} · ${copy.cacheMissPath}`,
        data: {
          ...data,
          tone: cacheHealth === 'healthy'
            ? data.tone
            : data.tone === 'critical' ? 'critical' : 'warning',
          flowRatio: fallbackRatio,
        },
      }
    }

    return edge
  })
}
