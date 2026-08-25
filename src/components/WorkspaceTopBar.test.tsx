import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceTopBar } from './WorkspaceTopBar'

describe('WorkspaceTopBar', () => {
  it('renders the localized workspace controls and export choices', () => {
    const html = renderToStaticMarkup(
      <WorkspaceTopBar
        locale="ru"
        title="Платёжная платформа"
        saveStatus="saved"
        exportOpen
        onTitleChange={vi.fn()}
        onLocaleChange={vi.fn()}
        onOpenInterview={vi.fn()}
        onExportToggle={vi.fn()}
        onExport={vi.fn()}
      />,
    )

    expect(html).toContain('Платёжная платформа')
    expect(html).toContain('Экспорт доски')
    expect(html).toContain('Изображение PNG')
    expect(html).toContain('Описание Markdown')
    expect(html).toContain('Изменения сохранены локально.')
    expect(html).not.toContain('Export workspace')
  })
})
