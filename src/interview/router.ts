import { LocalInterviewProvider } from './localProvider'
import type {
  InterviewProvider,
  InterviewRequest,
  InterviewResponse,
} from './types'

export class InterviewRouter {
  private providers = new Map<string, InterviewProvider>()

  constructor(providers: InterviewProvider[] = [new LocalInterviewProvider()]) {
    providers.forEach((provider) => this.providers.set(provider.id, provider))
  }

  register(provider: InterviewProvider) {
    this.providers.set(provider.id, provider)
    return this
  }

  async respond(
    request: InterviewRequest,
    providerId = 'local',
  ): Promise<InterviewResponse> {
    const provider = this.providers.get(providerId) ?? this.providers.get('local')
    if (!provider) throw new Error('No interview provider is registered')
    return provider.respond(request)
  }

  listProviders() {
    return [...this.providers.values()].map(({ id, label }) => ({ id, label }))
  }
}

export const interviewRouter = new InterviewRouter()
