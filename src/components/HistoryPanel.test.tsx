import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from './HistoryPanel'

describe('HistoryPanel', () => {
  it('offers a localized publish action for a saved attempt', () => {
    const html = renderToStaticMarkup(
      <HistoryPanel
        open
        locale="ru"
        attempts={[{
          id: 'attempt-1',
          title: 'Сервис коротких ссылок',
          completedAt: '2026-08-17T10:00:00.000Z',
          durationMs: 4000,
          score: 82,
          passed: false,
          keyMoment: 'Database saturated',
        }]}
        onClose={vi.fn()}
        onReplay={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onImport={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    expect(html).toContain('Опубликовать повтор')
    expect(html).toContain('Повтор')
    expect(html).not.toContain('Publish replay')
  })
})
