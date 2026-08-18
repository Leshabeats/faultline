import type { StorageLike } from '../replay'
import type { StoredReplayCapability } from './types'

const SCHEMA = 'faultline.public-replay-capabilities' as const
const VERSION = 1 as const
export const DEFAULT_PUBLIC_REPLAY_CAPABILITY_KEY = 'faultline.public-replay-capabilities.v1'

interface CapabilityDocument {
  schema: typeof SCHEMA
  version: typeof VERSION
  items: StoredReplayCapability[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCapability = (value: unknown): value is StoredReplayCapability =>
  isRecord(value) &&
  typeof value.publicId === 'string' &&
  typeof value.attemptId === 'string' &&
  typeof value.url === 'string' &&
  typeof value.deleteToken === 'string' &&
  typeof value.publishedAt === 'string'

export class PublicReplayCapabilityStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly key = DEFAULT_PUBLIC_REPLAY_CAPABILITY_KEY,
  ) {}
  private memoryItems: StoredReplayCapability[] | null = null
  private removedPublicIds = new Set<string>()

  list(): StoredReplayCapability[] {
    return this.mergeStored(this.memoryItems ?? [])
  }

  private readStored(): StoredReplayCapability[] {
    let serialized: string | null
    try {
      serialized = this.storage.getItem(this.key)
    } catch {
      return this.memoryItems ?? []
    }
    if (!serialized) return []
    try {
      const parsed = JSON.parse(serialized) as unknown
      if (
        !isRecord(parsed) ||
        parsed.schema !== SCHEMA ||
        parsed.version !== VERSION ||
        !Array.isArray(parsed.items)
      ) {
        return []
      }
      return parsed.items.filter(isCapability)
    } catch {
      return []
    }
  }

  private mergeStored(sessionItems: StoredReplayCapability[]) {
    const merged = new Map<string, StoredReplayCapability>()
    for (const item of [...this.readStored(), ...sessionItems]) {
      if (!this.removedPublicIds.has(item.publicId)) {
        merged.set(item.publicId, item)
      }
    }
    // A public record outlives this browser entry, and its delete token cannot
    // be recovered from the API. Never truncate capabilities implicitly.
    const items = [...merged.values()]
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    this.memoryItems = items
    return items
  }

  getByPublicId(publicId: string) {
    return this.list().find((item) => item.publicId === publicId)
  }

  getByAttemptId(attemptId: string) {
    return this.list().find((item) => item.attemptId === attemptId)
  }

  save(capability: StoredReplayCapability): boolean {
    this.removedPublicIds.delete(capability.publicId)
    const items = [
      capability,
      ...this.mergeStored(this.memoryItems ?? []).filter((item) => (
        item.publicId !== capability.publicId && item.attemptId !== capability.attemptId
      )),
    ]
    this.memoryItems = items
    return this.persist(items)
  }

  remove(publicId: string): boolean {
    this.removedPublicIds.add(publicId)
    const items = this.mergeStored(this.memoryItems ?? [])
    this.memoryItems = items
    if (items.length === 0) {
      try {
        this.storage.removeItem(this.key)
        return true
      } catch {
        return false
      }
    }
    return this.persist(items)
  }

  private persist(items: StoredReplayCapability[]): boolean {
    try {
      this.storage.setItem(this.key, JSON.stringify({
        schema: SCHEMA,
        version: VERSION,
        items,
      } satisfies CapabilityDocument))
      return true
    } catch {
      return false
    }
  }
}

export const createPublicReplayCapabilityStore = () => {
  try {
    return new PublicReplayCapabilityStore(window.localStorage)
  } catch {
    const values = new Map<string, string>()
    return new PublicReplayCapabilityStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
      removeItem: (key) => { values.delete(key) },
    })
  }
}
