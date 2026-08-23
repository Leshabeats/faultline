import type { PublicReplayClient } from './client'
import type {
  PublicReplayError,
  StoredReplayCapability,
} from './types'

interface CapabilityRemover {
  remove(publicId: string): boolean
}

export type UnpublishReplayResult =
  | { ok: true; cleanupPersisted: boolean }
  | { ok: false; error: PublicReplayError }

export interface UnpublishOperation {
  attemptId: string
  controller: AbortController
}

export class UnpublishOperationGate {
  private current: UnpublishOperation | null = null

  start(attemptId: string): UnpublishOperation | null {
    if (this.current) return null
    this.current = {
      attemptId,
      controller: new AbortController(),
    }
    return this.current
  }

  cancel() {
    const operation = this.current
    this.current = null
    operation?.controller.abort()
  }

  isCurrent(operation: UnpublishOperation) {
    return this.current === operation
  }

  finish(operation: UnpublishOperation) {
    if (!this.isCurrent(operation)) return false
    this.current = null
    return true
  }
}

export async function unpublishPublicReplay(
  client: Pick<PublicReplayClient, 'remove'>,
  capabilities: CapabilityRemover,
  capability: StoredReplayCapability,
  signal?: AbortSignal,
): Promise<UnpublishReplayResult> {
  try {
    await client.remove(capability.publicId, capability.deleteToken, signal)
  } catch (caught) {
    const error = caught as PublicReplayError
    if (error?.code !== 'not-found') {
      return { ok: false, error }
    }
  }

  return {
    ok: true,
    cleanupPersisted: capabilities.remove(capability.publicId),
  }
}

export function unpublishResultTargetsActiveAttempt(
  activeAttemptId: string | undefined,
  requestAttemptId: string,
  requestIsCurrent = true,
) {
  return requestIsCurrent && activeAttemptId === requestAttemptId
}
