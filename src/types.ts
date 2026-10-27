/**
 * Shared domain types for the weight tracker.
 * All weights are stored in kilograms internally.
 */

export type Unit = 'kg'

/** A single logged weight for a given day. */
export interface WeightEntry {
  /** ISO date string, YYYY-MM-DD (local calendar date, no timezone). */
  date: string
  /** Weight in kilograms. */
  weightKg: number
  /** Optional user note, e.g. "after gym". */
  note?: string
  /** Epoch ms of creation. */
  createdAt: number
  /** Epoch ms of last update. */
  updatedAt: number
}

/**
 * A named phase of training (e.g. "Bulk", "Cut", "Maintenance").
 * Phases are date ranges used to shade the chart.
 */
export interface Phase {
  id: string
  name: string
  /** ISO date YYYY-MM-DD. Inclusive start. */
  startDate: string
  /** ISO date YYYY-MM-DD. Inclusive end. null = ongoing. */
  endDate: string | null
  /** Hex colour used for the chart band. */
  color: string
  createdAt: number
}

/** User profile / preferences. */
export interface Profile {
  /** Starting weight in kg, used for total-change metrics. */
  startWeightKg: number | null
  /** Goal weight in kg, used for progress metrics. */
  goalWeightKg: number | null
  /** Height in cm, enables BMI. */
  heightCm: number | null
  unit: Unit
  /** Preferred chart window in days. */
  chartWindowDays: number
}

export interface AppState {
  entries: WeightEntry[]
  phases: Phase[]
  profile: Profile
  /** Bumped when the storage schema changes, for migrations. */
  version: number
}

export const DEFAULT_PROFILE: Profile = {
  startWeightKg: null,
  goalWeightKg: null,
  heightCm: null,
  unit: 'kg',
  chartWindowDays: 90,
}

export const STORAGE_KEY = 'weight-tracker:v1'
export const SCHEMA_VERSION = 1

export const PHASE_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]
