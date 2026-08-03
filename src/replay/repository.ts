import { createReplayEnvelope } from './recorder'
import {
  REPLAY_IMPORT_LIMITS,
  parseReplayEnvelope,
  serializeReplayEnvelope,
  validateReplayAttempt,
} from './serialization'
import type { ReplayAttemptV1, ReplayEnvelopeV1 } from './types'

const REPOSITORY_SCHEMA = 'faultline.replay-index' as const
const REPOSITORY_VERSION = 1 as const

export const DEFAULT_REPLAY_STORAGE_KEY = 'faultline.replays.v1'
export const MAX_STORED_REPLAYS = 50
export const MAX_REPLAY_STORAGE_CHARACTERS = 4_000_000

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface ReplayRepositoryDocumentV1 {
  schema: typeof REPOSITORY_SCHEMA
  version: typeof REPOSITORY_VERSION
  attempts: ReplayEnvelopeV1[]
}

export interface ReplayRepositoryReadResult {
  attempts: ReplayAttemptV1[]
  droppedEntries: number
  migrated: boolean
  warnings: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const emptyResult = (warning?: string): ReplayRepositoryReadResult => ({
  attempts: [],
  droppedEntries: 0,
  migrated: false,
  warnings: warning ? [warning] : [],
})

const parseRepositoryEntry = (
  entry: unknown,
): { attempt?: ReplayAttemptV1; migrated: boolean; warning?: string } => {
  if (validateReplayAttempt(entry)) {
    return { attempt: entry, migrated: true }
  }

  let serialized: string
  try {
    serialized = JSON.stringify(entry)
  } catch {
    return { migrated: false, warning: 'Skipped an unreadable replay.' }
  }
  if (serialized.length > REPLAY_IMPORT_LIMITS.maxSerializedCharacters) {
    return { migrated: false, warning: 'Skipped an oversized replay.' }
  }
  const parsed = parseReplayEnvelope(serialized)
  if (!parsed.ok) {
    return { migrated: false, warning: 'Skipped an invalid replay.' }
  }
  return {
    attempt: parsed.value.attempt,
    migrated: parsed.migrated,
    warning: parsed.warnings[0],
  }
}

export class ReplayAttemptRepository {
  constructor(
    private readonly storage: StorageLike,
    private readonly key = DEFAULT_REPLAY_STORAGE_KEY,
    private readonly maxAttempts = MAX_STORED_REPLAYS,
  ) {}

  readAll(): ReplayRepositoryReadResult {
    const serialized = this.storage.getItem(this.key)
    if (serialized === null) return emptyResult()
    if (serialized.length > MAX_REPLAY_STORAGE_CHARACTERS) {
      return emptyResult('Stored replay history exceeded the safe read limit.')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      return emptyResult('Stored replay history was corrupt and was ignored.')
    }

    let entries: unknown[]
    let entriesBeyondLimit = 0
    let documentMigrated = false
    if (
      isRecord(parsed) &&
      parsed.schema === REPOSITORY_SCHEMA &&
      parsed.version === REPOSITORY_VERSION &&
      Array.isArray(parsed.attempts)
    ) {
      entriesBeyondLimit = Math.max(0, parsed.attempts.length - this.maxAttempts)
      entries = parsed.attempts.slice(0, this.maxAttempts)
    } else if (Array.isArray(parsed)) {
      // Pre-v1 development builds stored a flat array of attempts/envelopes.
      entriesBeyondLimit = Math.max(0, parsed.length - this.maxAttempts)
      entries = parsed.slice(0, this.maxAttempts)
      documentMigrated = true
    } else {
      return emptyResult('Stored replay history had an unsupported format.')
    }

    const attempts: ReplayAttemptV1[] = []
    const warnings: string[] = []
    let droppedEntries = entriesBeyondLimit
    let migrated = documentMigrated

    for (const entry of entries) {
      const result = parseRepositoryEntry(entry)
      if (!result.attempt) {
        droppedEntries += 1
        if (result.warning) warnings.push(result.warning)
        continue
      }
      attempts.push(result.attempt)
      migrated ||= result.migrated
      if (result.warning) warnings.push(result.warning)
    }

    attempts.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    )
    return {
      attempts,
      droppedEntries,
      migrated,
      warnings: [...new Set(warnings)],
    }
  }

  list(): ReplayAttemptV1[] {
    return this.readAll().attempts
  }

  get(id: string): ReplayAttemptV1 | undefined {
    return this.list().find((attempt) => attempt.id === id)
  }

  save(attempt: ReplayAttemptV1): void {
    if (!validateReplayAttempt(attempt)) {
      throw new TypeError('Cannot store an invalid Faultline replay attempt.')
    }
    if (
      serializeReplayEnvelope(attempt).length >
      REPLAY_IMPORT_LIMITS.maxSerializedCharacters
    ) {
      throw new RangeError('Replay exceeds the safe per-attempt storage limit.')
    }
    const attempts = [
      attempt,
      ...this.list().filter((candidate) => candidate.id !== attempt.id),
    ]
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
      )
      .slice(0, this.maxAttempts)
    this.write(attempts)
  }

  remove(id: string): void {
    this.write(this.list().filter((attempt) => attempt.id !== id))
  }

  clear(): void {
    this.storage.removeItem(this.key)
  }

  private write(attempts: ReplayAttemptV1[]) {
    const retained = attempts.slice(0, this.maxAttempts)
    while (retained.length > 0) {
      const document: ReplayRepositoryDocumentV1 = {
        schema: REPOSITORY_SCHEMA,
        version: REPOSITORY_VERSION,
        attempts: retained.map((attempt) => createReplayEnvelope(attempt)),
      }
      const serialized = JSON.stringify(document)
      if (serialized.length <= MAX_REPLAY_STORAGE_CHARACTERS) {
        this.storage.setItem(this.key, serialized)
        return
      }
      // Prefer a smaller usable history to an oversized localStorage write.
      retained.pop()
    }

    const emptyDocument: ReplayRepositoryDocumentV1 = {
      schema: REPOSITORY_SCHEMA,
      version: REPOSITORY_VERSION,
      attempts: [],
    }
    this.storage.setItem(this.key, JSON.stringify(emptyDocument))
  }
}
