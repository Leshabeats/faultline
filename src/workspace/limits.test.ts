import { describe, expect, it } from 'vitest'
import { canAddWorkspaceItem, WORKSPACE_LIMITS } from './limits'

describe('workspace limits', () => {
  it('allows additions only while the persisted document remains within bounds', () => {
    expect(canAddWorkspaceItem(WORKSPACE_LIMITS.nodes - 1, WORKSPACE_LIMITS.nodes)).toBe(true)
    expect(canAddWorkspaceItem(WORKSPACE_LIMITS.nodes, WORKSPACE_LIMITS.nodes)).toBe(false)
    expect(canAddWorkspaceItem(WORKSPACE_LIMITS.edges - 1, WORKSPACE_LIMITS.edges)).toBe(true)
    expect(canAddWorkspaceItem(WORKSPACE_LIMITS.edges, WORKSPACE_LIMITS.edges)).toBe(false)
  })
})
