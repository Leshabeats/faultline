import type { CapacityTuning, FaultMode, ScenarioId } from '../domain/system'
import type { SystemFlowEdge, SystemFlowNode } from '../canvas/types'

export interface ChallengeCase {
  id: string
  title: string
  description: string
  load: 1 | 3 | 10
  fault: FaultMode
  hidden?: boolean
}

export interface ChallengeDefinition {
  id: ScenarioId
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  summary: string
  requirements: string[]
  scale: string[]
  cases: ChallengeCase[]
  rubric: string[]
}

export interface ChallengePack {
  id: ScenarioId
  definition: ChallengeDefinition
  seedNodes: SystemFlowNode[]
  seedEdges: SystemFlowEdge[]
  defaults: {
    load: 1 | 3 | 10
    fault: FaultMode
    tuning: CapacityTuning
  }
  faults: FaultMode[]
  panel: 'capacity' | 'fanout'
  telemetryLabels: {
    throughput: string
    p99: string
    errorRate: string
    dbCpu: string
  }
  canvasLabel: string
}
