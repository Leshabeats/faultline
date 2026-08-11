import type {
  ComponentHealth,
  ComponentKind,
  SimulationInput,
  SimulationMetrics,
  SimulationSnapshot,
} from '../domain/system'
import { DEFAULT_CAPACITY_TUNING, estimateCapacity } from '../capacity/model'
import { estimateNewsFeed } from '../newsFeed/model'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const withMotion = (
  metrics: SimulationMetrics,
  tick: number,
): SimulationMetrics => {
  const wave = Math.sin(tick * 0.72)
  const counterWave = Math.cos(tick * 0.41)

  return {
    throughput: Math.max(0, round(metrics.throughput * (1 + wave * 0.008))),
    p99: Math.max(1, round(metrics.p99 + counterWave * metrics.p99 * 0.018)),
    errorRate: clamp(round(metrics.errorRate + wave * 0.18, 1), 0, 100),
    dbCpu: clamp(round(metrics.dbCpu + counterWave * 0.7), 0, 100),
    cacheMiss: clamp(round(metrics.cacheMiss + wave * 0.35, 1), 0, 100),
    queueDepth: Math.max(0, round(metrics.queueDepth * (1 + counterWave * 0.025))),
  }
}

const baseMetrics = (load: number): SimulationMetrics => ({
  throughput: 10_000 * load,
  p99: round(24 + 4.8 * load + 0.48 * load ** 2),
  errorRate: round(0.15 + 0.035 * load, 1),
  dbCpu: round(24 + 4.6 * load),
  cacheMiss: round(4.2 + 0.28 * load, 1),
  queueDepth: round(220 * load),
})

const applyTargetedFaultImpact = (
  metrics: SimulationMetrics,
  input: SimulationInput,
): SimulationMetrics => {
  const impact = input.faultImpact
  if (!impact) return metrics
  const loss = impact.remainingReplicas === 0
    ? 1
    : 1 / (impact.remainingReplicas + 1)
  const next = { ...metrics }

  if (impact.targetType === 'edge') {
    if (!impact.routeDisconnected) {
      next.throughput *= 0.82
      next.p99 += 85
      next.errorRate += 2.4
      next.queueDepth *= 1.45
    }
    return next
  }

  switch (impact.componentKind) {
    case 'gateway':
      next.throughput *= 1 - 0.38 * loss
      next.p99 += 110 * loss
      next.errorRate += 6.5 * loss
      break
    case 'service':
      next.throughput *= 1 - 0.32 * loss
      next.p99 *= 1 + 1.15 * loss
      next.errorRate += 4.8 * loss
      next.queueDepth *= 1 + 1.8 * loss
      break
    case 'cache':
      next.cacheMiss += 58 * loss
      next.p99 *= 1 + 1.4 * loss
      next.dbCpu += 34 * loss
      next.errorRate += 3.6 * loss
      break
    case 'queue':
      next.queueDepth = Math.max(next.queueDepth, 2_200 * input.loadMultiplier * loss)
      next.p99 *= 1 + 0.75 * loss
      next.errorRate += 2.2 * loss
      break
    case 'database':
      next.dbCpu += 42 * loss
      next.p99 *= 1 + 1.8 * loss
      next.errorRate += 5.4 * loss
      break
    case 'client':
    case 'region':
    case undefined:
      break
  }
  return next
}

function computeUrlShortenerSimulation(input: SimulationInput): SimulationSnapshot {
  const { loadMultiplier: load, fault, tick } = input
  const baseline = baseMetrics(load)
  let metrics: SimulationMetrics = { ...baseline }
  const nodeHealth: Partial<Record<ComponentKind, ComponentHealth>> = {
    client: 'healthy',
    gateway: 'healthy',
    service: 'healthy',
    cache: 'healthy',
    queue: 'healthy',
    database: baseline.dbCpu > 80 ? 'hot' : 'healthy',
    region: 'healthy',
  }
  const nodeDetails: Partial<Record<ComponentKind, string>> = {
    client: `${round(metrics.throughput / 1000)}k req/s`,
    gateway: `${round(metrics.p99 * 0.08)}ms edge`,
    service: `${round(metrics.p99 * 0.2)}ms app`,
    cache: `${metrics.cacheMiss}% miss`,
    queue: `${metrics.queueDepth} queued`,
    database: `${metrics.dbCpu}% CPU`,
    region: 'Connected',
  }

  switch (fault) {
    case 'cache-outage':
      metrics = {
        ...metrics,
        throughput: 10_000 * load,
        p99: 602 + 24 * load,
        errorRate: 4.2 + 0.82 * load,
        dbCpu: clamp(66 + 3 * load, 0, 100),
        cacheMiss: 82,
        queueDepth: 480 * load,
      }
      nodeHealth.cache = 'failed'
      nodeHealth.database = 'hot'
      nodeHealth.service = 'degraded'
      break
    case 'slow-database':
      metrics = {
        ...metrics,
        p99: 310 + 31 * load,
        errorRate: 1.1 + 0.38 * load,
        dbCpu: clamp(72 + 2.4 * load, 0, 100),
        cacheMiss: 11 + load * 0.8,
        queueDepth: 650 * load,
      }
      nodeHealth.database = 'hot'
      nodeHealth.service = 'degraded'
      break
    case 'network-partition':
      if (input.faultImpact?.targetType === 'edge') break
      metrics = {
        ...metrics,
        throughput: baseline.throughput * 0.63,
        p99: 420 + 19 * load,
        errorRate: 8.5 + 0.76 * load,
        dbCpu: baseline.dbCpu * 0.78,
        cacheMiss: 37,
        queueDepth: 380 * load,
      }
      nodeHealth.gateway = 'failed'
      nodeHealth.service = 'degraded'
      break
    case 'retry-storm':
      metrics = {
        ...metrics,
        throughput: baseline.throughput * 1.34,
        p99: 260 + 22 * load,
        errorRate: 3.8 + 0.48 * load,
        dbCpu: clamp(62 + 3.1 * load, 0, 100),
        cacheMiss: 18 + load,
        queueDepth: 2_400 * load,
      }
      nodeHealth.service = 'degraded'
      nodeHealth.queue = 'backlog'
      nodeHealth.database = 'hot'
      break
    case 'none':
      break
  }

  if (input.componentCounts) {
    const serviceReplicas = Math.max(1, input.componentCounts.service ?? 0)
    const cacheReplicas = Math.max(
      1,
      input.replicaCounts?.cache ?? input.componentCounts.cache ?? 0,
    )
    const databaseReplicas = Math.max(1, input.componentCounts.database ?? 0)
    const serviceRelief = 1 + (serviceReplicas - 1) * 0.38
    const databaseRelief = 1 + (databaseReplicas - 1) * 0.3

    metrics.p99 /= serviceRelief
    metrics.errorRate /= 1 + (serviceReplicas - 1) * 0.22
    metrics.dbCpu /= databaseRelief

    if (fault === 'cache-outage' && cacheReplicas > 1) {
      const survivingReplicas = cacheReplicas - 1
      metrics.cacheMiss = Math.max(18, 82 / (1 + survivingReplicas * 0.7))
      metrics.p99 /= 1 + survivingReplicas * 0.22
      metrics.errorRate /= 1 + survivingReplicas * 0.32
      metrics.dbCpu /= 1 + survivingReplicas * 0.2
      nodeHealth.cache = 'degraded'
      if (metrics.dbCpu < 86) nodeHealth.database = 'healthy'
    }
  }

  const capacity = estimateCapacity({
    loadMultiplier: load,
    fault,
    tuning: input.capacity ?? DEFAULT_CAPACITY_TUNING,
    componentCounts: input.componentCounts,
    replicaCounts: input.replicaCounts,
    criticalPathConnected: true,
  })

  if (input.capacity) {
    metrics = { ...capacity.metrics }
    nodeHealth.database = metrics.dbCpu >= 80 ? 'hot' : 'healthy'
    nodeHealth.service =
      capacity.utilization.service > 1 || metrics.p99 >= 250
        ? 'degraded'
        : 'healthy'
    nodeHealth.queue = metrics.queueDepth >= 2_000 ? 'backlog' : 'healthy'
    if (fault === 'cache-outage') {
      const cacheReplicas = Math.max(
        1,
        input.replicaCounts?.cache ?? input.componentCounts?.cache ?? 1,
      )
      nodeHealth.cache = cacheReplicas > 1 ? 'degraded' : 'failed'
    } else {
      nodeHealth.cache = capacity.utilization.cache >= 1 ? 'hot' : 'healthy'
    }
    if (fault === 'network-partition') nodeHealth.gateway = 'failed'
  }

  if (input.criticalPathConnected === false) {
    metrics.throughput *= 0.12
    metrics.p99 = Math.max(metrics.p99, 1_500)
    metrics.errorRate = Math.max(metrics.errorRate, 88)
    metrics.queueDepth = Math.max(metrics.queueDepth, 1_200 * load)
  }

  metrics = applyTargetedFaultImpact(metrics, input)

  metrics = withMotion(
    {
      throughput: round(metrics.throughput),
      p99: round(metrics.p99),
      errorRate: round(metrics.errorRate, 1),
      dbCpu: round(metrics.dbCpu),
      cacheMiss: round(metrics.cacheMiss, 1),
      queueDepth: round(metrics.queueDepth),
    },
    tick,
  )

  if (nodeHealth.database === 'hot' && metrics.dbCpu < 80) {
    nodeHealth.database = fault === 'none' ? 'healthy' : 'degraded'
  }
  if (
    nodeHealth.service === 'degraded' &&
    metrics.p99 < 250 &&
    metrics.errorRate < 2
  ) {
    nodeHealth.service = 'healthy'
  }

  nodeDetails.client = `${round(metrics.throughput / 1000)}k req/s`
  nodeDetails.gateway =
    input.criticalPathConnected === false
      ? 'Route degraded'
      : nodeHealth.gateway === 'failed'
        ? 'Partitioned'
        : `${round(metrics.p99 * 0.08)}ms edge`
  nodeDetails.service =
    input.criticalPathConnected === false
      ? 'No route'
      : nodeHealth.service === 'degraded'
        ? 'Saturated'
        : `${round(metrics.p99 * 0.2)}ms app`
  nodeDetails.cache = nodeHealth.cache === 'failed'
    ? 'Unavailable'
    : nodeHealth.cache === 'hot' && input.capacity
      ? `${round(capacity.utilization.cache * 100)}% capacity`
      : `${metrics.cacheMiss}% miss`
  nodeDetails.queue = nodeHealth.queue === 'backlog' ? `${metrics.queueDepth} backlog` : `${metrics.queueDepth} queued`
  nodeDetails.database = `${metrics.dbCpu}% CPU`

  const severity =
    metrics.errorRate >= 8 || metrics.dbCpu >= 94
      ? 'critical'
      : metrics.errorRate >= 2 || metrics.p99 >= 250
        ? 'degraded'
        : 'normal'

  return {
    metrics,
    nodeHealth,
    nodeDetails,
    severity,
    capacity: { ...capacity, metrics: { ...metrics } },
  }
}

function computeNewsFeedSimulation(input: SimulationInput): SimulationSnapshot {
  const report = estimateNewsFeed({
    loadMultiplier: input.loadMultiplier,
    fault: input.fault,
    tuning: input.capacity,
    componentCounts: input.componentCounts,
    criticalPathConnected: input.criticalPathConnected,
  })
  const metrics = withMotion(
    applyTargetedFaultImpact(report.metrics, input),
    input.tick,
  )
  const nodeHealth: Partial<Record<ComponentKind, ComponentHealth>> = {
    client: 'healthy',
    gateway: input.criticalPathConnected === false ? 'degraded' : 'healthy',
    service: report.utilization.workers >= 1
      ? input.fault === 'worker-outage' ? 'failed' : 'degraded'
      : 'healthy',
    queue: report.metrics.queueDepth > 0 ? 'backlog' : 'healthy',
    cache: report.utilization.cache >= 1 ? 'hot' : 'healthy',
    database: report.utilization.postStore >= 1 ? 'hot' : 'healthy',
    region: 'healthy',
  }
  if (input.fault === 'hot-key') nodeHealth.cache = 'hot'
  if (input.fault === 'duplicate-delivery') nodeHealth.queue = 'degraded'

  const tuning = input.capacity
  const strategy = tuning?.fanoutStrategy ?? 'write'
  const nodeDetails: Partial<Record<ComponentKind, string>> = {
    client: `${round(report.workload.readsPerSecond / 1000)}k reads/s`,
    gateway: input.criticalPathConnected === false ? 'Route degraded' : `${strategy} fan-out`,
    service: input.fault === 'worker-outage'
      ? 'Half fleet down'
      : report.utilization.workers >= 10
        ? `${round(report.utilization.workers, 1)}× demand`
        : `${Math.round(report.utilization.workers * 100)}% busy`,
    queue: report.metrics.queueDepth > 0
      ? `${formatMetric(report.metrics.queueDepth, 'queueDepth')} backlog`
      : 'Draining',
    cache: input.fault === 'hot-key'
      ? 'Celebrity hot key'
      : `${Math.round(report.utilization.cache * 100)}% load`,
    database: `${Math.round(report.utilization.postStore * 100)}% load`,
    region: 'Connected',
  }
  const severity = metrics.errorRate >= 8 || metrics.p99 >= 5_000
    ? 'critical'
    : metrics.errorRate >= 2 || metrics.p99 >= 1_000
      ? 'degraded'
      : 'normal'

  return { metrics, nodeHealth, nodeDetails, severity }
}

export function computeSimulation(input: SimulationInput): SimulationSnapshot {
  return input.scenario === 'news-feed'
    ? computeNewsFeedSimulation(input)
    : computeUrlShortenerSimulation(input)
}

export function formatMetric(value: number, kind: keyof SimulationMetrics) {
  if (kind === 'throughput') {
    if (value >= 1_000_000_000) return `${round(value / 1_000_000_000, 1)}B`
    if (value >= 1_000_000) return `${round(value / 1_000_000, 1)}M`
    return value >= 1000 ? `${round(value / 1000)}k` : `${value}`
  }
  if (kind === 'p99') return value >= 10_000
    ? `${round(value / 1000, 1)} s`
    : `${round(value)} ms`
  if (kind === 'errorRate' || kind === 'dbCpu' || kind === 'cacheMiss') {
    return `${round(value, kind === 'errorRate' ? 1 : 0)}%`
  }
  if (value >= 1_000_000_000) return `${round(value / 1_000_000_000, 1)}B`
  if (value >= 1_000_000) return `${round(value / 1_000_000, 1)}M`
  return value >= 1000 ? `${round(value / 1000, 1)}k` : `${round(value)}`
}
