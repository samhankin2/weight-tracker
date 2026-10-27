/**
 * Phase sheet — create or edit a named training phase (e.g. "Bulk", "Cut").
 * Phases shade the chart so noisy periods are visually distinct.
 */

import { PHASE_COLORS, type Phase } from '../types'
import { createSheet } from '../ui/components'
import { el, Icon } from '../ui/dom'
import { fmtRange, fromDateInputValue, toDateInputValue } from '../format'
import { today } from '../metrics'

export interface PhaseSheetOptions {
  /** Existing phase to edit. Omit to create a new one. */
  phase?: Phase
  /** Next available colour index for new phases. */
  colorIndex?: number
  onSave: (data: { name: string; startDate: string; endDate: string | null; color: string }) => void
  onDelete?: (id: string) => void
}

export function openPhaseSheet(opts: PhaseSheetOptions): { close: () => void } {
  let name = opts.phase?.name ?? ''
  let startDate = opts.phase?.startDate ?? today()
  let endDate: string | null = opts.phase?.endDate ?? null
  let color = opts.phase?.color ?? PHASE_COLORS[(opts.colorIndex ?? 0) % PHASE_COLORS.length]
  let ongoing = opts.phase ? opts.phase.endDate === null : true

  const nameInput = el('input', {
    type: 'text',
    class: 'field-input',
    placeholder: 'e.g. Bulk',
    value: name,
    maxlength: 40,
    'aria-label': 'Phase name',
  })

  const startInput = el('input', {
    type: 'date',
    class: 'field-input',
    value: toDateInputValue(startDate),
    'aria-label': 'Phase start date',
  })

  const endInput = el('input', {
    type: 'date',
    class: 'field-input',
    value: endDate ? toDateInputValue(endDate) : '',
    'aria-label': 'Phase end date',
    disabled: ongoing,
  })

  const ongoingCheckbox = el('input', {
    type: 'checkbox',
    class: 'checkbox-input',
    checked: ongoing,
  }) as HTMLInputElement

  const endField = el('div', { class: 'field field--inline' }, [
    el('label', { class: 'field-label' }, 'End date'),
    endInput,
  ])

  const ongoingField = el('label', { class: 'checkbox-row' }, [
    ongoingCheckbox,
    el('span', { class: 'checkbox-text' }, 'Still ongoing'),
  ])

  // Colour swatch picker
  const swatches = PHASE_COLORS.map((c) => {
    const swatch = el('button', {
      type: 'button',
      class: 'color-swatch',
      style: { backgroundColor: c },
      'aria-label': `Colour ${c}`,
      'aria-pressed': c === color ? 'true' : 'false',
      onclick: () => {
        color = c
        swatches.forEach((s) =>
          s.setAttribute('aria-pressed', s.style.backgroundColor === c ? 'true' : 'false'),
        )
      },
    })
    return swatch
  })

  const colorPicker = el('div', { class: 'color-picker', role: 'group', 'aria-label': 'Phase colour' }, [
    ...swatches,
  ])

  const content = el('div', { class: 'phase-sheet' }, [
    el('div', { class: 'field' }, [el('label', { class: 'field-label' }, 'Name'), nameInput]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label' }, 'Start date'),
      startInput,
    ]),
    endField,
    ongoingField,
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label' }, 'Colour'),
      colorPicker,
    ]),
  ])

  const actions: HTMLElement[] = []

  if (opts.phase && opts.onDelete) {
    actions.push(
      el(
        'button',
        {
          type: 'button',
          class: 'button button--ghost button--danger',
          onclick: () => {
            opts.onDelete?.(opts.phase!.id)
            sheet.close()
          },
        },
        [Icon('trash', { size: 20 }), el('span', {}, 'Delete')],
      ),
    )
  }

  actions.push(
    el(
      'button',
      { type: 'button', class: 'button button--primary button--large', onclick: () => save() },
      [Icon('check', { size: 20 }), el('span', {}, opts.phase ? 'Save changes' : 'Add phase')],
    ),
  )

  const sheet = createSheet({
    title: opts.phase ? 'Edit phase' : 'New phase',
    subtitle: opts.phase ? fmtRange(opts.phase.startDate, opts.phase.endDate) : undefined,
    content,
    actions,
  })

  function save(): void {
    const trimmed = name.trim()
    if (!trimmed) {
      nameInput.focus()
      nameInput.setAttribute('aria-invalid', 'true')
      return
    }
    const start = fromDateInputValue(startInput.value) ?? startDate
    let end: string | null = null
    if (!ongoing) {
      const parsed = fromDateInputValue(endInput.value)
      if (!parsed) {
        endInput.setAttribute('aria-invalid', 'true')
        endInput.focus()
        return
      }
      if (parsed < start) {
        endInput.setAttribute('aria-invalid', 'true')
        return
      }
      end = parsed
    }
    opts.onSave({ name: trimmed, startDate: start, endDate: end, color })
    sheet.close()
  }

  startInput.addEventListener('change', () => {
    const parsed = fromDateInputValue(startInput.value)
    if (parsed) {
      startDate = parsed
      if (endDate && endDate < startDate) {
        endDate = null
        endInput.value = ''
        ongoing = true
        ongoingCheckbox.checked = true
        endInput.disabled = true
      }
    }
  })

  endInput.addEventListener('change', () => {
    const parsed = fromDateInputValue(endInput.value)
    if (parsed) endDate = parsed
  })

  ongoingCheckbox.addEventListener('change', () => {
    ongoing = ongoingCheckbox.checked
    endInput.disabled = ongoing
    if (ongoing) {
      endDate = null
      endInput.value = ''
    } else if (!endDate) {
      // Default the end date to the start date so the field is never blank.
      endDate = startDate
      endInput.value = toDateInputValue(startDate)
    }
  })

  nameInput.addEventListener('input', () => {
    name = nameInput.value
    nameInput.removeAttribute('aria-invalid')
  })

  sheet.open()
  return { close: sheet.close }
}
