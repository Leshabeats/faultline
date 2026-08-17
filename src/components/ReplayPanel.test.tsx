import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ReplayPanel } from './ReplayPanel'

describe('public replay panel', () => {
  it('shows an unpublish failure without leaving the ready replay', () => {
    const html = renderToStaticMarkup(
      <ReplayPanel
        locale="en"
        score={82}
        passed={false}
        keyMoment="Database saturated"
        events={[]}
        cursorMs={0}
        onSeek={vi.fn()}
        onExport={vi.fn()}
        publicMode
        onDeletePublication={vi.fn()}
        deleteError="This replay cannot be deleted with the provided token."
      />,
    )
    expect(html).toContain('Public replay')
    expect(html).toContain('This replay cannot be deleted with the provided token.')
    expect(html).toContain('Unpublish replay')
  })
})
