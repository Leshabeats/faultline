import { newsFeedChallenge } from '../challenges/newsFeed'
import type { ChallengeCase } from '../challenges/types'
import type { ComponentKind, SimulationSnapshot } from '../domain/system'
import { computeSimulation } from '../simulation/engine'
import type {
  HiddenCaseResult,
  JudgeCaseResult,
  JudgeOptions,
  JudgeReport,
  PublicAssertionResult,
  PublicCaseResult,
  ScoreBreakdownItem,
  TopologySummary,
} from './types'

interface EvaluationContext {
  topology: TopologySummary
  snapshot: SimulationSnapshot
}

interface AssertionDefinition {
  id: string
  label: string
  evaluate: (context: EvaluationContext) => boolean
}

interface EvaluatedCase {
  definition: ChallengeCase
  snapshot: SimulationSnapshot
  assertions: PublicAssertionResult[]
  passed: boolean
}

const normalizedCount = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, Math.floor(value))

const connectedPath = (): AssertionDefinition => ({
  id: 'critical-path',
  label: 'Connects readers to durable post storage',
  evaluate: ({ topology }) => topology.criticalPathConnected,
})

const componentAtLeast = (
  kind: ComponentKind,
  label: string,
  minimum: number,
): AssertionDefinition => ({
  id: `component-${kind}-${minimum}`,
  label,
  evaluate: ({ topology }) => normalizedCount(topology.componentCounts[kind]) >= minimum,
})

const metricAtLeast = (
  metric: keyof SimulationSnapshot['metrics'],
  label: string,
  minimum: number,
): AssertionDefinition => ({
  id: `${metric}-minimum`,
  label,
  evaluate: ({ snapshot }) => snapshot.metrics[metric] >= minimum,
})

const metricAtMost = (
  metric: keyof SimulationSnapshot['metrics'],
  label: string,
  maximum: number,
): AssertionDefinition => ({
  id: `${metric}-maximum`,
  label,
  evaluate: ({ snapshot }) => snapshot.metrics[metric] <= maximum,
})

const caseRules: Record<string, readonly AssertionDefinition[]> = {
  'normal-feed': [
    connectedPath(),
    componentAtLeast('gateway', 'Includes a feed API boundary', 1),
    componentAtLeast('queue', 'Separates publishing from fan-out', 1),
    componentAtLeast('service', 'Includes fan-out workers', 1),
    componentAtLeast('cache', 'Includes a timeline cache', 1),
    componentAtLeast('database', 'Stores posts durably', 1),
    metricAtLeast('throughput', 'Delivers at least 450k entries/s', 450_000),
    metricAtMost('p99', 'Keeps normal freshness below 1 second', 1_000),
    metricAtMost('errorRate', 'Keeps stale timelines below 1%', 1),
  ],
  'celebrity-spike': [
    connectedPath(),
    metricAtLeast('throughput', 'Sustains at least 4M deliveries/s', 4_000_000),
    metricAtMost('p99', 'Keeps spike freshness below 5 seconds', 5_000),
    metricAtMost('errorRate', 'Keeps stale timelines below 2%', 2),
    metricAtMost('queueDepth', 'Bounds the fan-out backlog', 5_000_000),
  ],
  'worker-outage': [
    connectedPath(),
    componentAtLeast('service', 'Provides redundant worker capacity', 2),
    metricAtLeast('throughput', 'Retains at least 1M deliveries/s', 1_000_000),
    metricAtMost('p99', 'Recovers freshness within 5 seconds', 5_000),
    metricAtMost('queueDepth', 'Keeps the outage backlog bounded', 3_000_000),
  ],
  'hidden-hot-key': [
    connectedPath(),
    componentAtLeast('cache', 'Provides cache-key distribution capacity', 2),
    metricAtMost('p99', 'Bounds hot-key freshness', 5_000),
    metricAtMost('cacheMiss', 'Keeps cache churn bounded', 50),
    metricAtMost('errorRate', 'Keeps stale timelines below 2%', 2),
  ],
  'hidden-duplicate-delivery': [
    connectedPath(),
    componentAtLeast('queue', 'Keeps an explicit delivery boundary', 1),
    metricAtMost('errorRate', 'Deduplicates at-least-once delivery', 1),
    metricAtMost('p99', 'Keeps retry freshness below 3 seconds', 3_000),
  ],
}

const points = (passed: number, total: number) =>
  total === 0 ? 0 : Math.round((passed / total) * 25)

function evaluateCases(
  topology: TopologySummary,
  simulate: NonNullable<JudgeOptions['simulate']>,
): EvaluatedCase[] {
  return newsFeedChallenge.cases.map((definition) => {
    const rules = caseRules[definition.id]
    if (!rules) throw new Error(`No news-feed rules for case: ${definition.id}`)
    const snapshot = simulate({
      scenario: 'news-feed',
      loadMultiplier: definition.load,
      fault: definition.fault,
      tick: 0,
      nodeCount: topology.nodeCount,
      edgeCount: topology.edgeCount,
      componentCounts: { ...topology.componentCounts },
      replicaCounts: topology.replicaCounts ? { ...topology.replicaCounts } : undefined,
      criticalPathConnected: topology.criticalPathConnected,
    })
    const context = { topology, snapshot }
    const assertions = rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      passed: rule.evaluate(context),
    }))
    return {
      definition,
      snapshot,
      assertions,
      passed: assertions.every((assertion) => assertion.passed),
    }
  })
}

function redactCases(evaluated: readonly EvaluatedCase[]): JudgeCaseResult[] {
  let hiddenOrdinal = 0
  return evaluated.map((item): JudgeCaseResult => {
    if (item.definition.hidden) {
      hiddenOrdinal += 1
      const hidden: HiddenCaseResult = {
        visibility: 'hidden',
        ordinal: hiddenOrdinal,
        label: `Hidden case ${hiddenOrdinal}`,
        passed: item.passed,
      }
      return hidden
    }
    const result: PublicCaseResult = {
      visibility: 'public',
      caseId: item.definition.id,
      title: item.definition.title,
      description: item.definition.description,
      passed: item.passed,
      metrics: { ...item.snapshot.metrics },
      assertions: item.assertions.map((assertion) => ({ ...assertion })),
    }
    return result
  })
}

function countPassed(evaluated: readonly EvaluatedCase[], ids: readonly string[]) {
  const assertions = evaluated
    .filter((item) => ids.includes(item.definition.id))
    .flatMap((item) => item.assertions)
  return points(assertions.filter((item) => item.passed).length, assertions.length)
}

function scoreBreakdown(
  topology: TopologySummary,
  evaluated: readonly EvaluatedCase[],
): ScoreBreakdownItem[] {
  const claritySignals = [
    topology.criticalPathConnected,
    topology.nodeCount >= 6 && topology.nodeCount <= 14,
    topology.edgeCount >= 5 && topology.edgeCount <= topology.nodeCount * 2,
    ['client', 'gateway', 'service', 'queue', 'cache', 'database'].every(
      (kind) => normalizedCount(topology.componentCounts[kind as ComponentKind]) >= 1,
    ),
  ]
  return [
    {
      dimension: 'reliability',
      label: 'Reliability',
      points: countPassed(evaluated, ['normal-feed', 'worker-outage']),
      maxPoints: 25,
      summary: 'Durability, queue boundaries, and worker continuity.',
    },
    {
      dimension: 'freshness',
      label: 'Freshness',
      points: countPassed(evaluated, ['normal-feed', 'celebrity-spike']),
      maxPoints: 25,
      summary: 'Delivery throughput, backlog, and timeline staleness.',
    },
    {
      dimension: 'resilience',
      label: 'Resilience',
      points: countPassed(evaluated, ['worker-outage', 'hidden-hot-key', 'hidden-duplicate-delivery']),
      maxPoints: 25,
      summary: 'Graceful behavior under outage, hot-key, and retry pressure.',
    },
    {
      dimension: 'clarity',
      label: 'Clarity',
      points: points(claritySignals.filter(Boolean).length, claritySignals.length),
      maxPoints: 25,
      summary: 'A readable publish, fan-out, and read path.',
    },
  ]
}

export function judgeNewsFeed(
  topology: TopologySummary,
  options: JudgeOptions = {},
): JudgeReport {
  const evaluated = evaluateCases(topology, options.simulate ?? computeSimulation)
  const cases = redactCases(evaluated)
  const breakdown = scoreBreakdown(topology, evaluated)
  const score = breakdown.reduce((total, item) => total + item.points, 0)
  const passedCases = cases.filter((item) => item.passed).length
  return {
    judgeVersion: 'news-feed-v1',
    challengeId: 'news-feed',
    passed: passedCases === 5,
    score,
    maxScore: 100,
    passedCases,
    totalCases: 5,
    cases,
    scoreBreakdown: breakdown,
  }
}
