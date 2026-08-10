import { seedEdges, seedNodes } from '../canvas/seed'
import { newsFeedSeedEdges, newsFeedSeedNodes } from '../canvas/newsFeedSeed'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'
import { DEFAULT_NEWS_FEED_TUNING } from '../newsFeed/model'
import type { ScenarioId } from '../domain/system'
import { newsFeedChallenge } from './newsFeed'
import type { ChallengePack } from './types'
import { urlShortenerChallenge } from './urlShortener'

export const challengePacks: Record<ScenarioId, ChallengePack> = {
  'url-shortener': {
    id: 'url-shortener',
    definition: urlShortenerChallenge,
    seedNodes,
    seedEdges,
    defaults: { load: 1, fault: 'none', tuning: DEFAULT_CAPACITY_TUNING },
    faults: ['none', 'cache-outage', 'slow-database', 'network-partition', 'retry-storm'],
    panel: 'capacity',
    telemetryLabels: {
      throughput: 'Throughput',
      p99: 'p99',
      errorRate: 'Errors',
      dbCpu: 'DB CPU',
    },
    canvasLabel: 'URL shortener architecture',
  },
  'news-feed': {
    id: 'news-feed',
    definition: newsFeedChallenge,
    seedNodes: newsFeedSeedNodes,
    seedEdges: newsFeedSeedEdges,
    defaults: { load: 1, fault: 'none', tuning: DEFAULT_NEWS_FEED_TUNING },
    faults: ['none', 'celebrity-spike', 'worker-outage', 'hot-key', 'duplicate-delivery'],
    panel: 'fanout',
    telemetryLabels: {
      throughput: 'Deliveries',
      p99: 'Freshness',
      errorRate: 'Stale',
      dbCpu: 'Workers',
    },
    canvasLabel: 'News feed fan-out architecture',
  },
}

export const challengeOptions = Object.values(challengePacks).map((pack) => ({
  id: pack.id,
  title: pack.definition.title,
  difficulty: pack.definition.difficulty,
}))

export function getChallengePack(id: string): ChallengePack {
  return challengePacks[id as ScenarioId] ?? challengePacks['url-shortener']
}

export const clonePackNodes = (pack: ChallengePack) =>
  pack.seedNodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } }))

export const clonePackEdges = (pack: ChallengePack) =>
  pack.seedEdges.map((edge) => ({ ...edge, data: edge.data ? { ...edge.data } : undefined }))
