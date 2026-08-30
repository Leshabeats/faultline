import { validateWorkspaceDocument } from './validation'
import type { WorkspaceDocumentV1 } from './types'

export interface WorkspaceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const DEFAULT_WORKSPACE_STORAGE_KEY = 'faultline.workspace.v1'
export const MAX_WORKSPACE_STORAGE_CHARACTERS = 1_000_000

export class WorkspaceRepository {
  constructor(
    private readonly storage: WorkspaceStorage,
    private readonly key = DEFAULT_WORKSPACE_STORAGE_KEY,
  ) {}

  read(): WorkspaceDocumentV1 | null {
    try {
      const serialized = this.storage.getItem(this.key)
      if (!serialized || serialized.length > MAX_WORKSPACE_STORAGE_CHARACTERS) return null
      const value: unknown = JSON.parse(serialized)
      return validateWorkspaceDocument(value) ? value : null
    } catch {
      return null
    }
  }

  save(document: WorkspaceDocumentV1): void {
    if (!validateWorkspaceDocument(document)) throw new Error('Invalid workspace document')
    const serialized = JSON.stringify(document)
    if (serialized.length > MAX_WORKSPACE_STORAGE_CHARACTERS) throw new Error('Workspace is too large')
    this.storage.setItem(this.key, serialized)
  }
}

export function saveWorkspaceBestEffort(
  repository: Pick<WorkspaceRepository, 'save'>,
  document: WorkspaceDocumentV1,
): boolean {
  try {
    repository.save(document)
    return true
  } catch {
    return false
  }
}
