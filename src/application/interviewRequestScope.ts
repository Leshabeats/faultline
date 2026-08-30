export interface InterviewRequestScope<Provider> {
  enabled: boolean
  provider: Provider
  revision: string
  generation: number
}

export function synchronizeInterviewRequestScope<Provider>(
  scope: InterviewRequestScope<Provider>,
  input: Omit<InterviewRequestScope<Provider>, 'generation'>,
): InterviewRequestScope<Provider> {
  if (
    scope.enabled === input.enabled &&
    scope.provider === input.provider &&
    scope.revision === input.revision
  ) return scope
  return { ...input, generation: scope.generation + 1 }
}

export const beginInterviewRequest = <Provider>(
  scope: InterviewRequestScope<Provider>,
): InterviewRequestScope<Provider> => ({
  ...scope,
  generation: scope.generation + 1,
})

export const acceptsInterviewResponse = <Provider>(
  scope: InterviewRequestScope<Provider>,
  generation: number,
) => scope.enabled && scope.generation === generation
