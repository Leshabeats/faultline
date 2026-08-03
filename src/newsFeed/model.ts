import {
  DEFAULT_CAPACITY_TUNING,
} from '../capacity/model'
import type {
  CapacityTuning,
  ComponentKind,
  FaultMode,
  NewsFeedBottleneck,
  NewsFeedReport,
} from '../domain/system'

export const NEWS_FEED_MODEL_LABEL = 'Celebrity model · estimated'

export const DEFAULT_NEWS_FEED_TUNING: CapacityTuning = {
  ...DEFAULT_CAPACITY_TUNING,
  fanoutStrategy: 'write',
  fanoutWorkers: 16,
  fanoutBatchSize: 500,
  celebrityThreshold: 10_000_000,
  deduplication: false,
}

const secondsPerMonth = 30 * 24 * 60 * 60
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export const normalizeNewsFeedTuning = (tuning?: CapacityTuning) => ({
  strategy: tuning?.fanoutStrategy ?? DEFAULT_NEWS_FEED_TUNING.fanoutStrategy!,
  workers: tuning?.fanoutWorkers ?? DEFAULT_NEWS_FEED_TUNING.fanoutWorkers!,
  batchSize: tuning?.fanoutBatchSize ?? DEFAULT_NEWS_FEED_TUNING.fanoutBatchSize!,
  celebrityThreshold:
    tuning?.celebrityThreshold ?? DEFAULT_NEWS_FEED_TUNING.celebrityThreshold!,
  deduplication: tuning?.deduplication ?? DEFAULT_NEWS_FEED_TUNING.deduplication!,
})

interface EstimateNewsFeedInput {
  loadMultiplier: 1 | 3 | 10
  fault: FaultMode
  tuning?: CapacityTuning
  componentCounts?: Partial<Record<ComponentKind, number>>
  criticalPathConnected?: boolean
}

export function estimateNewsFeed(input: EstimateNewsFeedInput): NewsFeedReport {
  const load = input.loadMultiplier
  const tuning = normalizeNewsFeedTuning(input.tuning)
  const postsPerSecond = 2_000 * load
  const readsPerSecond = 30_000 * load
  const celebrityFollowers = input.fault === 'celebrity-spike' ? 50_000_000 : 0
  const averageFollowers = 240
  const writeFanout = postsPerSecond * averageFollowers
  const celebrityUsesReadPath =
    tuning.strategy === 'read' ||
    (tuning.strategy === 'hybrid' && celebrityFollowers >= tuning.celebrityThreshold)
  const fanoutJobsPerSecond = tuning.strategy === 'read'
    ? 0
    : writeFanout + (celebrityUsesReadPath ? 0 : celebrityFollowers)

  const serviceReplicas = Math.max(1, input.componentCounts?.service ?? 1)
  const cacheReplicas = Math.max(1, input.componentCounts?.cache ?? 1)
  const databaseReplicas = Math.max(1, input.componentCounts?.database ?? 1)
  const availableWorkerFactor = input.fault === 'worker-outage' ? 0.5 : 1
  const workerCapacity =
    tuning.workers * tuning.batchSize * 80 * serviceReplicas * availableWorkerFactor
  const workerUtilization = fanoutJobsPerSecond / Math.max(1, workerCapacity)
  const queueBacklog = Math.max(0, fanoutJobsPerSecond - workerCapacity) * 12
  const queueUtilization = Math.max(
    workerUtilization,
    queueBacklog / Math.max(1, workerCapacity * 5),
  )

  const readAmplification = tuning.strategy === 'read' ? 18 : celebrityUsesReadPath ? 4 : 1
  const cacheCapacity = 550_000 * cacheReplicas
  const cacheUtilization =
    (readsPerSecond * (tuning.strategy === 'write' ? 1 : 1.35)) / cacheCapacity +
    (input.fault === 'hot-key' ? 0.95 : 0)
  const postStoreCapacity = 2_400_000 * databaseReplicas
  const postStoreUtilization =
    (postsPerSecond * 3 + readsPerSecond * readAmplification) / postStoreCapacity

  const queueDelayMs = clamp(
    queueBacklog / Math.max(1, workerCapacity) * 1_000,
    0,
    60_000,
  )
  let freshnessP99 =
    110 +
    queueDelayMs +
    (tuning.strategy === 'read' ? 780 : celebrityUsesReadPath ? 240 : 0) +
    Math.max(0, cacheUtilization - 0.8) * 1_400 +
    Math.max(0, postStoreUtilization - 0.75) * 1_200
  if (input.fault === 'hot-key') freshnessP99 += 900

  const duplicateRate = input.fault === 'duplicate-delivery'
    ? tuning.deduplication ? 0.05 : 4.8
    : tuning.deduplication ? 0.02 : 0.35
  let staleRate =
    Math.max(0.1, (freshnessP99 - 1_000) / 1_600) +
    Math.max(0, workerUtilization - 1) * 2.4 +
    duplicateRate * 0.18

  if (input.criticalPathConnected === false) {
    freshnessP99 = Math.max(freshnessP99, 60_000)
    staleRate = Math.max(staleRate, 88)
  }

  const deliveredPerSecond = input.criticalPathConnected === false
    ? Math.min(fanoutJobsPerSecond, workerCapacity) * 0.12
    : tuning.strategy === 'read'
      ? readsPerSecond
      : Math.min(fanoutJobsPerSecond, workerCapacity)

  const steadyFanoutJobsPerSecond = tuning.strategy === 'read' ? 0 : writeFanout
  const monthlyCelebrityBurstRequests = celebrityUsesReadPath
    ? 0
    : (celebrityFollowers / tuning.batchSize) * 2 * 30
  const queueRequestsPerMonth =
    (steadyFanoutJobsPerSecond / tuning.batchSize) * secondsPerMonth * 2 +
    monthlyCelebrityBurstRequests
  const workerCost = tuning.workers * serviceReplicas * 42
  const queueCost = queueRequestsPerMonth / 1_000_000 * 0.4
  const cacheCost = cacheReplicas * (260 + Math.max(0, cacheUtilization - 0.7) * 160)
  const postStoreCost = databaseReplicas * (780 + Math.max(0, postStoreUtilization - 0.6) * 520)
  const cost = {
    workers: round(workerCost),
    queue: round(queueCost),
    cache: round(cacheCost),
    postStore: round(postStoreCost),
    total: round(workerCost + queueCost + cacheCost + postStoreCost),
  }

  const utilization: Record<NewsFeedBottleneck, number> = {
    workers: workerUtilization,
    'fanout-queue': queueUtilization,
    'timeline-cache': cacheUtilization,
    'post-store': postStoreUtilization,
  }
  const bottleneck = (Object.entries(utilization) as Array<[NewsFeedBottleneck, number]>)
    .sort((left, right) => right[1] - left[1])[0][0]
  const peakUtilization = Math.max(...Object.values(utilization))
  const status = peakUtilization > 1.15 || freshnessP99 > 5_000
    ? 'saturated'
    : peakUtilization > 0.78 || freshnessP99 > 2_500
      ? 'at-risk'
      : 'within-envelope'

  return {
    modelVersion: 'celebrity-2026.08',
    modelStatus: 'estimated',
    workload: {
      postsPerSecond,
      readsPerSecond,
      fanoutJobsPerSecond,
      celebrityFollowers,
    },
    utilization: {
      workers: round(workerUtilization, 3),
      queue: round(queueUtilization, 3),
      cache: round(cacheUtilization, 3),
      postStore: round(postStoreUtilization, 3),
    },
    metrics: {
      throughput: round(deliveredPerSecond),
      p99: round(freshnessP99),
      errorRate: round(clamp(staleRate, 0, 100), 1),
      dbCpu: round(clamp(workerUtilization * 100, 0, 100)),
      cacheMiss: round(clamp(4 + Math.max(0, cacheUtilization - 0.7) * 38, 0, 100), 1),
      queueDepth: round(queueBacklog),
    },
    cost,
    duplicateRate,
    bottleneck,
    status,
    assumptions: [
      'A normal post fans out to 240 followers on average.',
      'Worker throughput is derived from worker count × batch size × 80 batches/s.',
      'Celebrity posts arrive as a single 50M-follower burst in the spike case.',
      'Monthly queue cost holds the selected normal load for 30 days and models one celebrity burst per day.',
      'Costs are transparent training estimates, not a cloud-provider quote.',
    ],
  }
}
