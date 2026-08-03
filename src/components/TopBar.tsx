import { ChevronDown, History, LogOut, PanelRightClose, Pause, Play, Share2 } from 'lucide-react'
import { FaultlineMark } from './FaultlineMark'

interface TopBarProps {
  elapsedSeconds: number
  playing: boolean
  onTogglePlaying: () => void
  interviewerOpen: boolean
  onToggleInterviewer: () => void
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
  elapsedSeconds,
  playing,
  onTogglePlaying,
  interviewerOpen,
  onToggleInterviewer,
  onOpenChallenge,
  onOpenHistory,
  onShare,
  replayMode = false,
  recording = false,
  replayDurationSeconds = 0,
  onExitReplay,
}: TopBarProps) {
  return (
    <header className="topbar">
      <FaultlineMark />
      <button className="document-title" type="button" onClick={onOpenChallenge}>
        URL Shortener <ChevronDown size={16} />
      </button>
      <span className="interview-timer" aria-label="Interview timer">
        {replayMode && <span className="replay-mode-label">Replay</span>}
        {recording && !replayMode && <span className="recording-mode-label"><i aria-hidden="true" /> Recording</span>}
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
          aria-label="Open attempt history"
          title="Attempt history"
          className="icon-button history-button"
          onClick={onOpenHistory}
        >
          <History size={19} />
        </button>
        <button
          type="button"
          aria-label="Share scenario"
          title="Copy scenario snapshot"
          className="icon-button desktop-only"
          onClick={onShare}
        >
          <Share2 size={19} />
        </button>
        {!replayMode && <button
          type="button"
          aria-label={interviewerOpen ? 'Hide interviewer' : 'Show interviewer'}
          className="icon-button desktop-only"
          onClick={onToggleInterviewer}
        >
          <PanelRightClose size={20} />
        </button>}
        {replayMode ? (
          <button className="pause-button replay-exit-button" type="button" aria-label="Exit replay" onClick={onExitReplay}>
            <LogOut size={17} />
            <span>Done</span>
          </button>
        ) : <button className="pause-button" type="button" aria-label={playing ? 'Pause simulation' : 'Run simulation'} onClick={onTogglePlaying}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          <span>{playing ? 'Pause' : 'Run'}</span>
        </button>}
      </div>
    </header>
  )
}
