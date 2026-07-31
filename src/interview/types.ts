import type {
  FaultMode,
  SimulationMetrics,
  TimelineEvent,
} from '../domain/system'

export type InterviewAction = 'continue' | 'hint' | 'review' | 'answer'

export interface InterviewContext {
  scenario: 'url-shortener'
  loadMultiplier: 1 | 3 | 10
  fault: FaultMode
  metrics: SimulationMetrics
  nodeLabels: string[]
  edgeCount: number
  recentEvents: TimelineEvent[]
}

export interface InterviewRequest {
  action: InterviewAction
  answer?: string
  context: InterviewContext
}

export interface InterviewResponse {
  message: string
  prompt: string
  focus: string
}

export interface InterviewProvider {
  id: string
  label: string
  respond(request: InterviewRequest): Promise<InterviewResponse>
}
