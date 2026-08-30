import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingGuide } from './OnboardingGuide'

describe('OnboardingGuide', () => {
  it('offers both product paths in Russian', () => {
    const html = renderToStaticMarkup(
      <OnboardingGuide
        locale="ru"
        open
        currentMode="interview"
        onDismiss={vi.fn()}
        onStart={vi.fn()}
      />,
    )

    expect(html).toContain('Как вы хотите его использовать?')
    expect(html).toContain('Решить задачу собеседования')
    expect(html).toContain('Разобрать свою архитектуру')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('How do you want to use it?')
  })

  it('does not render when closed', () => {
    const html = renderToStaticMarkup(
      <OnboardingGuide
        locale="en"
        open={false}
        currentMode="workspace"
        onDismiss={vi.fn()}
        onStart={vi.fn()}
      />,
    )

    expect(html).toBe('')
  })
})
