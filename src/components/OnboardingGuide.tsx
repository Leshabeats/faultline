import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Network, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Locale } from '../domain/system'
import { onboardingCopy } from '../onboarding/copy'
import type { AppMode } from '../workspace/types'

interface OnboardingGuideProps {
  locale: Locale
  open: boolean
  currentMode: AppMode
  onDismiss: () => void
  onStart: (mode: AppMode) => void
}

const pathIcons = {
  interview: ClipboardCheck,
  workspace: Network,
} as const

export function OnboardingGuide({
  locale,
  open,
  currentMode,
  onDismiss,
  onStart,
}: OnboardingGuideProps) {
  const [step, setStep] = useState(0)
  const [selectedMode, setSelectedMode] = useState<AppMode>(currentMode)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const text = onboardingCopy[locale]
  const path = text.paths[selectedMode]

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismissRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-detail"
      >
        <header className="onboarding-header">
          <div>
            <span>{text.progress(step + 1)}</span>
            <div className="onboarding-progress" aria-hidden="true">
              {[0, 1, 2].map((item) => <i key={item} className={item <= step ? 'is-active' : ''} />)}
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onDismiss} aria-label={text.close}>
            <X size={18} />
          </button>
        </header>

        {step === 0 ? (
          <div className="onboarding-intro">
            <span className="onboarding-eyebrow"><Sparkles size={15} /> {text.introEyebrow}</span>
            <h2 id="onboarding-title">{text.introTitle}</h2>
            <p id="onboarding-detail">{text.introDetail}</p>
            <div className="onboarding-paths" aria-label={text.choosePath}>
              {(['interview', 'workspace'] as const).map((mode) => {
                const Icon = pathIcons[mode]
                const option = text.paths[mode]
                const selected = selectedMode === mode
                return (
                  <button
                    type="button"
                    key={mode}
                    className={selected ? 'is-selected' : ''}
                    aria-pressed={selected}
                    onClick={() => setSelectedMode(mode)}
                  >
                    <span className="onboarding-path-icon"><Icon size={20} /></span>
                    <span><small>{option.eyebrow}</small><strong>{option.title}</strong><em>{option.summary}</em></span>
                    {selected && <span className="onboarding-selected"><Check size={14} /> {text.selected}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ) : step === 1 ? (
          <div className="onboarding-steps">
            <span className="onboarding-eyebrow">{path.eyebrow}</span>
            <h2 id="onboarding-title">{path.stepsTitle}</h2>
            <p id="onboarding-detail">{path.summary}</p>
            <ol>
              {path.steps.map((item, index) => (
                <li key={item.title}>
                  <span>{index + 1}</span>
                  <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="onboarding-ready">
            <span className="onboarding-ready-icon"><Check size={28} /></span>
            <span className="onboarding-eyebrow">{path.eyebrow}</span>
            <h2 id="onboarding-title">{path.finishTitle}</h2>
            <p id="onboarding-detail">{path.finishDetail}</p>
          </div>
        )}

        <footer className="onboarding-footer">
          <button type="button" className="onboarding-skip" onClick={onDismiss}>{text.skip}</button>
          <div>
            {step > 0 && (
              <button type="button" className="onboarding-back" onClick={() => setStep((value) => value - 1)}>
                <ArrowLeft size={16} /> {text.back}
              </button>
            )}
            {step < 2 ? (
              <button type="button" className="onboarding-primary" onClick={() => setStep((value) => value + 1)}>
                {text.next} <ArrowRight size={16} />
              </button>
            ) : (
              <button type="button" className="onboarding-primary" onClick={() => onStart(selectedMode)}>
                {path.start} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
