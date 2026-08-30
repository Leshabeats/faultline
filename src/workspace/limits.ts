export const WORKSPACE_LIMITS = {
  nodes: 200,
  edges: 400,
} as const

export const canAddWorkspaceItem = (currentCount: number, limit: number) =>
  currentCount < limit
