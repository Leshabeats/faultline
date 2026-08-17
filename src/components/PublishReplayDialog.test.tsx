import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PublishReplayDialog } from './PublishReplayDialog'

const preview = {
  challengeId: 'url-shortener',
  nodeCount: 5,
  edgeCount: 4,
  eventCount: 3,
  durationMs: 4000,
  submitted: true,
  answersRedacted: true,
  includes: ['architecture', 'event-timeline'],
  excludes: ['interviewer-answers', 'api-keys'],
}

describe('PublishReplayDialog', () => {
  it('shows a Russian privacy preview before publish', () => {
    const html = renderToStaticMarkup(
      <PublishReplayDialog
        locale="ru"
        open
        preview={preview}
        challengeTitle="Сервис коротких ссылок"
        status="confirm"
        copied={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        onCopy={vi.fn()}
      />,
    )

    expect(html).toContain('Опубликовать повтор')
    expect(html).toContain('ответы интервьюеру')
    expect(html).toContain('итоговая архитектура')
    expect(html).not.toContain('Publish replay')
  })

  it('exposes copy and open actions after a successful publish', () => {
    const html = renderToStaticMarkup(
      <PublishReplayDialog
        locale="en"
        open
        preview={preview}
        challengeTitle="URL Shortener"
        status="ready"
        publicUrl="http://127.0.0.1:4173/#/r/AbCdEfGhIjKlMnOpQrStUv"
        copied={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        onCopy={vi.fn()}
      />,
    )

    expect(html).toContain('Copy public link')
    expect(html).toContain('#/r/AbCdEfGhIjKlMnOpQrStUv')
    expect(html).toContain('Open link')
  })
})
