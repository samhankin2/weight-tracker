/**
 * localStorage persistence layer for the weight tracker.
 * All app state lives under a single versioned key.
 */

import {
  DEFAULT_PROFILE,
  SCHEMA_VERSION,
  STORAGE_KEY,
  type AppState,
  type Phase,
  type Profile,
  type WeightEntry,
} from './types'
import { createStorage } from './state/storage'

export function emptyState(): AppState {
  return {
    entries: [],
    phases: [],
    profile: { ...DEFAULT_PROFILE },
    version: SCHEMA_VERSION,
  }
}

/** Coerce a parsed object into a valid AppState, dropping invalid records. */
function migrate(input: unknown): AppState {
  const state = emptyState()
  if (!input || typeof input !== 'object') return state
  const source = input as Partial<AppState>

  if (Array.isArray(source.entries)) {
    state.entries = source.entries
      .filter((e): e is WeightEntry => {
        if (!e || typeof e !== 'object') return false
        const w = e as Partial<WeightEntry>
        return (
          typeof w.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(w.date) &&
          typeof w.weightKg === 'number' &&
          Number.isFinite(w.weightKg) &&
          w.weightKg > 0
        )
      })
      .map((e) => ({
        date: e.date,
        weightKg: e.weightKg,
        note: typeof e.note === 'string' && e.note ? e.note : undefined,
        createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now(),
        updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : Date.now(),
      }))
  }

  if (Array.isArray(source.phases)) {
    state.phases = source.phases
      .filter((p): p is Phase => {
        if (!p || typeof p !== 'object') return false
        const ph = p as Partial<Phase>
        return (
          typeof ph.id === 'string' &&
          typeof ph.name === 'string' &&
          typeof ph.startDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(ph.startDate)
        )
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        startDate: p.startDate,
        endDate:
          typeof p.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.endDate) ? p.endDate : null,
        color: typeof p.color === 'string' && p.color ? p.color : '#3b82f6',
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      }))
  }

  if (source.profile && typeof source.profile === 'object') {
    const p = source.profile as Partial<Profile>
    state.profile = {
      startWeightKg:
        typeof p.startWeightKg === 'number' && Number.isFinite(p.startWeightKg)
          ? p.startWeightKg
          : null,
      goalWeightKg:
        typeof p.goalWeightKg === 'number' && Number.isFinite(p.goalWeightKg)
          ? p.goalWeightKg
          : null,
      heightCm:
        typeof p.heightCm === 'number' && Number.isFinite(p.heightCm) && p.heightCm > 0
          ? p.heightCm
          : null,
      unit: 'kg',
      chartWindowDays:
        typeof p.chartWindowDays === 'number' && p.chartWindowDays > 0
          ? p.chartWindowDays
          : DEFAULT_PROFILE.chartWindowDays,
    }
  }

  state.version = SCHEMA_VERSION
  return state
}

const storage = createStorage<AppState>({
  key: STORAGE_KEY,
  version: SCHEMA_VERSION,
  empty: emptyState,
  normalise: migrate,
})

/** Read state from localStorage, migrating or repairing as needed. */
export function loadState(): AppState {
  return storage.load()
}

/** Persist state to localStorage. Returns false if storage is unavailable. */
export function saveState(state: AppState): boolean {
  return storage.save(state)
}

/** Export state as a pretty-printed JSON string for backup. */
export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

/**
 * Parse a backup file. Returns null on failure.
 *
 * A backup must look like a weight state — it has to carry an `entries` array.
 * Without that check a training backup (a different module, different shapes)
 * would be silently "repaired" into an empty weight state and overwrite the
 * user's data.
 */
export function importState(text: string): AppState | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (!Array.isArray((parsed as Partial<AppState>).entries)) return null
    return migrate(parsed)
  } catch {
    return null
  }
}
