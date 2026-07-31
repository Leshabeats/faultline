import type { FaultMode } from '../domain/system'

export interface ChallengeCase {
  id: string
  title: string
  description: string
  load: 1 | 3 | 10
  fault: FaultMode
  hidden?: boolean
}

export interface ChallengeDefinition {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  summary: string
  requirements: string[]
  scale: string[]
  cases: ChallengeCase[]
  rubric: string[]
}
