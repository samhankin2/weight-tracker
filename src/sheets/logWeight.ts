/**
 * The log-weight sheet. This is the app's most important interaction:
 * it must be possible to record a weight in a couple of taps with no fumbling.
 */

import { BigNumberInput, Toast, createSheet } from '../ui/components'
import { el } from '../ui/dom'
import { Icon } from '../ui/dom'
import { fmtWithDay, fromDateInputValue, toDateInputValue } from '../format'
import { today } from '../metrics'
import type { WeightEntry } from '../types'

/** Plausible bounds for a human body weight, used to reject typos. */
export const MIN_PLAUSIBLE_KG = 20
export const MAX_PLAUSIBLE_KG = 400

/**
 * Interpret a typed value that is out of range but is an obvious decimal slip.
 *
 * "745" almost certainly means "74.5" — the user typed without the decimal
 * point. We only apply this when the shifted value lands squarely in the
 * plausible range, so genuinely odd values are still rejected.
 *
 * Returns the normalised value, or null if no sensible interpretation exists.
 */
export function normalizeWeightInput(raw: number): number | null {
  if (!Number.isFinite(raw)) return null
  if (raw >= MIN_PLAUSIBLE_KG && raw <= MAX_PLAUSIBLE_KG) return raw

  // Try shifting the decimal point left by one and two places.
  for (const shift of [1, 2]) {
    const scaled = raw / 10 ** shift
    if (scaled >= MIN_PLAUSIBLE_KG && scaled <= MAX_PLAUSIBLE_KG) {
      return Math.round(scaled * 10) / 10
    }
  }
  return null
}

export interface LogWeightOptions {
  /** Date being edited. Defaults to today. */
  date?: string
  /** Existing entry when editing. */
  existing?: WeightEntry
  /**
   * Value to pre-fill when adding a new entry. Typically the most recent
   * weigh-in, so a daily log is a small adjustment rather than a full entry.
   */
  prefillKg?: number
  /**
   * Called with the saved values. `originalDate` is the date the entry was
   * stored under before editing, so the caller can move rather than duplicate.
   */
  onSave: (date: string, weightKg: number, note: string, originalDate?: string) => void
  /** Called when the user deletes an existing entry. */
  onDelete?: (date: string) => void
}

/**
 * Open the log-weight sheet.
 * Returns a handle so callers can close it programmatically.
 */
export function openLogWeightSheet(opts: LogWeightOptions): { close: () => void } {
  let date = opts.date ?? today()
  // Prefill with the last known weight so daily logging is a tweak, not a
  // full re-entry. Editing an existing entry always uses its own value.
  let weightKg = opts.existing?.weightKg ?? opts.prefillKg ?? 0
  let note = opts.existing?.note ?? ''

  const dateInput = el('input', {
    type: 'date',
    class: 'field-input',
    value: toDateInputValue(date),
    max: toDateInputValue(today()),
    'aria-label': 'Date of weigh-in',
  })

  const dateLabel = el('span', { class: 'field-label-text' }, [
    fmtWithDay(date),
  ])

  const dateRow = el('div', { class: 'log-date-row' }, [
    el('div', { class: 'log-date-info' }, [
      el('span', { class: 'field-label' }, 'Date'),
      dateLabel,
    ]),
    dateInput,
  ])

  const noteInput = el('input', {
    type: 'text',
    class: 'field-input',
    placeholder: 'Optional note (e.g. after gym)',
    value: note,
    maxlength: 120,
    'aria-label': 'Note',
  })

  const noteField = el('div', { class: 'field' }, [
    el('label', { class: 'field-label' }, 'Note'),
    noteInput,
  ])

  const weightInput = BigNumberInput({
    value: weightKg,
    unit: 'kg',
    step: 0.1,
    minValue: MIN_PLAUSIBLE_KG,
    ariaLabel: 'Weight in kg',
    autoFocus: true,
    onChange: (v) => {
      weightKg = v
    },
    onSubmit: () => save(),
  })

  const saveButton = el(
    'button',
    { type: 'button', class: 'button button--primary button--large', onclick: () => save() },
    [Icon('check', { size: 20 }), el('span', {}, 'Save')],
  )

  const actions: HTMLElement[] = []

  if (opts.existing && opts.onDelete) {
    actions.push(
      el(
        'button',
        {
          type: 'button',
          class: 'button button--ghost button--danger',
          'aria-label': 'Delete this weigh-in',
          onclick: () => {
            opts.onDelete?.(date)
            sheet.close()
          },
        },
        [Icon('trash', { size: 20 }), el('span', {}, 'Delete')],
      ),
    )
  }

  actions.push(saveButton)

  const content = el('div', { class: 'log-sheet' }, [
    el('div', { class: 'log-weight' }, [weightInput]),
    dateRow,
    noteField,
  ])

  const sheet = createSheet({
    title: opts.existing ? 'Edit weigh-in' : 'Log weight',
    subtitle: opts.existing ? fmtWithDay(date) : undefined,
    content,
    actions,
  })

  function save(): void {
    if (!Number.isFinite(weightKg)) {
      Toast.show('Enter a weight', 'error')
      return
    }

    // Recover from an obvious missing decimal point (e.g. "745" -> 74.5).
    const normalized = normalizeWeightInput(weightKg)
    if (normalized === null) {
      Toast.show(
        `Enter a weight between ${MIN_PLAUSIBLE_KG} and ${MAX_PLAUSIBLE_KG} kg`,
        'error',
      )
      return
    }
    if (normalized !== weightKg) {
      Toast.show(`Read that as ${normalized.toFixed(1)} kg`, 'info')
      weightKg = normalized
    }

    // Pass the original date so the caller can move the entry rather than
    // creating a duplicate when the date is changed while editing.
    opts.onSave(date, Math.round(weightKg * 10) / 10, note, opts.existing?.date)
    sheet.close()
  }

  dateInput.addEventListener('change', () => {
    const parsed = fromDateInputValue(dateInput.value)
    if (!parsed) {
      dateInput.value = toDateInputValue(date)
      return
    }
    date = parsed
    dateLabel.textContent = fmtWithDay(date)
    // Keep the sheet subtitle in sync with the chosen date.
    const subtitle = sheet.element.querySelector('.sheet-subtitle')
    if (subtitle) subtitle.textContent = fmtWithDay(date)
  })

  noteInput.addEventListener('input', () => {
    note = noteInput.value
  })

  sheet.open()
  return { close: sheet.close }
}
