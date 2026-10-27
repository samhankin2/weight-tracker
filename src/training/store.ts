/**
 * Training store — `training:v1`, its own schema, sibling of the weight store.
 *
 * Built on the same primitives as the weight app (`createStorage` +
 * `createPersistentStore`) with two deliberate differences:
 *
 * - A save that fails sets a visible, persistent flag. The weight app ignores
 *   the boolean; a large training payload must never vanish silently.
 * - A payload that exists but cannot be read raises `onCorrupt`, so the shell
 *   can offer the recovery banner instead of quietly starting empty.
 */

import { today } from '../metrics'
import { createPersistentStore } from '../state/persistentStore'
import { createStorage } from '../state/storage'
import {
  CATEGORY_OPTIONS,
  EQUIPMENT_OPTIONS,
  LOAD_MODE_OPTIONS,
  MUSCLES_BY_CATEGORY,
  PROGRESSION_OPTIONS,
  TRAINING_SCHEMA_VERSION,
  TRAINING_STORAGE_KEY,
  type Equipment,
  type Exercise,
  type ExerciseCategory,
  type LoadMode,
  type ProgressionRule,
  type RoutineExercise,
  type RoutineTemplate,
  type SessionExercise,
  type SetEntry,
  type SetType,
  type TrainingState,
  type WorkoutDraft,
  type WorkoutSession,
} from './types'

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export interface TrainingHealth {
  /** Stored data existed but could not be read. */
  corruptLoad: boolean
  /** The most recent write did not reach storage. */
  saveFailed: boolean
}

const health: TrainingHealth = { corruptLoad: false, saveFailed: false }

/* -------------------------------------------------------------------------- */
/* Shaping                                                                    */
/* -------------------------------------------------------------------------- */

export function emptyTrainingState(): TrainingState {
  return {
    version: TRAINING_SCHEMA_VERSION,
    exercises: [],
    sessions: [],
    templates: [],
    activeDraft: null,
    settings: { defaultRestSec: 90, restTimerEnabled: true },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function oneOf<T extends string>(options: readonly { value: T }[], value: unknown): T | null {
  if (typeof value !== 'string') return null
  return options.some((option) => option.value === value) ? (value as T) : null
}

function normaliseProgression(raw: unknown): ProgressionRule {
  const source = isRecord(raw) ? raw : {}
  const kind = oneOf(PROGRESSION_OPTIONS, source.kind) ?? 'reps-then-load'
  const repMin = finiteNumber(source.repMin)
  const repMax = finiteNumber(source.repMax)
  const incrementKg = finiteNumber(source.incrementKg)
  const targetRpe = finiteNumber(source.targetRpe)
  return {
    kind,
    ...(repMin !== null ? { repMin } : {}),
    ...(repMax !== null ? { repMax } : {}),
    ...(incrementKg !== null && incrementKg > 0 ? { incrementKg } : {}),
    ...(targetRpe !== null ? { targetRpe } : {}),
    ...(typeof source.deloadOnMiss === 'boolean' ? { deloadOnMiss: source.deloadOnMiss } : {}),
  }
}

function normaliseExercise(raw: unknown): Exercise | null {
  if (!isRecord(raw)) return null
  const id = nonEmptyString(raw.id)
  const name = nonEmptyString(raw.name)
  if (!id || !name) return null

  const category: ExerciseCategory = oneOf(CATEGORY_OPTIONS, raw.category) ?? 'other'

  const equipment: Equipment | null = oneOf(EQUIPMENT_OPTIONS, raw.equipment)
  const loadMode: LoadMode = oneOf(LOAD_MODE_OPTIONS, raw.loadMode) ?? 'total'
  const loadStepKg = finiteNumber(raw.loadStepKg)
  const restSec = finiteNumber(raw.restSec)
  const muscles = Array.isArray(raw.muscles)
    ? raw.muscles.filter((muscle): muscle is string => typeof muscle === 'string' && !!muscle)
    : [...MUSCLES_BY_CATEGORY[category]]

  return {
    id,
    name,
    category,
    ...(equipment ? { equipment } : {}),
    muscles,
    loadMode,
    loadStepKg: loadStepKg !== null && loadStepKg > 0 ? loadStepKg : 2.5,
    ...(restSec !== null && restSec >= 0 ? { restSec } : {}),
    progression: normaliseProgression(raw.progression),
    ...(raw.archived === true ? { archived: true } : {}),
    createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : today(),
  }
}

function normaliseSetType(value: unknown): SetType | undefined {
  return value === 'warmup' || value === 'working' || value === 'drop' || value === 'failure'
    ? value
    : undefined
}

function normaliseSet(raw: unknown): SetEntry | null {
  if (!isRecord(raw)) return null
  const reps = finiteNumber(raw.reps)
  const weightKg = finiteNumber(raw.weightKg)
  if (reps === null || reps < 0 || weightKg === null || weightKg < 0) return null
  const rpe = finiteNumber(raw.rpe)
  const setType = normaliseSetType(raw.setType)
  return {
    reps,
    weightKg,
    ...(rpe !== null ? { rpe } : {}),
    ...(setType ? { setType } : {}),
    ...(typeof raw.completed === 'boolean' ? { completed: raw.completed } : {}),
  }
}

function normaliseSessionExercise(raw: unknown): SessionExercise | null {
  if (!isRecord(raw)) return null
  const exerciseId = nonEmptyString(raw.exerciseId)
  const nameSnapshot = nonEmptyString(raw.nameSnapshot)
  if (!exerciseId || !nameSnapshot) return null
  const loadModeSnapshot = oneOf(LOAD_MODE_OPTIONS, raw.loadModeSnapshot) ?? 'total'
  const sets = Array.isArray(raw.sets)
    ? raw.sets.map(normaliseSet).filter((set): set is SetEntry => set !== null)
    : []
  return {
    exerciseId,
    nameSnapshot,
    loadModeSnapshot,
    ...(typeof raw.notes === 'string' && raw.notes ? { notes: raw.notes } : {}),
    sets,
  }
}

function normaliseSession(raw: unknown): WorkoutSession | null {
  if (!isRecord(raw)) return null
  const id = nonEmptyString(raw.id)
  const date = isIsoDate(raw.date) ? raw.date : null
  if (!id || !date) return null
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises
        .map(normaliseSessionExercise)
        .filter((exercise): exercise is SessionExercise => exercise !== null)
    : []
  const startedAt = finiteNumber(raw.startedAt)
  const endedAt = finiteNumber(raw.endedAt)
  return {
    id,
    date,
    ...(nonEmptyString(raw.templateId) ? { templateId: nonEmptyString(raw.templateId) as string } : {}),
    ...(nonEmptyString(raw.name) ? { name: nonEmptyString(raw.name) as string } : {}),
    ...(typeof raw.notes === 'string' && raw.notes ? { notes: raw.notes } : {}),
    exercises,
    ...(startedAt !== null ? { startedAt } : {}),
    ...(endedAt !== null ? { endedAt } : {}),
  }
}

function normaliseRoutineExercise(raw: unknown): RoutineExercise | null {
  if (!isRecord(raw)) return null
  const exerciseId = nonEmptyString(raw.exerciseId)
  const targetSets = finiteNumber(raw.targetSets)
  const repMin = finiteNumber(raw.repMin)
  const repMax = finiteNumber(raw.repMax)
  const restSec = finiteNumber(raw.restSec)
  if (!exerciseId || targetSets === null || repMin === null || repMax === null || restSec === null) {
    return null
  }
  const startLoadKg = finiteNumber(raw.startLoadKg)
  const loadStepKg = finiteNumber(raw.loadStepKg)
  return {
    exerciseId,
    targetSets,
    repMin,
    repMax,
    restSec,
    ...(startLoadKg !== null ? { startLoadKg } : {}),
    ...(loadStepKg !== null && loadStepKg > 0 ? { loadStepKg } : {}),
  }
}

function normaliseTemplate(raw: unknown): RoutineTemplate | null {
  if (!isRecord(raw)) return null
  const id = nonEmptyString(raw.id)
  const name = nonEmptyString(raw.name)
  if (!id || !name) return null
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises
        .map(normaliseRoutineExercise)
        .filter((exercise): exercise is RoutineExercise => exercise !== null)
    : []
  return { id, name, exercises }
}

function normaliseDraft(raw: unknown): WorkoutDraft | null {
  if (!isRecord(raw)) return null
  const session = normaliseSession(raw.session)
  const currentExerciseIndex = finiteNumber(raw.currentExerciseIndex)
  const currentSetIndex = finiteNumber(raw.currentSetIndex)
  const startedAt = finiteNumber(raw.startedAt)
  if (!session || currentExerciseIndex === null || currentSetIndex === null || startedAt === null) {
    return null
  }
  const restEndsAt = finiteNumber(raw.restEndsAt)
  const restRemainingSec = finiteNumber(raw.restRemainingSec)
  return {
    session,
    currentExerciseIndex,
    currentSetIndex,
    ...(restEndsAt !== null ? { restEndsAt } : {}),
    ...(restRemainingSec !== null ? { restRemainingSec } : {}),
    restPaused: raw.restPaused === true,
    startedAt,
  }
}

/** Coerce a parsed payload into a usable state, dropping invalid records. */
export function normaliseTrainingState(raw: unknown): TrainingState {
  const state = emptyTrainingState()
  if (!isRecord(raw)) return state

  if (Array.isArray(raw.exercises)) {
    state.exercises = raw.exercises
      .map(normaliseExercise)
      .filter((exercise): exercise is Exercise => exercise !== null)
  }
  if (Array.isArray(raw.sessions)) {
    state.sessions = raw.sessions
      .map(normaliseSession)
      .filter((session): session is WorkoutSession => session !== null)
  }
  if (Array.isArray(raw.templates)) {
    state.templates = raw.templates
      .map(normaliseTemplate)
      .filter((template): template is RoutineTemplate => template !== null)
  }
  state.activeDraft = normaliseDraft(raw.activeDraft)

  if (isRecord(raw.settings)) {
    const rest = finiteNumber(raw.settings.defaultRestSec)
    state.settings = {
      defaultRestSec: rest !== null && rest >= 0 && rest <= 600 ? rest : 90,
      restTimerEnabled: raw.settings.restTimerEnabled !== false,
    }
  }

  return state
}

/* -------------------------------------------------------------------------- */
/* Storage and state container                                                */
/* -------------------------------------------------------------------------- */

const storage = createStorage<TrainingState>({
  key: TRAINING_STORAGE_KEY,
  version: TRAINING_SCHEMA_VERSION,
  empty: emptyTrainingState,
  normalise: normaliseTrainingState,
  onCorrupt: () => {
    health.corruptLoad = true
  },
})

const persistent = createPersistentStore<TrainingState>({
  load: () => storage.load(),
  save: (state) => {
    const ok = storage.save(state)
    // Surfaced by the shell; never let a failed write look successful.
    health.saveFailed = !ok
    return ok
  },
})

/* -------------------------------------------------------------------------- */
/* Exercise input and domain methods                                          */
/* -------------------------------------------------------------------------- */

export interface ExerciseInput {
  name: string
  category: ExerciseCategory
  equipment?: Equipment
  loadMode: LoadMode
  loadStepKg: number
  restSec?: number
  progression: ProgressionRule
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function newExerciseId(): string {
  return `exercise_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function musclesFor(category: ExerciseCategory): string[] {
  return [...MUSCLES_BY_CATEGORY[category]]
}

function readRawPayload(): string | null {
  try {
    return localStorage.getItem(TRAINING_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Save a JSON file without touching the DOM helpers the views use. */
function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const trainingStore = {
  get(): TrainingState {
    return persistent.get()
  },

  subscribe(fn: (state: TrainingState) => void): () => void {
    return persistent.subscribe(fn)
  },

  /** Force an immediate persist + notify. */
  flush(): void {
    persistent.flush()
  },

  getHealth(): TrainingHealth {
    return health
  },

  // ---- Exercises -----------------------------------------------------------

  addExercise(input: ExerciseInput): Exercise {
    const state = persistent.get()
    const exercise: Exercise = {
      id: newExerciseId(),
      name: cleanName(input.name),
      category: input.category,
      ...(input.equipment ? { equipment: input.equipment } : {}),
      muscles: musclesFor(input.category),
      loadMode: input.loadMode,
      loadStepKg: input.loadStepKg,
      ...(typeof input.restSec === 'number' ? { restSec: input.restSec } : {}),
      progression: input.progression,
      createdAt: today(),
    }
    persistent.commit({ ...state, exercises: [...state.exercises, exercise] })
    return exercise
  },

  updateExercise(id: string, input: ExerciseInput): void {
    const state = persistent.get()
    persistent.commit({
      ...state,
      exercises: state.exercises.map((exercise) =>
        exercise.id === id
          ? {
              ...exercise,
              name: cleanName(input.name),
              category: input.category,
              equipment: input.equipment,
              muscles: musclesFor(input.category),
              loadMode: input.loadMode,
              loadStepKg: input.loadStepKg,
              restSec: input.restSec,
              progression: input.progression,
            }
          : exercise,
      ),
    })
  },

  renameExercise(id: string, name: string): void {
    const cleaned = cleanName(name)
    if (!cleaned) return
    const state = persistent.get()
    persistent.commit({
      ...state,
      exercises: state.exercises.map((exercise) =>
        exercise.id === id ? { ...exercise, name: cleaned } : exercise,
      ),
    })
  },

  archiveExercise(id: string): void {
    const state = persistent.get()
    persistent.commit({
      ...state,
      exercises: state.exercises.map((exercise) =>
        exercise.id === id ? { ...exercise, archived: true } : exercise,
      ),
    })
  },

  restoreExercise(id: string): void {
    const state = persistent.get()
    persistent.commit({
      ...state,
      exercises: state.exercises.map((exercise) => {
        if (exercise.id !== id) return exercise
        const restored: Exercise = { ...exercise }
        delete restored.archived
        return restored
      }),
    })
  },

  /**
   * True when any set has been logged for this exercise. Load mode is locked
   * from that point on, so historical comparisons stay valid.
   */
  hasLoggedSets(id: string): boolean {
    const state = persistent.get()
    const sessions = state.activeDraft
      ? [...state.sessions, state.activeDraft.session]
      : state.sessions
    return sessions.some((session) =>
      session.exercises.some((entry) => entry.exerciseId === id && entry.sets.length > 0),
    )
  },

  // ---- Recovery ------------------------------------------------------------

  /**
   * Re-read the stored payload. Returns false when it is still unreadable;
   * in that case the in-memory state (and the banner) is left untouched.
   */
  retryLoad(): boolean {
    health.corruptLoad = false
    const next = storage.load()
    if (health.corruptLoad) return false
    persistent.commit(next)
    persistent.flush()
    return true
  },

  /** Attempt the pending write again. The banner clears only on success. */
  retrySave(): void {
    persistent.flush()
  },

  /**
   * Download something the user can keep. When the stored payload could not be
   * read it is preserved verbatim alongside the current state, so nothing is
   * lost by retrying.
   */
  exportBackup(): void {
    const raw = readRawPayload()
    const payload = {
      module: 'training',
      version: TRAINING_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state: persistent.get(),
      ...(health.corruptLoad && raw ? { unreadableRaw: raw } : {}),
    }
    downloadJson(`training-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2))
  },
}

// ---- Persist pending changes before the tab goes away ----------------------

window.addEventListener('pagehide', () => trainingStore.flush())
window.addEventListener('beforeunload', () => trainingStore.flush())
