/**
 * Application state store for the weight tracker.
 * Builds on the generic persistent store, adding the weight domain methods.
 */

import { loadState, saveState } from './store'
import { createPersistentStore } from './state/persistentStore'
import type { AppState, Phase, Profile, WeightEntry } from './types'

const persistent = createPersistentStore<AppState>({ load: loadState, save: saveState })

export const store = {
  get(): AppState {
    return persistent.get()
  },

  subscribe(fn: (state: AppState) => void): () => void {
    return persistent.subscribe(fn)
  },

  /** Force an immediate persist + notify. Called on pagehide/beforeunload. */
  flush(): void {
    persistent.flush()
  },

  // ---- Entries -------------------------------------------------------------

  /** Add or update a weight for a date. Returns the stored entry. */
  setWeight(date: string, weightKg: number, note?: string): WeightEntry {
    const state = persistent.get()
    const now = Date.now()
    const existing = state.entries.find((e) => e.date === date)
    let entry: WeightEntry

    if (existing) {
      entry = {
        ...existing,
        weightKg,
        note: note?.trim() ? note.trim() : existing.note,
        updatedAt: now,
      }
      persistent.commit({
        ...state,
        entries: state.entries.map((e) => (e.date === date ? entry : e)),
      })
    } else {
      entry = { date, weightKg, note: note?.trim() || undefined, createdAt: now, updatedAt: now }
      persistent.commit({ ...state, entries: [...state.entries, entry] })
    }
    return entry
  },

  /**
   * Move an existing entry to a different date, overwriting whatever was
   * stored on the target date. Used when a weigh-in's date is edited.
   */
  moveWeight(fromDate: string, toDate: string): void {
    if (fromDate === toDate) return
    const state = persistent.get()
    const source = state.entries.find((e) => e.date === fromDate)
    if (!source) return

    const now = Date.now()
    const moved: WeightEntry = { ...source, date: toDate, updatedAt: now }
    const entries = state.entries
      .filter((e) => e.date !== fromDate && e.date !== toDate)
      .concat(moved)

    persistent.commit({ ...state, entries })
  },

  deleteWeight(date: string): void {
    const state = persistent.get()
    persistent.commit({
      ...state,
      entries: state.entries.filter((e) => e.date !== date),
    })
  },

  setNote(date: string, note: string): void {
    const state = persistent.get()
    persistent.commit({
      ...state,
      entries: state.entries.map((e) =>
        e.date === date ? { ...e, note: note.trim() || undefined, updatedAt: Date.now() } : e,
      ),
    })
  },

  // ---- Phases --------------------------------------------------------------

  addPhase(phase: Omit<Phase, 'id' | 'createdAt'>): Phase {
    const state = persistent.get()
    const created: Phase = {
      ...phase,
      id: `phase_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    }
    persistent.commit({ ...state, phases: [...state.phases, created] })
    return created
  },

  updatePhase(id: string, patch: Partial<Omit<Phase, 'id' | 'createdAt'>>): void {
    const state = persistent.get()
    persistent.commit({
      ...state,
      phases: state.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  },

  deletePhase(id: string): void {
    const state = persistent.get()
    persistent.commit({
      ...state,
      phases: state.phases.filter((p) => p.id !== id),
    })
  },

  // ---- Profile -------------------------------------------------------------

  updateProfile(patch: Partial<Profile>): void {
    const state = persistent.get()
    persistent.commit({ ...state, profile: { ...state.profile, ...patch } })
  },

  /** Replace the whole state (used by import). */
  replaceState(next: AppState): void {
    persistent.commit(next)
    persistent.flush()
  },

  /**
   * Replace all weigh-ins with the given set. Used by the list importer,
   * which merges pasted entries over the existing ones.
   */
  replaceEntries(entries: { date: string; weightKg: number; note?: string }[]): void {
    const state = persistent.get()
    const now = Date.now()
    const existing = new Map(state.entries.map((e) => [e.date, e]))
    const next = entries.map((entry) => {
      const prior = existing.get(entry.date)
      return {
        date: entry.date,
        weightKg: entry.weightKg,
        note: entry.note?.trim() || undefined,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      }
    })
    persistent.commit({ ...state, entries: next })
  },

  /** Reset everything, keeping the profile. */
  reset(): void {
    const state = persistent.get()
    persistent.commit({ entries: [], phases: [], profile: { ...state.profile }, version: 1 })
  },
}
