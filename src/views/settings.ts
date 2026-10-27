/**
 * Settings view: profile (start/goal weight, height), data export/import, reset.
 */

import { exportState, importState } from '../store'
import { fmtKg, sortEntries } from '../metrics'
import { fmtMedium } from '../format'
import type { AppState } from '../types'
import { confirm, createSheet, Toast } from '../ui/components'
import { el, Icon } from '../ui/dom'

export interface SettingsCallbacks {
  onUpdateProfile: (patch: { startWeightKg?: number | null; goalWeightKg?: number | null; heightCm?: number | null }) => void
  onReplaceState: (state: AppState) => void
  onReset: () => void
  onManagePhases: () => void
  /** Open the paste-a-list importer. */
  onImportList: () => void
}

export function renderSettings(state: AppState, cb: SettingsCallbacks): HTMLElement {
  const p = state.profile
  const sorted = sortEntries(state.entries)

  const startInput = el('input', {
    type: 'number',
    class: 'field-input',
    inputmode: 'decimal',
    step: '0.1',
    min: '20',
    max: '400',
    placeholder: 'e.g. 80.0',
    value: p.startWeightKg !== null ? String(p.startWeightKg) : '',
    'aria-label': 'Starting weight in kilograms',
    'data-focus-key': 'profile-start-weight',
  })

  const goalInput = el('input', {
    type: 'number',
    class: 'field-input',
    inputmode: 'decimal',
    step: '0.1',
    min: '20',
    max: '400',
    placeholder: 'e.g. 75.0',
    value: p.goalWeightKg !== null ? String(p.goalWeightKg) : '',
    'aria-label': 'Goal weight in kilograms',
    'data-focus-key': 'profile-goal-weight',
  })

  const heightInput = el('input', {
    type: 'number',
    class: 'field-input',
    inputmode: 'numeric',
    step: '1',
    min: '80',
    max: '260',
    placeholder: 'e.g. 180',
    value: p.heightCm !== null ? String(p.heightCm) : '',
    'aria-label': 'Height in centimetres',
    'data-focus-key': 'profile-height',
  })

  /**
   * Parse a numeric profile field. Returns null for blank input, and rejects
   * values outside a plausible range instead of silently storing nonsense.
   */
  const parseNum = (v: string, min: number, max: number): number | null => {
    const raw = v.trim()
    if (raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    if (n < min || n > max) return null
    return n
  }

  const commitNumber = (
    input: HTMLInputElement,
    patch: { startWeightKg?: number | null; goalWeightKg?: number | null; heightCm?: number | null },
    min: number,
    max: number,
    label: string,
  ): void => {
    const raw = input.value.trim()
    if (raw === '') {
      input.removeAttribute('aria-invalid')
      cb.onUpdateProfile(patch)
      return
    }
    const parsed = parseNum(raw, min, max)
    if (parsed === null) {
      input.setAttribute('aria-invalid', 'true')
      Toast.show(`${label} must be between ${min} and ${max}`, 'error')
      // Restore the last valid value.
      input.value = ''
      cb.onUpdateProfile(patch)
      return
    }
    input.removeAttribute('aria-invalid')
    cb.onUpdateProfile(patch)
  }

  startInput.addEventListener('change', () =>
    commitNumber(
      startInput,
      { startWeightKg: parseNum(startInput.value, 20, 400) },
      20,
      400,
      'Starting weight',
    ),
  )
  goalInput.addEventListener('change', () =>
    commitNumber(
      goalInput,
      { goalWeightKg: parseNum(goalInput.value, 20, 400) },
      20,
      400,
      'Goal weight',
    ),
  )
  heightInput.addEventListener('change', () =>
    commitNumber(
      heightInput,
      { heightCm: parseNum(heightInput.value, 80, 260) },
      80,
      260,
      'Height',
    ),
  )

  const profileCard = el('section', { class: 'card', 'aria-label': 'Profile' }, [
    el('h2', { class: 'card-title' }, [Icon('ruler', { size: 18 }), el('span', {}, 'Profile')]),
    el('p', { class: 'card-hint' }, 'Optional. Used for progress and BMI.'),
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label' }, 'Starting weight'),
      el('div', { class: 'field-with-unit' }, [startInput, el('span', { class: 'field-unit' }, 'kg')]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label' }, 'Goal weight'),
      el('div', { class: 'field-with-unit' }, [goalInput, el('span', { class: 'field-unit' }, 'kg')]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label' }, 'Height'),
      el('div', { class: 'field-with-unit' }, [heightInput, el('span', { class: 'field-unit' }, 'cm')]),
    ]),
  ])

  // ---- Data -------------------------------------------------------------
  const exportButton = el(
    'button',
    { type: 'button', class: 'button button--secondary', 'data-focus-key': 'settings-export', onclick: () => doExport() },
    [Icon('download', { size: 18 }), el('span', {}, 'Export data')],
  )

  const importButton = el(
    'button',
    { type: 'button', class: 'button button--secondary', 'data-focus-key': 'settings-import', onclick: () => doImport() },
    [Icon('upload', { size: 18 }), el('span', {}, 'Import data')],
  )

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    onchange: () => {
      const file = (fileInput as HTMLInputElement).files?.[0]
      if (file) handleImportFile(file)
      ;(fileInput as HTMLInputElement).value = ''
    },
  })

  const dataCard = el('section', { class: 'card', 'aria-label': 'Data' }, [
    el('h2', { class: 'card-title' }, [Icon('download', { size: 18 }), el('span', {}, 'Your data')]),
    el('p', { class: 'card-hint' }, [
      'Everything is stored on this device only. Export a backup to move it or keep a copy. ',
      el('br'),
      `${state.entries.length} weigh-in${state.entries.length === 1 ? '' : 's'}, ${state.phases.length} phase${state.phases.length === 1 ? '' : 's'}.`,
    ]),
    el('div', { class: 'button-row' }, [exportButton, importButton]),
    fileInput,
  ])

  // ---- Import a list ----------------------------------------------------
  const listImportButton = el(
    'button',
    {
      type: 'button',
      class: 'button button--secondary',
      'data-focus-key': 'settings-import-list',
      onclick: cb.onImportList,
    },
    [Icon('upload', { size: 18 }), el('span', {}, 'Import a list')],
  )

  const listImportCard = el('section', { class: 'card', 'aria-label': 'Import a list' }, [
    el('h2', { class: 'card-title' }, [
      Icon('upload', { size: 18 }),
      el('span', {}, 'Import a list'),
    ]),
    el('p', { class: 'card-hint' }, [
      'Paste the weigh-ins you have been keeping in your notes — one per line, date then weight. ',
      el('span', { class: 'import-hint-example' }, 'e.g. 5 Mar 2026 74.5'),
    ]),
    listImportButton,
  ])

  // ---- Phases shortcut --------------------------------------------------
  const phasesCard = el('section', { class: 'card', 'aria-label': 'Phases' }, [
    el('h2', { class: 'card-title' }, [Icon('flag', { size: 18 }), el('span', {}, 'Training phases')]),
    el('p', { class: 'card-hint' }, 'Mark stages like bulk or cut so you can read past noise.'),
    el(
      'button',
      { type: 'button', class: 'button button--secondary', 'data-focus-key': 'settings-manage-phases', onclick: cb.onManagePhases },
      [Icon('flag', { size: 18 }), el('span', {}, 'Manage phases')],
    ),
  ])

  // ---- Reset ------------------------------------------------------------
  const resetCard = el('section', { class: 'card card--danger', 'aria-label': 'Reset' }, [
    el('h2', { class: 'card-title' }, 'Reset'),
    el('p', { class: 'card-hint' }, 'Delete all weigh-ins and phases from this device.'),
    el(
      'button',
      { type: 'button', class: 'button button--danger', 'data-focus-key': 'settings-reset', onclick: () => doReset() },
      [Icon('trash', { size: 18 }), el('span', {}, 'Delete all data')],
    ),
  ])

  const aboutCard = el('section', { class: 'card', 'aria-label': 'About' }, [
    el('h2', { class: 'card-title' }, [Icon('info', { size: 18 }), el('span', {}, 'About')]),
    el('p', { class: 'card-hint' }, [
      'Weight is a simple tracker that works offline. No account, no server, no tracking — your weigh-ins never leave this device.',
    ]),
    state.entries.length > 0
      ? el('p', { class: 'card-hint' }, [
          `First entry ${fmtMedium(sorted[0].date)}, latest ${fmtMedium(
            sorted[sorted.length - 1].date,
          )} · ${fmtKg(sorted[sorted.length - 1].weightKg)} kg.`,
        ])
      : null,
  ])

  return el('div', { class: 'view view--settings' }, [
    el('div', { class: 'view-header' }, [
      el('h1', { class: 'view-title' }, 'Settings'),
    ]),
    profileCard,
    phasesCard,
    listImportCard,
    dataCard,
    resetCard,
    aboutCard,
    el('div', { class: 'view__spacer' }),
  ])

  // ---- Actions ----------------------------------------------------------
  function doExport(): void {
    const data = exportState(state)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `weight-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    Toast.show('Backup downloaded', 'success')
  }

  function handleImportFile(file: File): void {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = importState(text)
      if (!parsed) {
        Toast.show('That file is not a valid backup', 'error')
        return
      }
      cb.onReplaceState(parsed)
      Toast.show('Backup restored', 'success')
    }
    reader.onerror = () => Toast.show('Could not read that file', 'error')
    reader.readAsText(file)
  }

  function doImport(): void {
    fileInput.click()
  }

  async function doReset(): Promise<void> {
    const ok = await confirm({
      title: 'Delete all data?',
      message: 'Every weigh-in and phase on this device will be permanently removed. Export a backup first if you might want it back.',
      confirmLabel: 'Delete everything',
      destructive: true,
    })
    if (ok) {
      cb.onReset()
      Toast.show('All data deleted', 'success')
    }
  }
}

/** Simple info sheet used for first-run guidance. */
export function openInfoSheet(title: string, message: string): void {
  const sheet = createSheet({
    title,
    content: el('p', { class: 'sheet-text' }, message),
    actions: [
      el(
        'button',
        { type: 'button', class: 'button button--primary button--large', onclick: () => sheet.close() },
        [Icon('check', { size: 20 }), el('span', {}, 'Got it')],
      ),
    ],
  })
  sheet.open()
}
