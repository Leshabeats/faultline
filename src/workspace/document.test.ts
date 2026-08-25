import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'
import { seedEdges, seedNodes } from '../canvas/seed'
import {
  createWorkspaceDocument,
  flowEdgesFromWorkspace,
  flowNodesFromWorkspace,
  workspaceFingerprint,
} from './document'
import { validateWorkspaceDocument } from './validation'

const createDocument = () => createWorkspaceDocument({
  id: 'workspace-test',
  title: 'Payments platform',
  simulationProfile: 'url-shortener',
  nodes: seedNodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: node.id === 'api'
      ? { ...node.data, label: 'Payment Service', notes: 'Idempotent writes.' }
      : { ...node.data },
  })),
  edges: seedEdges,
  load: 3,
  fault: 'none',
  faultTarget: null,
  capacity: DEFAULT_CAPACITY_TUNING,
  now: '2026-08-25T12:00:00.000Z',
})

describe('workspace document', () => {
  it('keeps only the portable editable canvas state', () => {
    const document = createDocument()

    expect(validateWorkspaceDocument(document)).toBe(true)
    expect(document.architecture.nodes.find((node) => node.id === 'api')?.data).toEqual({
      kind: 'service',
      label: 'Payment Service',
      notes: 'Idempotent writes.',
    })
    expect(document.architecture.nodes[0]?.data).not.toHaveProperty('health')
    expect(document.architecture.edges[0]).not.toHaveProperty('data')
  })

  it('restores React Flow nodes and edges with live presentation defaults', () => {
    const document = createDocument()
    const nodes = flowNodesFromWorkspace(document.architecture.nodes, document.load)
    const edges = flowEdgesFromWorkspace(document.architecture.edges, document.load)

    expect(nodes.find((node) => node.id === 'api')?.data.notes).toBe('Idempotent writes.')
    expect(nodes[0]?.data.health).toBe('healthy')
    expect(edges[0]?.data).toMatchObject({ tone: 'healthy', intensity: 3, paused: false })
  })

  it('ignores live health changes in the persistence fingerprint', () => {
    const firstNodes = seedNodes.map((node) => ({ ...node, data: { ...node.data } }))
    const secondNodes = firstNodes.map((node) => ({
      ...node,
      data: { ...node.data, health: 'degraded' as const, detail: 'Changing tick detail' },
    }))
    const input = {
      title: 'Architecture',
      simulationProfile: 'url-shortener' as const,
      edges: seedEdges,
      load: 1 as const,
      fault: 'none' as const,
      faultTarget: null,
      capacity: DEFAULT_CAPACITY_TUNING,
    }

    expect(workspaceFingerprint({ ...input, nodes: firstNodes }))
      .toBe(workspaceFingerprint({ ...input, nodes: secondNodes }))
  })
})
