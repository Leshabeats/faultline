import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { InterviewerPanel } from './InterviewerPanel'

describe('InterviewerPanel', () => {
  it('renders recorded event text in the active locale', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <InterviewerPanel
        open
        locale="en"
        providerLabel="Local preview"
        prompt="Prompt"
        feedback=""
        answer=""
        busy={false}
        events={[{
          id: 'prediction',
          timestamp: '00:10',
          title: 'Прогноз скачка зафиксирован',
          detail: 'Модель указывает на воркеры',
          translations: {
            en: {
              title: 'Spike prediction committed',
              detail: 'Model points to workers',
            },
            ru: {
              title: 'Прогноз скачка зафиксирован',
              detail: 'Модель указывает на воркеры',
            },
          },
          tone: 'warning',
        }]}
        onAnswerChange={noop}
        onSubmit={noop}
        onHint={noop}
        onReview={noop}
        onContinue={noop}
        onOpenCapacity={noop}
        onClose={noop}
      />,
    )

    expect(html).toContain('Spike prediction committed')
    expect(html).toContain('Model points to workers')
    expect(html).not.toContain('Прогноз скачка зафиксирован')
  })
})
