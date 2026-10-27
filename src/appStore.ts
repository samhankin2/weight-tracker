/**
 * Application state store with change notification.
 * Wraps localStorage persistence and keeps an in-memory copy.
 */

import { loadState, saveState } from './store'
import type { AppState, Phase, Profile, WeightEntry } from './types'

type Listener = (state: AppState) => void

class Store {
  private state: AppState
  private listeners = new Set<Listener>()
  /** Coalesces rapid mutations into one notify + one persist. */
  private flushHandle: number | null = null

  constructor() {
    this.state = loadState()
  }

  get(): AppState {
    return this.state
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Apply a mutation and schedule a persist + notify. */
  private commit(next: AppState): void {
    this.state = next
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== null) return
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = null
      saveState(this.state)
      this.listeners.forEach((fn) => fn(this.state))
    }, 0)
  }

  /** Force an immediate persist + notify. */
  flush(): void {
    if (this.flushHandle !== null) {
      window.clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    saveState(this.state)
    this.listeners.forEach((fn) => fn(this.state))
  }

  // ---- Entries -------------------------------------------------------------

  /** Add or update a weight for a date. Returns the stored entry. */
  setWeight(date: string, weightKg: number, note?: string): WeightEntry {
    const now = Date.now()
    const existing = this.state.entries.find((e) => e.date === date)
    let entry: WeightEntry

    if (existing) {
      entry = {
        ...existing,
        weightKg,
        note: note?.trim() ? note.trim() : existing.note,
        updatedAt: now,
      }
      this.commit({
        ...this.state,
        entries: this.state.entries.map((e) => (e.date === date ? entry : e)),
      })
    } else {
      entry = { date, weightKg, note: note?.trim() || undefined, createdAt: now, updatedAt: now }
      this.commit({ ...this.state, entries: [...this.state.entries, entry] })
    }
    return entry
  }

  /**
   * Move an existing entry to a different date, overwriting whatever was
   * stored on the target date. Used when a weigh-in's date is edited.
   */
  moveWeight(fromDate: string, toDate: string): void {
    if (fromDate === toDate) return
    const source = this.state.entries.find((e) => e.date === fromDate)
    if (!source) return

    const now = Date.now()
    const moved: WeightEntry = { ...source, date: toDate, updatedAt: now }
    const entries = this.state.entries
      .filter((e) => e.date !== fromDate && e.date !== toDate)
      .concat(moved)

    this.commit({ ...this.state, entries })
  }

  deleteWeight(date: string): void {
    this.commit({
      ...this.state,
      entries: this.state.entries.filter((e) => e.date !== date),
    })
  }

  setNote(date: string, note: string): void {
    this.commit({
      ...this.state,
      entries: this.state.entries.map((e) =>
        e.date === date ? { ...e, note: note.trim() || undefined, updatedAt: Date.now() } : e,
      ),
    })
  }

  // ---- Phases --------------------------------------------------------------

  addPhase(phase: Omit<Phase, 'id' | 'createdAt'>): Phase {
    const created: Phase = {
      ...phase,
      id: `phase_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    }
    this.commit({ ...this.state, phases: [...this.state.phases, created] })
    return created
  }

  updatePhase(id: string, patch: Partial<Omit<Phase, 'id' | 'createdAt'>>): void {
    this.commit({
      ...this.state,
      phases: this.state.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  deletePhase(id: string): void {
    this.commit({
      ...this.state,
      phases: this.state.phases.filter((p) => p.id !== id),
    })
  }

  // ---- Profile -------------------------------------------------------------

  updateProfile(patch: Partial<Profile>): void {
    this.commit({ ...this.state, profile: { ...this.state.profile, ...patch } })
  }

  /** Replace the whole state (used by import). */
  replaceState(next: AppState): void {
    this.commit(next)
    this.flush()
  }

  /** Reset everything. */
  reset(): void {
    this.commit({ entries: [], phases: [], profile: { ...this.state.profile }, version: 1 })
  }
}

export const store = new Store()
