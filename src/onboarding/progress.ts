import type { AppMode } from '../workspace/types'

export const ONBOARDING_STORAGE_KEY = 'faultline.onboarding.v1'

interface OnboardingProgressV1 {
  version: 1
  completed: true
  mode: AppMode
}

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

export function hasCompletedOnboarding(storage: StorageReader) {
  try {
    const value = storage.getItem(ONBOARDING_STORAGE_KEY)
    if (!value) return false
    const parsed = JSON.parse(value) as Partial<OnboardingProgressV1>
    return parsed.version === 1
      && parsed.completed === true
      && (parsed.mode === 'interview' || parsed.mode === 'workspace')
  } catch {
    return false
  }
}

export function completeOnboarding(storage: StorageWriter, mode: AppMode) {
  const progress: OnboardingProgressV1 = {
    version: 1,
    completed: true,
    mode,
  }
  storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(progress))
}
