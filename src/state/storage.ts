/**
 * Key-parameterised localStorage adapter.
 *
 * Each module owns one key with its own schema version. The load path is
 * deliberately forgiving: storage can be unavailable, the JSON can be
 * hand-edited or truncated, and the app must still start with a usable state.
 */

/** State shapes persisted by this app always carry a schema version. */
export interface VersionedState {
  version: number
}

export interface StorageConfig<T extends VersionedState> {
  /** localStorage key, e.g. `weight-tracker:v1`. */
  key: string
  /** Schema version stamped onto loaded and saved payloads. */
  version: number
  /** Build a fresh, valid state. Used whenever nothing usable is stored. */
  empty: () => T
  /** Coerce a parsed object into a valid state, dropping invalid records. */
  normalise: (raw: unknown) => T
}

export interface StorageAdapter<T> {
  load(): T
  /** Persist the state. Returns false when storage is unavailable or full. */
  save(state: T): boolean
  /** Remove this module's key. */
  clear(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createStorage<T extends VersionedState>({
  key,
  version,
  empty,
  normalise,
}: StorageConfig<T>): StorageAdapter<T> {
  return {
    load(): T {
      let raw: string | null = null
      try {
        raw = localStorage.getItem(key)
      } catch {
        // localStorage unavailable (private mode / disabled) — run in-memory.
        return empty()
      }
      if (!raw) return empty()

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return empty()
      }
      if (!isRecord(parsed)) return empty()

      const state = normalise(parsed)
      state.version = version
      return state
    },

    save(state: T): boolean {
      try {
        // Force the version so a stale in-memory copy cannot persist an old one.
        localStorage.setItem(key, JSON.stringify({ ...state, version }))
        return true
      } catch {
        return false
      }
    },

    clear(): void {
      try {
        localStorage.removeItem(key)
      } catch {
        // Nothing to do — storage is unavailable, so nothing was persisted.
      }
    },
  }
}
