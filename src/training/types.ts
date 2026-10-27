/**
 * Training module domain types.
 *
 * These mirror PHASE-2-DATA-MODEL.md exactly. Later units (logger, progression
 * engine, routines) extend this model; they must not reshape it. Where the UX
 * spec talks about body areas ("Chest · Barbell") the data model stores a
 * movement `category` plus `muscles`, so `Exercise.muscles` is derived from the
 * chosen category at creation time and is the field the library filters on.
 */

export type ExerciseId = string

/** How the number entered for a set should be read. */
export type LoadMode = 'total' | 'per-dumbbell' | 'added' | 'bodyweight' | 'assistance'

/** Movement pattern. The library's body-area filters read `muscles` instead. */
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'cardio' | 'mobility' | 'other'

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'band' | 'other'

export type ProgressionKind = 'reps-then-load' | 'reps-only' | 'manual'

export interface ProgressionRule {
  kind: ProgressionKind
  /** Lower bound of the working rep range. */
  repMin?: number
  /** Upper bound of the working rep range. */
  repMax?: number
  /** Load step used when the rule increases load. */
  incrementKg?: number
  /** RPE ceiling for "rep range achieved cleanly". */
  targetRpe?: number
  /** Drop the load when `repMin` is missed. */
  deloadOnMiss?: boolean
}

export interface Exercise {
  id: ExerciseId
  name: string
  category: ExerciseCategory
  equipment?: Equipment
  /** Muscle tags, e.g. `['chest', 'triceps']`. Drives weekly volume stats. */
  muscles: string[]
  /** Locked once sets have been logged for this exercise. */
  loadMode: LoadMode
  /** Default increment, normally 2.5 kg. */
  loadStepKg: number
  /**
   * Default rest after a working set, in seconds. Not in the original entity
   * sketch; added because the exercise sheet offers "Rest after set" and the
   * routine editor will seed its per-exercise rest from it.
   */
  restSec?: number
  progression: ProgressionRule
  /** Hidden from pickers; history is retained. */
  archived?: boolean
  /** Local calendar date, `YYYY-MM-DD`. */
  createdAt: string
}

export type SetType = 'warmup' | 'working' | 'drop' | 'failure'

export interface SetEntry {
  reps: number
  weightKg: number
  /** 6..10. */
  rpe?: number
  setType?: SetType
  /** False = logged but abandoned. */
  completed?: boolean
}

export interface SessionExercise {
  exerciseId: ExerciseId
  /** Survives deletion or rename of the exercise. */
  nameSnapshot: string
  /** Survives a load-mode change (the mode is locked anyway). */
  loadModeSnapshot: LoadMode
  notes?: string
  sets: SetEntry[]
}

export interface WorkoutSession {
  id: string
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string
  templateId?: string
  /** e.g. "Push A". */
  name?: string
  notes?: string
  exercises: SessionExercise[]
  /** Epoch milliseconds — used for duration. */
  startedAt?: number
  endedAt?: number
}

export interface RoutineExercise {
  exerciseId: ExerciseId
  targetSets: number
  repMin: number
  repMax: number
  restSec: number
  startLoadKg?: number
  /** Override of the exercise's step for this routine. */
  loadStepKg?: number
}

export interface RoutineTemplate {
  id: string
  name: string
  exercises: RoutineExercise[]
}

/**
 * The in-progress session. Persisted in the same payload as everything else,
 * but never counted as history until Finish moves it there.
 */
export interface WorkoutDraft {
  session: WorkoutSession
  currentExerciseIndex: number
  currentSetIndex: number
  /** Absolute epoch ms, so a suspended app survives a screen-off pause. */
  restEndsAt?: number
  restRemainingSec?: number
  restPaused: boolean
  startedAt: number
}

export interface TrainingSettings {
  defaultRestSec: number
  restTimerEnabled: boolean
}

export interface TrainingState {
  version: number
  exercises: Exercise[]
  sessions: WorkoutSession[]
  templates: RoutineTemplate[]
  activeDraft: WorkoutDraft | null
  settings: TrainingSettings
}

export const TRAINING_SCHEMA_VERSION = 1
export const TRAINING_STORAGE_KEY = 'training:v1'

/* -------------------------------------------------------------------------- */
/* Option metadata shared by the store, the sheet and the library             */
/* -------------------------------------------------------------------------- */

export const CATEGORY_OPTIONS: readonly { value: ExerciseCategory; label: string }[] = [
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'legs', label: 'Legs' },
  { value: 'core', label: 'Core' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'other', label: 'Other' },
]

export const EQUIPMENT_OPTIONS: readonly { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'band', label: 'Band' },
  { value: 'other', label: 'Other' },
]

export const LOAD_MODE_OPTIONS: readonly { value: LoadMode; label: string }[] = [
  { value: 'total', label: 'Total load' },
  { value: 'per-dumbbell', label: 'Load per dumbbell' },
  { value: 'added', label: 'Added load' },
  { value: 'bodyweight', label: 'Bodyweight only' },
  { value: 'assistance', label: 'Assistance' },
]

export const PROGRESSION_OPTIONS: readonly { value: ProgressionKind; label: string }[] = [
  { value: 'reps-then-load', label: 'Reps, then load' },
  { value: 'reps-only', label: 'Reps only' },
  { value: 'manual', label: 'Manual target' },
]

/**
 * Muscle tags implied by a movement category until the user can edit them
 * individually. The library's body-area chips filter on these tags, which is
 * why a Push exercise answers the Chest, Shoulders and Arms filters.
 */
export const MUSCLES_BY_CATEGORY: Record<ExerciseCategory, readonly string[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps'],
  legs: ['legs'],
  core: ['core'],
  cardio: [],
  mobility: [],
  other: [],
}

export function categoryLabel(value: ExerciseCategory): string {
  return CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? 'Other'
}

export function equipmentLabel(value: Equipment | undefined): string | null {
  if (!value) return null
  return EQUIPMENT_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function loadModeLabel(value: LoadMode): string {
  return LOAD_MODE_OPTIONS.find((option) => option.value === value)?.label ?? 'Total load'
}

export function progressionLabel(value: ProgressionKind): string {
  return PROGRESSION_OPTIONS.find((option) => option.value === value)?.label ?? 'Reps, then load'
}
