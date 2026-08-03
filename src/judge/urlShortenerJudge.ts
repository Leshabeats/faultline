import type { ChallengeCase } from '../challenges/types'
import { urlShortenerChallenge } from '../challenges/urlShortener'
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

interface AssertionDefinition {
  id: string
  label: string
  evaluate: (context: EvaluationContext) => boolean
}

interface EvaluationContext {
  topology: TopologySummary
  snapshot: SimulationSnapshot
}

interface EvaluatedCase {
  definition: ChallengeCase
  snapshot: SimulationSnapshot
  assertions: PublicAssertionResult[]
  passed: boolean
}

const caseRules: Record<string, readonly AssertionDefinition[]> = {
  'normal-read-path': [
    connectedPath(),
    requiredComponents(['client', 'gateway', 'service', 'cache', 'database']),
    metricAtLeast('throughput', 'Sustains at least 9.5k req/s', 9_500),
    metricAtMost('p99', 'Keeps p99 at or below 120 ms', 120),
    metricAtMost('errorRate', 'Keeps errors at or below 1%', 1),
  ],
  'launch-burst': [
    connectedPath(),
    metricAtLeast('throughput', 'Sustains at least 95k req/s', 95_000),
    metricAtMost('p99', 'Keeps burst p99 at or below 160 ms', 160),
    metricAtMost('errorRate', 'Keeps burst errors at or below 1%', 1),
    metricAtMost('dbCpu', 'Keeps database CPU at or below 80%', 80),
  ],
  'cache-outage': [
    connectedPath(),
    componentAtLeast('cache', 'Provides a surviving cache replica', 2),
    metricAtMost('p99', 'Keeps outage p99 at or below 750 ms', 750),
    metricAtMost('errorRate', 'Keeps outage errors at or below 10%', 10),
    metricAtMost('dbCpu', 'Keeps database CPU at or below 90%', 90),
    metricAtMost('cacheMiss', 'Keeps cache misses at or below 55%', 55),
  ],
  'hidden-partition': [
    connectedPath(),
    componentAtLeast('gateway', 'Has redundant ingress', 2),
    componentAtLeast('service', 'Has redundant service capacity', 2),
    metricAtLeast('throughput', 'Retains partial throughput', 18_000),
    metricAtMost('p99', 'Bounds partition latency', 400),
    metricAtMost('errorRate', 'Bounds partition errors', 10),
  ],
  'hidden-feedback-loop': [
    connectedPath(),
    componentAtLeast('service', 'Has redundant service capacity', 2),
    componentAtLeast('database', 'Has database read or failover capacity', 2),
    componentAtLeast('queue', 'Has an asynchronous pressure boundary', 1),
    metricAtMost('p99', 'Bounds feedback-loop latency', 400),
    metricAtMost('errorRate', 'Bounds feedback-loop errors', 8),
    metricAtMost('dbCpu', 'Keeps database CPU below saturation', 85),
  ],
}

function connectedPath(): AssertionDefinition {
  return {
    id: 'critical-path',
    label: 'Connects clients to durable storage',
    evaluate: ({ topology }) => topology.criticalPathConnected,
  }
}

function componentAtLeast(
  kind: ComponentKind,
  label: string,
  minimum: number,
): AssertionDefinition {
  return {
    id: `component-${kind}-${minimum}`,
    label,
    evaluate: ({ topology }) =>
      normalizedCount(topology.componentCounts[kind]) >= minimum,
  }
}

function requiredComponents(kinds: readonly ComponentKind[]): AssertionDefinition {
  return {
    id: 'required-components',
    label: 'Includes ingress, compute, cache, and durable storage',
    evaluate: ({ topology }) =>
      kinds.every((kind) => normalizedCount(topology.componentCounts[kind]) >= 1),
  }
}

function metricAtLeast(
  metric: keyof SimulationSnapshot['metrics'],
  label: string,
  minimum: number,
): AssertionDefinition {
  return {
    id: `${metric}-minimum`,
    label,
    evaluate: ({ snapshot }) => snapshot.metrics[metric] >= minimum,
  }
}

function metricAtMost(
  metric: keyof SimulationSnapshot['metrics'],
  label: string,
  maximum: number,
): AssertionDefinition {
  return {
    id: `${metric}-maximum`,
    label,
    evaluate: ({ snapshot }) => snapshot.metrics[metric] <= maximum,
  }
}

function normalizedCount(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function validateTopology(topology: TopologySummary) {
  if (!Number.isFinite(topology.nodeCount) || topology.nodeCount < 0) {
    throw new TypeError('Topology nodeCount must be a non-negative finite number')
  }
  if (!Number.isFinite(topology.edgeCount) || topology.edgeCount < 0) {
    throw new TypeError('Topology edgeCount must be a non-negative finite number')
  }
  for (const [kind, count] of Object.entries(topology.componentCounts)) {
    if (count !== undefined && (!Number.isFinite(count) || count < 0)) {
      throw new TypeError(
        `Topology component count for ${kind} must be a non-negative finite number`,
      )
    }
  }
  for (const [kind, count] of Object.entries(topology.replicaCounts ?? {})) {
    if (count !== undefined && (!Number.isFinite(count) || count < 0)) {
      throw new TypeError(
        `Topology replica count for ${kind} must be a non-negative finite number`,
      )
    }
  }
}

function validateChallengeSuite() {
  const publicCases = urlShortenerChallenge.cases.filter(
    (item) => !item.hidden,
  ).length
  const hiddenCases = urlShortenerChallenge.cases.filter(
    (item) => item.hidden,
  ).length
  if (publicCases !== 3 || hiddenCases !== 2) {
    throw new Error(
      'URL shortener judge requires exactly three public and two hidden cases',
    )
  }
}

function evaluateCases(
  topology: TopologySummary,
  simulate: NonNullable<JudgeOptions['simulate']>,
): EvaluatedCase[] {
  return urlShortenerChallenge.cases.map((definition) => {
    const rules = caseRules[definition.id]
    if (!rules) {
      throw new Error(`No judge rules registered for challenge case: ${definition.id}`)
    }

    const snapshot = simulate({
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

function redactCases(evaluatedCases: readonly EvaluatedCase[]): JudgeCaseResult[] {
  let hiddenOrdinal = 0

  return evaluatedCases.map((evaluated): JudgeCaseResult => {
    if (evaluated.definition.hidden) {
      hiddenOrdinal += 1
      const hidden: HiddenCaseResult = {
        visibility: 'hidden',
        ordinal: hiddenOrdinal,
        label: `Hidden case ${hiddenOrdinal}`,
        passed: evaluated.passed,
      }
      return hidden
    }

    const publicResult: PublicCaseResult = {
      visibility: 'public',
      caseId: evaluated.definition.id,
      title: evaluated.definition.title,
      description: evaluated.definition.description,
      passed: evaluated.passed,
      metrics: { ...evaluated.snapshot.metrics },
      assertions: evaluated.assertions.map((assertion) => ({ ...assertion })),
    }
    return publicResult
  })
}

function points(passed: number, total: number) {
  return total === 0 ? 0 : Math.round((passed / total) * 25)
}

function scoreBreakdown(
  topology: TopologySummary,
  evaluatedCases: readonly EvaluatedCase[],
): ScoreBreakdownItem[] {
  const byId = new Map(evaluatedCases.map((item) => [item.definition.id, item]))
  const normal = requiredCase(byId, 'normal-read-path')
  const burst = requiredCase(byId, 'launch-burst')
  const cacheOutage = requiredCase(byId, 'cache-outage')
  const partition = requiredCase(byId, 'hidden-partition')
  const feedbackLoop = requiredCase(byId, 'hidden-feedback-loop')

  const reliabilitySignals = [
    topology.criticalPathConnected,
    normalizedCount(topology.componentCounts.client) >= 1,
    normalizedCount(topology.componentCounts.gateway) >= 1,
    normalizedCount(topology.componentCounts.service) >= 1,
    normalizedCount(topology.componentCounts.database) >= 1,
    normal.passed,
    partition.passed,
  ]
  const performanceSignals = [
    ...normal.assertions.filter((item) => item.id !== 'critical-path'),
    ...burst.assertions.filter((item) => item.id !== 'critical-path'),
  ].map((item) => item.passed)
  const resilienceSignals = [cacheOutage, partition, feedbackLoop].flatMap(
    (item) => item.assertions.map((assertion) => assertion.passed),
  )

  const componentKinds = Object.values(topology.componentCounts).filter(
    (count) => normalizedCount(count) > 0,
  ).length
  const claritySignals = [
    componentKinds >= 5,
    topology.nodeCount >= 5 && topology.nodeCount <= 14,
    topology.edgeCount >= 4 && topology.edgeCount <= topology.nodeCount * 2,
    normalizedCount(topology.componentCounts.client) === 1,
    topology.criticalPathConnected,
    Object.values(topology.componentCounts).every(
      (count) => normalizedCount(count) <= 4,
    ),
  ]

  return [
    {
      dimension: 'reliability',
      label: 'Reliability',
      points: points(countTrue(reliabilitySignals), reliabilitySignals.length),
      maxPoints: 25,
      summary: 'Reachability, essential tiers, and continuity under failure.',
    },
    {
      dimension: 'performance',
      label: 'Performance',
      points: points(countTrue(performanceSignals), performanceSignals.length),
      maxPoints: 25,
      summary: 'Capacity, tail latency, error rate, and database pressure.',
    },
    {
      dimension: 'resilience',
      label: 'Resilience',
      points: points(countTrue(resilienceSignals), resilienceSignals.length),
      maxPoints: 25,
      summary: 'Graceful behavior across the public and hidden fault suite.',
    },
    {
      dimension: 'clarity',
      label: 'Clarity',
      points: points(countTrue(claritySignals), claritySignals.length),
      maxPoints: 25,
      summary: 'A readable, bounded topology with an explicit critical path.',
    },
  ]
}

function requiredCase(
  cases: ReadonlyMap<string, EvaluatedCase>,
  id: string,
): EvaluatedCase {
  const result = cases.get(id)
  if (!result) throw new Error(`Required judged case is missing: ${id}`)
  return result
}

function countTrue(values: readonly boolean[]) {
  return values.reduce((total, value) => total + Number(value), 0)
}

/**
 * Runs the complete URL-shortener suite synchronously and without side effects.
 * The fixed simulation tick is part of the judge version, so identical topology
 * summaries and simulation engines always produce byte-for-byte equal reports.
 */
export function judgeUrlShortener(
  topology: TopologySummary,
  options: JudgeOptions = {},
): JudgeReport {
  validateTopology(topology)
  validateChallengeSuite()
  const evaluatedCases = evaluateCases(
    topology,
    options.simulate ?? computeSimulation,
  )
  const cases = redactCases(evaluatedCases)
  const breakdown = scoreBreakdown(topology, evaluatedCases)
  const score = breakdown.reduce((total, item) => total + item.points, 0)
  const passedCases = cases.filter((item) => item.passed).length

  return {
    judgeVersion: 'url-shortener-v1',
    challengeId: 'url-shortener',
    passed: passedCases === 5,
    score,
    maxScore: 100,
    passedCases,
    totalCases: 5,
    cases,
    scoreBreakdown: breakdown,
  }
}
