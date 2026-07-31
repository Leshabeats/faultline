import type {
  ComponentHealth,
  ComponentKind,
  SimulationInput,
  SimulationMetrics,
  SimulationSnapshot,
} from '../domain/system'

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
    errorRate: Math.max(0, round(metrics.errorRate + wave * 0.18, 1)),
    dbCpu: clamp(round(metrics.dbCpu + counterWave * 0.7), 0, 100),
    cacheMiss: clamp(round(metrics.cacheMiss + wave * 0.35, 1), 0, 100),
    queueDepth: Math.max(0, round(metrics.queueDepth * (1 + counterWave * 0.025))),
  }
}

const baseMetrics = (load: 1 | 3 | 10): SimulationMetrics => ({
  throughput: 10_000 * load,
  p99: round(24 + 4.8 * load + 0.48 * load ** 2),
  errorRate: round(0.15 + 0.035 * load, 1),
  dbCpu: round(24 + 4.6 * load),
  cacheMiss: round(4.2 + 0.28 * load, 1),
  queueDepth: round(220 * load),
})

export function computeSimulation(input: SimulationInput): SimulationSnapshot {
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
    const cacheReplicas = Math.max(1, input.componentCounts.cache ?? 0)
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

  if (input.criticalPathConnected === false) {
    metrics.throughput *= 0.12
    metrics.p99 = Math.max(metrics.p99, 1_500)
    metrics.errorRate = Math.max(metrics.errorRate, 88)
    metrics.queueDepth = Math.max(metrics.queueDepth, 1_200 * load)
    nodeHealth.service = 'failed'
    nodeHealth.gateway = 'degraded'
  }

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
  nodeDetails.cache = nodeHealth.cache === 'failed' ? 'Unavailable' : `${metrics.cacheMiss}% miss`
  nodeDetails.queue = nodeHealth.queue === 'backlog' ? `${metrics.queueDepth} backlog` : `${metrics.queueDepth} queued`
  nodeDetails.database = `${metrics.dbCpu}% CPU`

  const severity =
    metrics.errorRate >= 8 || metrics.dbCpu >= 94
      ? 'critical'
      : metrics.errorRate >= 2 || metrics.p99 >= 250
        ? 'degraded'
        : 'normal'

  return { metrics, nodeHealth, nodeDetails, severity }
}

export function formatMetric(value: number, kind: keyof SimulationMetrics) {
  if (kind === 'throughput') {
    return value >= 1000 ? `${round(value / 1000)}k` : `${value}`
  }
  if (kind === 'p99') return `${round(value)} ms`
  if (kind === 'errorRate' || kind === 'dbCpu' || kind === 'cacheMiss') {
    return `${round(value, kind === 'errorRate' ? 1 : 0)}%`
  }
  return value >= 1000 ? `${round(value / 1000, 1)}k` : `${round(value)}`
}
