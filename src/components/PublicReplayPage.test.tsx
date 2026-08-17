import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PublicReplayState } from './PublicReplayState'

describe('public replay states', () => {
  it('renders a Russian not-found page', () => {
    const html = renderToStaticMarkup(
      <PublicReplayState
        locale="ru"
        status="error"
        error={{ code: 'not-found', message: 'missing' }}
        onRetry={vi.fn()}
      />,
    )
    expect(html).toContain('Повтор не найден')
    expect(html).toContain('уже удалён')
    expect(html).not.toContain('Replay not found')
  })

  it('keeps unsupported versions distinct from missing records', () => {
    const html = renderToStaticMarkup(
      <PublicReplayState
        locale="en"
        status="error"
        error={{ code: 'unsupported-version', message: 'v9' }}
        onRetry={vi.fn()}
      />,
    )
    expect(html).toContain('Unsupported version')
    expect(html).not.toContain('Replay not found')
  })
})
