import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'
import { seedEdges, seedNodes } from '../canvas/seed'
import { createWorkspaceDocument } from './document'
import { serializeWorkspace, workspaceMarkdown, workspaceSvg } from './export'

const document = createWorkspaceDocument({
  id: 'workspace-test',
  title: 'Payments <platform>',
  simulationProfile: 'url-shortener',
  nodes: seedNodes.map((node) => node.id === 'api'
    ? { ...node, data: { ...node.data, label: 'Payment | API\nPrimary', notes: 'Use idempotency | keys.' } }
    : node),
  edges: seedEdges,
  load: 3,
  fault: 'none',
  faultTarget: null,
  capacity: DEFAULT_CAPACITY_TUNING,
  now: '2026-08-25T12:00:00.000Z',
})

const context = {
  locale: 'en' as const,
  modelLabel: 'URL Shortener',
  metrics: { throughput: '30k', p99: '91 ms', errors: '0.4%' },
  monthlyCost: 2340,
  assumptions: ['Reference pricing, not a provider quote.'],
}

describe('workspace exports', () => {
  it('creates an architecture brief with topology, notes, and cost', () => {
    const markdown = workspaceMarkdown(document, context)

    expect(markdown).toContain('# Payments <platform>')
    expect(markdown).toContain('| Payment \\| API Primary | service | 1 | 1 | Use idempotency \\| keys. |')
    expect(markdown).toContain('Monthly infrastructure: $2,340')
    expect(markdown).toContain('Payment | API Primary → Redis')
  })

  it('escapes user content in the standalone SVG', () => {
    const svg = workspaceSvg(document, context)

    expect(svg).toContain('Payments &lt;platform&gt;')
    expect(svg).toContain('Payment | API\nPrimary')
    expect(svg).not.toContain('<platform>')
  })

  it('serializes a valid editable Faultline document', () => {
    const parsed = JSON.parse(serializeWorkspace(document))

    expect(parsed.schema).toBe('faultline.workspace')
    expect(parsed.architecture.nodes).toHaveLength(seedNodes.length)
  })
})
