import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPACITY_TUNING } from '../capacity/model'
import { seedEdges, seedNodes } from '../canvas/seed'
import { createWorkspaceDocument } from './document'
import { WorkspaceRepository } from './repository'

const memoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('WorkspaceRepository', () => {
  it('round-trips a validated workspace', () => {
    const repository = new WorkspaceRepository(memoryStorage())
    const document = createWorkspaceDocument({
      id: 'workspace-test',
      title: 'Payments platform',
      simulationProfile: 'url-shortener',
      nodes: seedNodes,
      edges: seedEdges,
      load: 1,
      fault: 'none',
      faultTarget: null,
      capacity: DEFAULT_CAPACITY_TUNING,
      now: '2026-08-25T12:00:00.000Z',
    })

    repository.save(document)

    expect(repository.read()).toEqual(document)
  })

  it('ignores corrupt and unsupported local data', () => {
    const storage = memoryStorage()
    storage.setItem('faultline.workspace.v1', '{broken')
    expect(new WorkspaceRepository(storage).read()).toBeNull()

    storage.setItem('faultline.workspace.v1', JSON.stringify({ schema: 'other', version: 1 }))
    expect(new WorkspaceRepository(storage).read()).toBeNull()
  })

  it('rejects a workspace with invalid capacity or dangling fault targets', () => {
    const storage = memoryStorage()
    const document = createWorkspaceDocument({
      id: 'workspace-invalid',
      title: 'Invalid workspace',
      simulationProfile: 'url-shortener',
      nodes: seedNodes,
      edges: seedEdges,
      load: 1,
      fault: 'component-outage',
      faultTarget: { type: 'node', id: 'api' },
      capacity: DEFAULT_CAPACITY_TUNING,
      now: '2026-08-25T12:00:00.000Z',
    })

    storage.setItem('faultline.workspace.v1', JSON.stringify({ ...document, capacity: {} }))
    expect(new WorkspaceRepository(storage).read()).toBeNull()

    storage.setItem('faultline.workspace.v1', JSON.stringify({
      ...document,
      faultTarget: { type: 'node', id: 'missing' },
    }))
    expect(new WorkspaceRepository(storage).read()).toBeNull()
  })
})
