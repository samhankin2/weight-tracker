/**
 * New / edit exercise sheet.
 *
 * The sheet owns its own validation, because a duplicate name or an impossible
 * rep range must be explained beside the field rather than in a toast. Errors
 * use `aria-invalid` + `aria-describedby`, matching the pattern already used by
 * the weight app's settings fields.
 */

import {
  CATEGORY_OPTIONS,
  EQUIPMENT_OPTIONS,
  LOAD_MODE_OPTIONS,
  PROGRESSION_OPTIONS,
  type Equipment,
  type Exercise,
  type ExerciseCategory,
  type LoadMode,
  type ProgressionKind,
  type ProgressionRule,
} from './types'
import type { ExerciseInput } from './store'
import { createSheet } from '../ui/components'
import { el } from '../ui/dom'

let nextFieldId = 0

const DEFAULT_REP_MIN = 8
const DEFAULT_REP_MAX = 12
const DEFAULT_REST_SEC = 90
const DEFAULT_LOAD_STEP_KG = 2.5

export interface ExerciseSheetOptions {
  /** Present when editing an existing exercise. */
  exercise?: Exercise
  /** Prefilled name, e.g. from `Create "Foo"` in an empty search. */
  prefillName?: string
  /** Names of all other exercises, for duplicate detection. */
  otherNames: readonly string[]
  /** Load mode must not change once sets exist for this exercise. */
  loadModeLocked: boolean
  onSave: (input: ExerciseInput) => void
  onArchive?: () => void
  onRestore?: () => void
  onClose: () => void
}

interface FieldError {
  field: HTMLInputElement | HTMLSelectElement
  error: HTMLElement
}

export function openExerciseSheet(options: ExerciseSheetOptions): void {
  const { exercise } = options
  const id = ++nextFieldId
  const fieldId = (name: string): string => `exercise-${id}-${name}`

  const errors: FieldError[] = []

  // ---- Name ---------------------------------------------------------------

  const nameId = fieldId('name')
  const nameErrorId = fieldId('name-error')
  const nameInput = el('input', {
    class: 'field-input',
    id: nameId,
    type: 'text',
    value: exercise?.name ?? options.prefillName ?? '',
    autocomplete: 'off',
    'aria-required': 'true',
    'data-focus-key': 'exercise-name',
    'data-autofocus': 'true',
  })
  const nameError = el('p', { class: 'field-error', id: nameErrorId, hidden: true })
  errors.push({ field: nameInput, error: nameError })
  nameInput.addEventListener('input', () => clearError(nameInput, nameError))

  // ---- Category -----------------------------------------------------------

  const categorySelect = createSelect(
    fieldId('category'),
    CATEGORY_OPTIONS,
    exercise?.category ?? 'other',
  )

  // ---- Equipment ----------------------------------------------------------

  const equipmentSelect = createSelect(
    fieldId('equipment'),
    [{ value: '' as const, label: 'Not specified' }, ...EQUIPMENT_OPTIONS],
    exercise?.equipment ?? '',
  )

  // ---- Load entry ---------------------------------------------------------

  const loadModeSelect = createSelect(
    fieldId('load-mode'),
    LOAD_MODE_OPTIONS,
    exercise?.loadMode ?? 'total',
    options.loadModeLocked,
  )
  if (options.loadModeLocked) {
    loadModeSelect.setAttribute('aria-describedby', fieldId('load-mode-locked'))
  }
  const loadModeLockedHint = options.loadModeLocked
    ? el(
        'p',
        { class: 'field-hint', id: fieldId('load-mode-locked') },
        "Load entry can't change after sets have been logged. Create a new exercise to track it differently.",
      )
    : null

  // ---- Load step ----------------------------------------------------------

  const loadStepId = fieldId('load-step')
  const loadStepErrorId = fieldId('load-step-error')
  const loadStepInput = el('input', {
    class: 'field-input',
    id: loadStepId,
    type: 'number',
    inputmode: 'decimal',
    min: '0.25',
    max: '25',
    step: '0.25',
    value: String(exercise?.loadStepKg ?? DEFAULT_LOAD_STEP_KG),
  })
  const loadStepError = el('p', { class: 'field-error', id: loadStepErrorId, hidden: true })
  errors.push({ field: loadStepInput, error: loadStepError })
  loadStepInput.addEventListener('input', () => clearError(loadStepInput, loadStepError))

  // ---- Progression --------------------------------------------------------

  const progressionSelect = createSelect(
    fieldId('progression'),
    PROGRESSION_OPTIONS,
    exercise?.progression.kind ?? 'reps-then-load',
  )
  const progressionHintId = fieldId('progression-hint')
  const progressionHint = el(
    'p',
    { class: 'field-hint', id: progressionHintId },
    'Increase reps within the range. When every set reaches the top of the range, increase the load next time.',
  )
  const syncProgressionHint = (): void => {
    const usesDefault = progressionSelect.value === 'reps-then-load'
    progressionHint.hidden = !usesDefault
    if (usesDefault) progressionSelect.setAttribute('aria-describedby', progressionHintId)
    else progressionSelect.removeAttribute('aria-describedby')
  }
  progressionSelect.addEventListener('change', syncProgressionHint)
  syncProgressionHint()

  // ---- Target rep range ---------------------------------------------------

  const repMinId = fieldId('rep-min')
  const repMaxId = fieldId('rep-max')
  const repErrorId = fieldId('rep-error')
  const repMinInput = el('input', {
    class: 'field-input',
    id: repMinId,
    type: 'number',
    inputmode: 'numeric',
    min: '1',
    max: '100',
    step: '1',
    value: String(exercise?.progression.repMin ?? DEFAULT_REP_MIN),
    'aria-label': 'Minimum reps',
  })
  const repMaxInput = el('input', {
    class: 'field-input',
    id: repMaxId,
    type: 'number',
    inputmode: 'numeric',
    min: '1',
    max: '100',
    step: '1',
    value: String(exercise?.progression.repMax ?? DEFAULT_REP_MAX),
    'aria-label': 'Maximum reps',
  })
  const repError = el('p', { class: 'field-error', id: repErrorId, hidden: true })
  errors.push({ field: repMinInput, error: repError })
  repMinInput.addEventListener('input', () => clearError(repMinInput, repError, repMaxInput))
  repMaxInput.addEventListener('input', () => clearError(repMinInput, repError, repMaxInput))

  // ---- Rest ---------------------------------------------------------------

  const restId = fieldId('rest')
  const restErrorId = fieldId('rest-error')
  const restInput = el('input', {
    class: 'field-input',
    id: restId,
    type: 'number',
    inputmode: 'numeric',
    min: '0',
    max: '600',
    step: '15',
    value: String(exercise?.restSec ?? DEFAULT_REST_SEC),
  })
  const restError = el('p', { class: 'field-error', id: restErrorId, hidden: true })
  errors.push({ field: restInput, error: restError })
  restInput.addEventListener('input', () => clearError(restInput, restError))

  // ---- Layout -------------------------------------------------------------

  const fieldBlock = (
    label: string,
    forId: string,
    control: HTMLElement,
    extra?: HTMLElement | null,
  ): HTMLElement =>
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: forId }, label),
      control,
      extra ?? null,
    ])

  const loadStepRow = el('div', { class: 'field-with-unit' }, [
    loadStepInput,
    el('span', { class: 'field-unit' }, 'kg'),
  ])
  const restRow = el('div', { class: 'field-with-unit' }, [
    restInput,
    el('span', { class: 'field-unit' }, 'seconds'),
  ])

  const content = el('div', { class: 'exercise-form' }, [
    fieldBlock('Exercise name', nameId, nameInput, nameError),
    fieldBlock('Category', categorySelect.id, categorySelect, null),
    fieldBlock('Equipment', equipmentSelect.id, equipmentSelect, null),
    fieldBlock('Load entry', loadModeSelect.id, loadModeSelect, loadModeLockedHint),
    fieldBlock('Default load step', loadStepId, loadStepRow, loadStepError),
    fieldBlock('Progression', progressionSelect.id, progressionSelect, progressionHint),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label' }, 'Target rep range'),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [
          el('label', { class: 'field-label', for: repMinId }, 'Minimum'),
          repMinInput,
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field-label', for: repMaxId }, 'Maximum'),
          repMaxInput,
        ]),
      ]),
      repError,
    ]),
    fieldBlock('Rest after set', restId, restRow, restError),
    exercise && options.onRestore
      ? el(
          'button',
          {
            class: 'button button--secondary exercise-form__secondary',
            type: 'button',
            'data-focus-key': 'exercise-restore',
            onClick: () => {
              options.onRestore?.()
              sheet.close()
            },
          },
          'Restore exercise',
        )
      : null,
    exercise && options.onArchive && !exercise.archived
      ? el(
          'button',
          {
            class: 'button button--secondary exercise-form__secondary',
            type: 'button',
            'data-focus-key': 'exercise-archive',
            onClick: () => {
              options.onArchive?.()
              sheet.close()
            },
          },
          'Archive exercise',
        )
      : null,
  ])

  const cancelButton = el(
    'button',
    { class: 'button button--secondary', type: 'button', onClick: () => sheet.close() },
    'Cancel',
  )
  const saveButton = el(
    'button',
    { class: 'button button--primary', type: 'button', onClick: () => submit() },
    'Save exercise',
  )

  const sheet = createSheet({
    title: exercise ? 'Edit exercise' : 'New exercise',
    content,
    actions: [cancelButton, saveButton],
    onClose: options.onClose,
  })

  // ---- Submit -------------------------------------------------------------

  function submit(): void {
    errors.forEach(({ field, error }) => clearError(field, error))
    clearError(repMinInput, repError, repMaxInput)

    const name = nameInput.value.trim().replace(/\s+/g, ' ')
    if (!name) {
      fail(nameInput, nameError, 'Enter an exercise name.')
      return
    }
    const duplicate = options.otherNames.some(
      (other) => other.trim().replace(/\s+/g, ' ').toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      fail(nameInput, nameError, 'An exercise with this name already exists.')
      return
    }

    const repMin = Number(repMinInput.value)
    const repMax = Number(repMaxInput.value)
    if (
      !Number.isInteger(repMin) ||
      !Number.isInteger(repMax) ||
      repMin < 1 ||
      repMax > 100 ||
      repMin > repMax
    ) {
      fail(repMinInput, repError, 'Enter a rep range between 1 and 100.')
      return
    }

    const loadStep = Number(loadStepInput.value)
    if (!Number.isFinite(loadStep) || loadStep < 0.25 || loadStep > 25) {
      fail(loadStepInput, loadStepError, 'Enter a load step between 0.25 and 25 kg.')
      return
    }

    const rest = Number(restInput.value)
    if (!Number.isInteger(rest) || rest < 0 || rest > 600) {
      fail(restInput, restError, 'Enter a rest time between 0 and 600 seconds.')
      return
    }

    const kind = progressionSelect.value as ProgressionKind
    const progression: ProgressionRule = {
      kind,
      repMin,
      repMax,
      incrementKg: loadStep,
    }

    const equipment = equipmentSelect.value as Equipment | ''
    options.onSave({
      name,
      category: categorySelect.value as ExerciseCategory,
      ...(equipment ? { equipment } : {}),
      loadMode: loadModeSelect.value as LoadMode,
      loadStepKg: loadStep,
      restSec: rest,
      progression,
    })
    sheet.close()
  }

  sheet.open()
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function createSelect<T extends string>(
  id: string,
  options: readonly { value: T; label: string }[],
  value: T | '',
  disabled = false,
): HTMLSelectElement {
  return el(
    'select',
    { class: 'field-input', id, ...(disabled ? { disabled: true } : {}) },
    options.map((option) =>
      el(
        'option',
        { value: option.value, ...(option.value === value ? { selected: true } : {}) },
        option.label,
      ),
    ),
  )
}

function fail(field: HTMLElement, error: HTMLElement, message: string): void {
  error.textContent = message
  error.hidden = false
  field.setAttribute('aria-invalid', 'true')
  field.setAttribute('aria-describedby', error.id)
  field.focus()
}

function clearError(
  field: HTMLElement,
  error: HTMLElement,
  also?: HTMLElement,
): void {
  error.hidden = true
  error.textContent = ''
  ;[field, also].forEach((target) => {
    if (!target) return
    target.removeAttribute('aria-invalid')
    if (target.getAttribute('aria-describedby') === error.id) {
      target.removeAttribute('aria-describedby')
    }
  })
}
