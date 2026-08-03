import { describe, expect, it } from 'vitest'
import { newsFeedSeedEdges, newsFeedSeedNodes } from './newsFeedSeed'

describe('news-feed seed graph', () => {
  it('uses valid node handles and keeps every edge attached', () => {
    const nodeIds = new Set(newsFeedSeedNodes.map((node) => node.id))
    for (const edge of newsFeedSeedEdges) {
      expect(nodeIds.has(edge.source)).toBe(true)
      expect(nodeIds.has(edge.target)).toBe(true)
      expect(['right', 'bottom']).toContain(edge.sourceHandle)
      expect(['left', 'top']).toContain(edge.targetHandle)
    }
  })
})
