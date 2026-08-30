import { describe, expect, it } from 'vitest'
import {
  acceptsInterviewResponse,
  beginInterviewRequest,
  synchronizeInterviewRequestScope,
  type InterviewRequestScope,
} from './interviewRequestScope'

describe('interview request scope', () => {
  it('rejects a delayed response after leaving and reopening Interview mode', () => {
    const provider = {}
    const initial: InterviewRequestScope<object> = {
      enabled: true,
      provider,
      revision: 'question-1',
      generation: 0,
    }
    const pending = beginInterviewRequest(initial)
    const inactive = synchronizeInterviewRequestScope(pending, {
      enabled: false,
      provider,
      revision: 'question-1',
    })
    const reopened = synchronizeInterviewRequestScope(inactive, {
      enabled: true,
      provider,
      revision: 'question-1',
    })

    expect(acceptsInterviewResponse(inactive, pending.generation)).toBe(false)
    expect(acceptsInterviewResponse(reopened, pending.generation)).toBe(false)
    const current = beginInterviewRequest(reopened)
    expect(acceptsInterviewResponse(current, current.generation)).toBe(true)
  })

  it('invalidates pending responses when provider or question changes', () => {
    const provider = {}
    const pending = beginInterviewRequest({
      enabled: true,
      provider,
      revision: 'question-1',
      generation: 0,
    })
    const changed = synchronizeInterviewRequestScope(pending, {
      enabled: true,
      provider: {},
      revision: 'question-2',
    })

    expect(acceptsInterviewResponse(changed, pending.generation)).toBe(false)
  })
})
