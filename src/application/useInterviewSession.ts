import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CapacityTuning, Locale, TimelineEvent } from '../domain/system'
import type {
  InterviewAction,
  InterviewContext,
  InterviewResponder,
} from '../interview/types'
import type { ReplayEventContentV1 } from '../replay'
import { applicationCopy, defenseCopy } from './copy'
import {
  acceptsInterviewResponse,
  beginInterviewRequest,
  synchronizeInterviewRequestScope,
  type InterviewRequestScope,
} from './interviewRequestScope'

interface UseInterviewSessionInput {
  interviewer: InterviewResponder
  locale: Locale
  context: InterviewContext
  questionRevision: string
  active: boolean
  replayActive: boolean
  capacity: CapacityTuning
  capacityMonthlyCost: number
  newsFeedMonthlyCost: number
  addEvent: (
    title: string,
    detail: string,
    tone?: TimelineEvent['tone'],
    translations?: TimelineEvent['translations'],
  ) => void
  recordAction: (event: ReplayEventContentV1) => unknown
  openInterview: () => void
}

const initialPrompt = (locale: Locale) => locale === 'ru'
  ? 'С чего начнёте проектирование сервиса коротких ссылок: с требований или с оценки нагрузки?'
  : 'Would you start the URL shortener design with requirements or a traffic estimate?'

/** Owns provider interaction, answer recording, and defense prompts. */
export function useInterviewSession({
  interviewer,
  locale,
  context,
  questionRevision,
  active,
  replayActive,
  capacity,
  capacityMonthlyCost,
  newsFeedMonthlyCost,
  addEvent,
  recordAction,
  openInterview,
}: UseInterviewSessionInput) {
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [prompt, setPrompt] = useState(() => initialPrompt(locale))
  const [busy, setBusy] = useState(false)
  const contextRef = useRef(context)
  const questionRevisionRef = useRef<string | null>(null)
  const busyTimerRef = useRef<number | null>(null)
  const requestScopeRef = useRef<InterviewRequestScope<InterviewResponder>>({
    enabled: active && !replayActive,
    provider: interviewer,
    revision: questionRevision,
    generation: 0,
  })
  contextRef.current = context

  useLayoutEffect(() => {
    const previousScope = requestScopeRef.current
    const enabled = active && !replayActive
    requestScopeRef.current = synchronizeInterviewRequestScope(previousScope, {
      enabled,
      provider: interviewer,
      revision: questionRevision,
    })
  }, [active, interviewer, questionRevision, replayActive])

  useEffect(() => () => {
    if (busyTimerRef.current !== null) window.clearTimeout(busyTimerRef.current)
  }, [])

  useEffect(() => {
    if (busyTimerRef.current !== null) window.clearTimeout(busyTimerRef.current)
    busyTimerRef.current = null
    setBusy(false)
  }, [active, interviewer, questionRevision, replayActive])

  useEffect(() => {
    if (!active || replayActive || questionRevisionRef.current === questionRevision) return
    let cancelled = false
    const scope = beginInterviewRequest(requestScopeRef.current)
    const generation = scope.generation
    requestScopeRef.current = scope
    setFeedback('')
    interviewer
      .respond({ action: 'continue', context: contextRef.current })
      .then((response) => {
        const current = requestScopeRef.current
        if (!cancelled && acceptsInterviewResponse(current, generation)) {
          questionRevisionRef.current = questionRevision
          setPrompt(response.prompt)
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, interviewer, questionRevision, replayActive])

  const runAction = useCallback(async (action: InterviewAction) => {
    if (!requestScopeRef.current.enabled) return
    const scope = beginInterviewRequest(requestScopeRef.current)
    const generation = scope.generation
    requestScopeRef.current = scope
    setBusy(true)
    try {
      const response = await interviewer.respond({
        action,
        answer: action === 'answer' ? answer : undefined,
        context: contextRef.current,
      })
      const current = requestScopeRef.current
      if (!acceptsInterviewResponse(current, generation)) return
      questionRevisionRef.current = questionRevision
      setPrompt(response.prompt)
      setFeedback(response.message)
      if (action === 'answer') {
        const copy = applicationCopy[locale]
        const detail = `${copy.focus}: ${response.focus}`
        addEvent(copy.answerReviewed, detail, 'neutral', {
          en: {
            title: applicationCopy.en.answerReviewed,
            detail: locale === 'en' ? detail : 'Interviewer feedback saved',
          },
          ru: {
            title: applicationCopy.ru.answerReviewed,
            detail: locale === 'ru' ? detail : 'Обратная связь интервьюера сохранена',
          },
        })
        recordAction({
          type: 'answer.submitted',
          source: 'interviewer',
          payload: {
            answer,
            prompt,
            feedback: response.message,
            focus: response.focus,
          },
          timeline: {
            title: copy.answerReviewed,
            detail,
            tone: 'neutral',
          },
        })
        setAnswer('')
      }
    } finally {
      const current = requestScopeRef.current
      if (!acceptsInterviewResponse(current, generation)) return
      if (busyTimerRef.current !== null) window.clearTimeout(busyTimerRef.current)
      busyTimerRef.current = window.setTimeout(() => {
        if (acceptsInterviewResponse(requestScopeRef.current, generation)) setBusy(false)
      }, 180)
    }
  }, [addEvent, answer, interviewer, locale, prompt, questionRevision, recordAction])

  const defend = useCallback(() => {
    const text = defenseCopy({
      locale,
      scenario: contextRef.current.scenario,
      capacity,
      monthlyCost: contextRef.current.scenario === 'news-feed'
        ? newsFeedMonthlyCost
        : capacityMonthlyCost,
    })
    const otherLocale = locale === 'ru' ? 'en' : 'ru'
    const translated = defenseCopy({
      locale: otherLocale,
      scenario: contextRef.current.scenario,
      capacity,
      monthlyCost: contextRef.current.scenario === 'news-feed'
        ? newsFeedMonthlyCost
        : capacityMonthlyCost,
    })
    setPrompt(text.prompt)
    setFeedback(text.feedback)
    openInterview()
    addEvent(text.eventTitle, text.eventDetail, 'neutral', {
      [locale]: { title: text.eventTitle, detail: text.eventDetail },
      [otherLocale]: { title: translated.eventTitle, detail: translated.eventDetail },
    } as NonNullable<TimelineEvent['translations']>)
  }, [addEvent, capacity, capacityMonthlyCost, locale, newsFeedMonthlyCost, openInterview])

  return {
    answer,
    setAnswer,
    feedback,
    prompt,
    busy,
    runAction,
    defend,
  }
}
