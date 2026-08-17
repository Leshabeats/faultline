import type { StorageLike } from '../replay'
import type { StoredReplayCapability } from './types'

const SCHEMA = 'faultline.public-replay-capabilities' as const
const VERSION = 1 as const
export const DEFAULT_PUBLIC_REPLAY_CAPABILITY_KEY = 'faultline.public-replay-capabilities.v1'
const MAX_STORED = 50

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

  list(): StoredReplayCapability[] {
    const serialized = this.storage.getItem(this.key)
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
      return parsed.items.filter(isCapability).slice(0, MAX_STORED)
    } catch {
      return []
    }
  }

  getByPublicId(publicId: string) {
    return this.list().find((item) => item.publicId === publicId)
  }

  getByAttemptId(attemptId: string) {
    return this.list().find((item) => item.attemptId === attemptId)
  }

  save(capability: StoredReplayCapability) {
    const items = [
      capability,
      ...this.list().filter((item) => (
        item.publicId !== capability.publicId && item.attemptId !== capability.attemptId
      )),
    ].slice(0, MAX_STORED)
    const document: CapabilityDocument = {
      schema: SCHEMA,
      version: VERSION,
      items,
    }
    this.storage.setItem(this.key, JSON.stringify(document))
  }

  remove(publicId: string) {
    const items = this.list().filter((item) => item.publicId !== publicId)
    if (items.length === 0) {
      this.storage.removeItem(this.key)
      return
    }
    this.storage.setItem(this.key, JSON.stringify({
      schema: SCHEMA,
      version: VERSION,
      items,
    } satisfies CapabilityDocument))
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
