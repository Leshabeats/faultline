import { Braces, FileText, Image, Languages, ScanLine, Share, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Locale } from '../domain/system'
import { workspaceCopy } from '../workspace/copy'
import type { WorkspaceExportFormat } from '../workspace/types'
import { FaultlineMark } from './FaultlineMark'

interface WorkspaceTopBarProps {
  locale: Locale
  title: string
  saveStatus: 'saved' | 'saving' | 'error'
  exportOpen: boolean
  exportError?: string
  onTitleChange: (title: string) => void
  onLocaleChange: (locale: Locale) => void
  onOpenInterview: () => void
  onExportToggle: () => void
  onExport: (format: WorkspaceExportFormat) => void
}

const exportIcons = {
  png: Image,
  svg: ScanLine,
  markdown: FileText,
  json: Braces,
} as const

export function WorkspaceTopBar({
  locale,
  title,
  saveStatus,
  exportOpen,
  exportError,
  onTitleChange,
  onLocaleChange,
  onOpenInterview,
  onExportToggle,
  onExport,
}: WorkspaceTopBarProps) {
  const text = workspaceCopy[locale]
  const exportRef = useRef<HTMLDivElement>(null)
  const status = saveStatus === 'saving'
    ? text.saving
    : saveStatus === 'error'
      ? text.saveFailed
      : text.saved

  useEffect(() => {
    if (!exportOpen) return
    const close = (event: MouseEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) onExportToggle()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExportToggle()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [exportOpen, onExportToggle])

  return (
    <header className="topbar workspace-topbar">
      <FaultlineMark />
      <nav className="mode-switch" aria-label={text.modeLabel}>
        <button type="button" onClick={onOpenInterview}>{text.interview}</button>
        <button type="button" className="is-active" aria-current="page">{text.workspace}</button>
      </nav>
      <div className="workspace-document-title">
        <input
          value={title}
          maxLength={80}
          aria-label={text.titleLabel}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={() => {
            if (!title.trim()) onTitleChange(text.defaultTitle)
          }}
        />
        <span
          className={`workspace-save-status status-${saveStatus}`}
          role="status"
          aria-live="polite"
          aria-label={text.statusAnnouncement[saveStatus]}
        >
          <i aria-hidden="true" /> {status}
        </span>
      </div>
      <span className="workspace-local-note">{text.storedLocally}</span>
      <div className="topbar-actions workspace-actions">
        <button
          type="button"
          className="icon-button locale-button"
          aria-label={text.switchLocale}
          onClick={() => onLocaleChange(locale === 'ru' ? 'en' : 'ru')}
        >
          <Languages size={18} /><span>{locale.toUpperCase()}</span>
        </button>
        <div className="workspace-export-anchor" ref={exportRef}>
          <button
            type="button"
            className="workspace-export-button"
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            onClick={onExportToggle}
          >
            <Share size={17} /> {text.export}
          </button>
          {exportOpen && (
            <section className="workspace-export-menu" role="menu" aria-label={text.exportTitle}>
              <header>
                <div><strong>{text.exportTitle}</strong><span>{text.exportHelper}</span></div>
                <button type="button" onClick={onExportToggle} aria-label={text.closeExport}><X size={18} /></button>
              </header>
              <div className="workspace-export-options">
                {(['png', 'svg', 'markdown', 'json'] as const).map((format) => {
                  const Icon = exportIcons[format]
                  const copy = text.formats[format]
                  return (
                    <button type="button" role="menuitem" key={format} onClick={() => onExport(format)}>
                      <span className="workspace-export-icon"><Icon size={19} /></span>
                      <span><strong>{copy.title}</strong><small>{copy.description}</small></span>
                    </button>
                  )
                })}
              </div>
              {exportError && <p className="workspace-export-error" role="alert">{exportError}</p>}
              <p>{text.exportHint}</p>
            </section>
          )}
        </div>
      </div>
    </header>
  )
}
