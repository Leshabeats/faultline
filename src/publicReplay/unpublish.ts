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

export async function unpublishPublicReplay(
  client: Pick<PublicReplayClient, 'remove'>,
  capabilities: CapabilityRemover,
  capability: StoredReplayCapability,
): Promise<UnpublishReplayResult> {
  try {
    await client.remove(capability.publicId, capability.deleteToken)
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
) {
  return activeAttemptId === requestAttemptId
}
