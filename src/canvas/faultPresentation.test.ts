import { describe, expect, it } from 'vitest'
import { analyzeTargetedFault } from '../simulation/faultImpact'
import { newsFeedSeedEdges, newsFeedSeedNodes } from './newsFeedSeed'
import { projectFaultEdges } from './faultPresentation'

describe('fault canvas presentation', () => {
  it('restores the canonical edge label after a temporary partition label', () => {
    const partition = analyzeTargetedFault(
      newsFeedSeedNodes,
      newsFeedSeedEdges,
      { type: 'edge', id: 'feed-cache-store' },
    )
    const partitioned = projectFaultEdges({
      edges: newsFeedSeedEdges,
      nodeHealthById: new Map(),
      impact: partition,
      intensity: 10,
      paused: false,
      resolveLabel: (edge) => edge.id === 'feed-cache-store'
        ? 'Traffic stops at this boundary.'
        : edge.label,
    })
    const restored = projectFaultEdges({
      edges: partitioned,
      nodeHealthById: new Map(),
      impact: analyzeTargetedFault(newsFeedSeedNodes, newsFeedSeedEdges, null),
      intensity: 10,
      paused: false,
    })

    expect(partitioned.find(({ id }) => id === 'feed-cache-store')?.label)
      .toBe('Traffic stops at this boundary.')
    expect(restored.find(({ id }) => id === 'feed-cache-store')?.label)
      .toBe('read repair')
  })
})
