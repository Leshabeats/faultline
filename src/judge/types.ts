import type {
  ComponentKind,
  ScenarioId,
  SimulationInput,
  SimulationMetrics,
  SimulationSnapshot,
} from '../domain/system'

/**
 * The compact, UI-independent representation of the diagram that the judge
 * needs. Callers can derive it from React Flow, a saved submission, or a
 * future backend payload.
 */
export interface TopologySummary {
  componentCounts: Partial<Record<ComponentKind, number>>
  criticalPathConnected: boolean
  nodeCount: number
  edgeCount: number
}

export type SimulationRunner = (input: SimulationInput) => SimulationSnapshot

export interface PublicAssertionResult {
  id: string
  label: string
  passed: boolean
}

export interface PublicCaseResult {
  visibility: 'public'
  caseId: string
  title: string
  description: string
  passed: boolean
  metrics: SimulationMetrics
  assertions: PublicAssertionResult[]
}

/**
 * Deliberately contains no challenge id, input, metrics, or failed assertion.
 * Keeping the redaction in the type makes accidental UI disclosure harder.
 */
export interface HiddenCaseResult {
  visibility: 'hidden'
  ordinal: number
  label: string
  passed: boolean
}

export type JudgeCaseResult = PublicCaseResult | HiddenCaseResult

export type ScoreDimension =
  | 'reliability'
  | 'performance'
  | 'freshness'
  | 'resilience'
  | 'clarity'

export interface ScoreBreakdownItem {
  dimension: ScoreDimension
  label: string
  points: number
  maxPoints: 25
  summary: string
}

export interface JudgeReport {
  judgeVersion: string
  challengeId: ScenarioId
  passed: boolean
  score: number
  maxScore: 100
  passedCases: number
  totalCases: number
  cases: JudgeCaseResult[]
  scoreBreakdown: ScoreBreakdownItem[]
}

export interface JudgeOptions {
  /** Defaults to the production deterministic simulation engine. */
  simulate?: SimulationRunner
}
