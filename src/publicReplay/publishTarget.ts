import type { ReplayAttemptV1 } from '../replay'

export function resolvePublishAttempt(
  attemptId: string,
  candidates: Array<ReplayAttemptV1 | null | undefined>,
) {
  return candidates.find((attempt) => attempt?.id === attemptId) ?? null
}

export function challengePublishAttempt(
  lastSubmittedAttempt: ReplayAttemptV1 | null,
) {
  return lastSubmittedAttempt
}

export function nextPublishRetry(action: 'publish' | 'unpublish') {
  return action === 'unpublish' ? 'unpublish' : 'publish'
}
