import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { seedEdges, seedNodes } from '../canvas/seed'
import { analyzeTargetedFault } from '../simulation/faultImpact'
import { BlastRadiusPanel } from './BlastRadiusPanel'
import { ComponentInspector } from './ComponentInspector'
import { ConnectionInspector } from './ConnectionInspector'

describe('Failure Director', () => {
  it('offers replica-aware node failure controls in Russian', () => {
    const api = {
      ...seedNodes.find((node) => node.id === 'api')!,
      data: {
        ...seedNodes.find((node) => node.id === 'api')!.data,
        replicas: 3,
      },
    }
    const html = renderToStaticMarkup(
      <ComponentInspector
        node={api}
        scenario="url-shortener"
        locale="ru"
        fault="none"
        faultTarget={null}
        onClose={vi.fn()}
        onFaultChange={vi.fn()}
        onTopologyChange={vi.fn()}
      />,
    )

    expect(html).toContain('Режиссёр отказов')
    expect(html).toContain('Отключить одну реплику')
    expect(html).not.toContain('Take one replica offline')
  })

  it('renders an exact partitioned connection and its recovery action', () => {
    const edge = seedEdges.find((candidate) => candidate.id === 'api-cache')!
    const html = renderToStaticMarkup(
      <ConnectionInspector
        edge={edge}
        nodes={seedNodes}
        locale="en"
        fault="network-partition"
        faultTarget={{ type: 'edge', id: edge.id }}
        onClose={vi.fn()}
        onFaultChange={vi.fn()}
      />,
    )

    expect(html).toContain('Short Link API')
    expect(html).toContain('Redis')
    expect(html).toContain('Traffic stops at this boundary.')
    expect(html).toContain('Restore connection')
  })

  it('shows the localized causal path for the active blast radius', () => {
    const impact = analyzeTargetedFault(
      seedNodes,
      seedEdges,
      { type: 'node', id: 'api' },
    )
    const html = renderToStaticMarkup(
      <BlastRadiusPanel
        impact={impact}
        nodes={seedNodes}
        locale="ru"
        readOnly={false}
        onRestore={vi.fn()}
      />,
    )

    expect(html).toContain('Радиус поражения')
    expect(html).toContain('Причинная цепочка')
    expect(html).toContain('Short Link API')
    expect(html).toContain('Primary DB')
    expect(html).toContain('6 компонентов затронуто')
    expect(html).not.toContain('Redis')
    expect(html).not.toContain('Очередь')
    expect(html).toContain('Восстановить компонент')
    expect(html).not.toContain('Blast radius')
  })

  it('uses the singular blast-radius form in English', () => {
    const analyzedImpact = analyzeTargetedFault(
      seedNodes,
      seedEdges,
      { type: 'node', id: 'database' },
    )
    const impact = {
      ...analyzedImpact,
      failedNodeIds: ['database'],
      degradedNodeIds: [],
      isolatedNodeIds: [],
      affectedNodeIds: [],
    }
    const html = renderToStaticMarkup(
      <BlastRadiusPanel
        impact={impact}
        nodes={seedNodes}
        locale="en"
        readOnly
        onRestore={vi.fn()}
      />,
    )

    expect(html).toContain('1 affected component')
    expect(html).not.toContain('1 affected components')
  })
})
