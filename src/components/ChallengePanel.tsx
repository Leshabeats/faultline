import { useEffect, useRef, type KeyboardEvent } from 'react'
import { CheckCircle2, CircleCheck, CircleX, Lock, Play, RotateCcw, Trophy, X } from 'lucide-react'
import type { ChallengeDefinition } from '../challenges/types'
import type { JudgeReport } from '../judge'
import type { Locale } from '../domain/system'
import { localizeChallengeDefinition } from '../i18n'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ChallengePanelProps {
  challenge: ChallengeDefinition
  locale: Locale
  open: boolean
  onClose: () => void
  onRunCase: (load: 1 | 3 | 10, fault: ChallengeDefinition['cases'][number]['fault']) => void
  report: JudgeReport | null
  onSubmitDesign: () => void
}

export function ChallengePanel({
  challenge,
  locale,
  open,
  onClose,
  onRunCase,
  report,
  onSubmitDesign,
}: ChallengePanelProps) {
  const ru = locale === 'ru'
  const content = localizeChallengeDefinition(challenge, locale)
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined

    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const backdrop = panelRef.current?.parentElement
    const backgroundSiblings = backdrop?.parentElement
      ? Array.from(backdrop.parentElement.children).filter((element) => element !== backdrop)
      : []
    const previousBackgroundState = backgroundSiblings.map((element) => ({
      element,
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: element.hasAttribute('inert'),
    }))
    backgroundSiblings.forEach((element) => {
      element.setAttribute('aria-hidden', 'true')
      element.setAttribute('inert', '')
    })

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
      previousBackgroundState.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
        if (!inert) element.removeAttribute('inert')
      })
      openerRef.current?.focus()
      openerRef.current = null
    }
  }, [open])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return

    const panel = panelRef.current
    if (!panel) return

    const focusableElements = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex >= 0)

    if (focusableElements.length === 0) {
      event.preventDefault()
      panel.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement

    if (event.shiftKey && (activeElement === firstElement || !panel.contains(activeElement))) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && (activeElement === lastElement || !panel.contains(activeElement))) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  if (!open) return null

  return (
    <div className="challenge-backdrop" onMouseDown={onClose}>
      <section
        ref={panelRef}
        className="challenge-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{ru ? `${content.difficulty === 'Hard' ? 'Сложная' : 'Средняя'} задача` : `${content.difficulty} challenge`}</span>
            <h1 id="challenge-title">{content.title}</h1>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={ru ? 'Закрыть задачу' : 'Close challenge'}>
            <X size={20} />
          </button>
        </header>
        <p className="challenge-summary">{content.summary}</p>
        <div className="challenge-columns">
          <section>
            <h2>{ru ? 'Требования' : 'Requirements'}</h2>
            <ul>
              {content.requirements.map((requirement) => (
                <li key={requirement}><CheckCircle2 size={16} /> {requirement}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2>{ru ? 'Масштаб' : 'Scale'}</h2>
            <ul>
              {content.scale.map((item) => (
                <li key={item}><span className="scale-dot" /> {item}</li>
              ))}
            </ul>
          </section>
        </div>
        <section className="challenge-cases">
          <div className="challenge-section-heading">
            <h2>{ru ? 'Тестовые кейсы' : 'Test cases'}</h2>
            <span>{content.cases.filter((item) => !item.hidden).length} {ru ? 'открытых' : 'public'} · {content.cases.filter((item) => item.hidden).length} {ru ? 'скрытых' : 'hidden'}</span>
          </div>
          <ol>
            {content.cases.map((testCase, index) => {
              const result = report?.cases[index]
              return (
                <li key={testCase.id} className={testCase.hidden ? 'is-hidden' : ''}>
                  <span className="case-index">{testCase.hidden ? <Lock size={15} /> : index + 1}</span>
                  <span>
                    <strong>{testCase.title}</strong>
                    <small>{testCase.description}</small>
                  </span>
                  <span className="case-actions">
                    {result && (
                      <span className={`case-verdict ${result.passed ? 'is-passed' : 'is-failed'}`}>
                        {result.passed ? <CircleCheck size={15} /> : <CircleX size={15} />}
                        {result.passed ? ru ? 'Пройден' : 'Passed' : ru ? 'Не пройден' : 'Failed'}
                      </span>
                    )}
                    {!testCase.hidden && (
                      <button
                        type="button"
                        onClick={() => {
                          onRunCase(testCase.load, testCase.fault)
                          onClose()
                        }}
                      >
                        <Play size={15} fill="currentColor" /> {ru ? 'Запустить' : 'Run'}
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
        {report && (
          <section className="judge-report" aria-live="polite" aria-label="Submission result">
            <div className="judge-score">
              <span><Trophy size={17} /> {ru ? 'Результат' : 'Submission'}</span>
              <strong>{report.score}<small>/100</small></strong>
              <p>{ru ? `${report.passedCases} из ${report.totalCases} кейсов пройдено` : `${report.passedCases} of ${report.totalCases} cases passed`}</p>
            </div>
            <div className="judge-breakdown">
              {report.scoreBreakdown.map((item) => (
                <div key={item.dimension}>
                  <span>{item.label}</span>
                  <strong>{item.points}<small>/{item.maxPoints}</small></strong>
                </div>
              ))}
            </div>
          </section>
        )}
        <footer>
          <div>
            <span>{ru ? 'Критерии оценки' : 'Score dimensions'}</span>
            <p>{content.rubric.join(' · ')}</p>
          </div>
          <div className="challenge-footer-actions">
            <button type="button" className="secondary" onClick={onClose}>{ru ? 'Назад к схеме' : 'Back to board'}</button>
            <button type="button" onClick={onSubmitDesign}>
              {report ? ru ? 'Запустить снова' : 'Run again' : ru ? 'Отправить решение' : 'Submit design'}
              {report ? <RotateCcw size={16} /> : <Play size={16} fill="currentColor" />}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
