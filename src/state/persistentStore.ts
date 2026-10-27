/**
 * Generic in-memory state container with coalesced persistence.
 *
 * Semantics are load-bearing and mirror the original weight store exactly:
 * - `commit` replaces the state and schedules one coalesced flush.
 * - The flush saves first, then notifies every listener.
 * - `subscribe` does not fire immediately.
 * - `flush` cancels a pending flush and saves + notifies synchronously.
 */

export interface PersistentStore<T> {
  get(): T
  subscribe(fn: (state: T) => void): () => void
  /** Apply a new state and schedule a persist + notify. */
  commit(next: T): void
  /** Force an immediate persist + notify. */
  flush(): void
}

export interface PersistentStoreConfig<T> {
  load: () => T
  save: (state: T) => boolean
}

export function createPersistentStore<T>({ load, save }: PersistentStoreConfig<T>): PersistentStore<T> {
  let state = load()
  const listeners = new Set<(state: T) => void>()
  /** Coalesces rapid mutations into one notify + one persist. */
  let flushHandle: number | null = null

  const notify = (): void => {
    listeners.forEach((fn) => fn(state))
  }

  const scheduleFlush = (): void => {
    if (flushHandle !== null) return
    flushHandle = window.setTimeout(() => {
      flushHandle = null
      save(state)
      notify()
    }, 0)
  }

  return {
    get(): T {
      return state
    },

    subscribe(fn: (state: T) => void): () => void {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },

    commit(next: T): void {
      state = next
      scheduleFlush()
    },

    flush(): void {
      if (flushHandle !== null) {
        window.clearTimeout(flushHandle)
        flushHandle = null
      }
      save(state)
      notify()
    },
  }
}
