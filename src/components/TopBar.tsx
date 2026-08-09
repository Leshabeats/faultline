import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Gauge, History, Languages, LogOut, PanelRightClose, Pause, Play, Share2 } from 'lucide-react'
import type { Locale, ScenarioId } from '../domain/system'
import { FaultlineMark } from './FaultlineMark'
import { UI_COPY } from '../i18n'

interface TopBarProps {
  challengeId: ScenarioId
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  challengeTitle: string
  challengeOptions: Array<{ id: ScenarioId; title: string; difficulty: string }>
  onChallengeChange: (id: ScenarioId) => void
  elapsedSeconds: number
  playing: boolean
  onTogglePlaying: () => void
  interviewerOpen: boolean
  onToggleInterviewer: () => void
  onOpenCapacity: () => void
  defenseLabel?: string
  capacityActive?: boolean
  onOpenChallenge: () => void
  onOpenHistory: () => void
  onShare: () => void
  replayMode?: boolean
  recording?: boolean
  replayDurationSeconds?: number
  onExitReplay?: () => void
}

const formatTime = (value: number) => {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function TopBar({
  challengeId,
  locale,
  onLocaleChange,
  challengeTitle,
  challengeOptions,
  onChallengeChange,
  elapsedSeconds,
  playing,
  onTogglePlaying,
  interviewerOpen,
  onToggleInterviewer,
  onOpenCapacity,
  defenseLabel = 'Bottleneck Defense',
  capacityActive = false,
  onOpenChallenge,
  onOpenHistory,
  onShare,
  replayMode = false,
  recording = false,
  replayDurationSeconds = 0,
  onExitReplay,
}: TopBarProps) {
  const [challengeMenuOpen, setChallengeMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const text = UI_COPY[locale]

  useEffect(() => {
    if (!challengeMenuOpen) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setChallengeMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [challengeMenuOpen])

  return (
    <header className="topbar">
      <FaultlineMark />
      <div className="document-menu" ref={menuRef}>
        <button
          className="document-title"
          type="button"
          onClick={() => setChallengeMenuOpen((open) => !open)}
          aria-expanded={challengeMenuOpen}
          aria-haspopup="menu"
          disabled={replayMode}
        >
          {challengeTitle} <ChevronDown size={16} />
        </button>
        {challengeMenuOpen && !replayMode && (
          <div className="challenge-menu" role="menu" aria-label="Choose a challenge">
            <span>{text.challenges}</span>
            {challengeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                className={option.id === challengeId ? 'is-selected' : ''}
                onClick={() => {
                  setChallengeMenuOpen(false)
                  if (option.id === challengeId) onOpenChallenge()
                  else onChallengeChange(option.id)
                }}
              >
                <span><strong>{option.title}</strong><small>{option.difficulty}</small></span>
                {option.id === challengeId && <Check size={16} />}
              </button>
            ))}
            <button
              type="button"
              className="challenge-brief-action"
              onClick={() => {
                setChallengeMenuOpen(false)
                onOpenChallenge()
              }}
            >
              {text.currentBrief}
            </button>
          </div>
        )}
      </div>
      <span className="interview-timer" aria-label={locale === 'ru' ? 'Таймер интервью' : 'Interview timer'}>
        {replayMode && <span className="replay-mode-label">{locale === 'ru' ? 'Повтор' : 'Replay'}</span>}
        {recording && !replayMode && <span className="recording-mode-label"><i aria-hidden="true" /> {locale === 'ru' ? 'Запись' : 'Recording'}</span>}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {formatTime(elapsedSeconds)}
        {replayMode && <span className="replay-duration">/ {formatTime(replayDurationSeconds)}</span>}
      </span>
      <div className="topbar-actions">
        <button
          type="button"
          aria-label={text.history}
          title={text.history}
          className="icon-button history-button"
          onClick={onOpenHistory}
        >
          <History size={19} />
        </button>
        <button
          type="button"
          aria-label={text.share}
          title={text.share}
          className="icon-button desktop-only"
          onClick={onShare}
        >
          <Share2 size={19} />
        </button>
        {!replayMode && <button
          type="button"
          aria-label={locale === 'ru' ? `Открыть: ${defenseLabel.toLowerCase()}` : `Open ${defenseLabel.toLowerCase()}`}
          title={defenseLabel}
          className={`icon-button desktop-only ${capacityActive ? 'is-active' : ''}`}
          onClick={onOpenCapacity}
        >
          <Gauge size={19} />
        </button>}
        {!replayMode && <button
          type="button"
          aria-label={locale === 'ru'
            ? interviewerOpen ? 'Скрыть интервьюера' : 'Показать интервьюера'
            : interviewerOpen ? 'Hide interviewer' : 'Show interviewer'}
          className="icon-button desktop-only"
          onClick={onToggleInterviewer}
        >
          <PanelRightClose size={20} />
        </button>}
        <button
          type="button"
          className="icon-button locale-button"
          aria-label={locale === 'ru' ? 'Переключить на английский' : 'Switch to Russian'}
          title={locale === 'ru' ? 'English' : 'Русский'}
          onClick={() => onLocaleChange(locale === 'ru' ? 'en' : 'ru')}
        >
          <Languages size={18} /><span>{locale.toUpperCase()}</span>
        </button>
        {replayMode ? (
          <button className="pause-button replay-exit-button" type="button" aria-label={text.done} onClick={onExitReplay}>
            <LogOut size={17} />
            <span>{text.done}</span>
          </button>
        ) : <button className="pause-button" type="button" aria-label={playing
          ? locale === 'ru' ? 'Поставить симуляцию на паузу' : 'Pause simulation'
          : locale === 'ru' ? 'Запустить симуляцию' : 'Run simulation'} onClick={onTogglePlaying}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          <span>{playing ? text.pause : text.run}</span>
        </button>}
      </div>
    </header>
  )
}
