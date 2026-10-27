/**
 * Import a pasted weigh-in list.
 *
 * Paste a list of "date weight" lines, preview exactly what was understood,
 * then import. Pasted values overwrite anything already saved for that date.
 */

import { mergeEntries, parseWeighInList, type ParsedEntry } from '../import/parseList'
import { fmtRelative } from '../format'
import { today } from '../metrics'
import type { WeightEntry } from '../types'
import { createSheet, Toast } from '../ui/components'
import { el, Icon } from '../ui/dom'

export interface ImportListOptions {
  /** Existing entries, used to flag conflicts. */
  existing: WeightEntry[]
  /** Called with the merged set of entries to persist. */
  onImport: (entries: { date: string; weightKg: number; note?: string }[]) => void
}

const SAMPLE = `5 Mar 2026 74.5
12 Mar 2026 74.8
2026-03-19 75.1`

export function openImportListSheet(opts: ImportListOptions): { close: () => void } {
  const existingDates = new Set(opts.existing.map((e) => e.date))
  let parsed: { entries: ParsedEntry[]; skipped: { line: string; reason: string }[] } = {
    entries: [],
    skipped: [],
  }

  const textarea = el('textarea', {
    class: 'import-textarea',
    placeholder: SAMPLE,
    rows: 7,
    spellcheck: 'false',
    autocapitalize: 'off',
    autocorrect: 'off',
    'aria-label': 'Paste your weigh-in list',
  })

  const summary = el('div', { class: 'import-summary', role: 'status', 'aria-live': 'polite' })
  const preview = el('div', { class: 'import-preview' })
  const skippedList = el('div', { class: 'import-skipped' })

  const importButton = el(
    'button',
    {
      type: 'button',
      class: 'button button--primary button--large',
      disabled: true,
      onclick: () => doImport(),
    },
    [Icon('check', { size: 20 }), el('span', {}, 'Import')],
  )

  const pasteButton = el(
    'button',
    {
      type: 'button',
      class: 'button button--ghost button--small',
      onclick: async () => {
        const text = await readClipboard()
        if (text) {
          textarea.value = text
          refresh()
          textarea.focus()
        } else {
          Toast.show('Could not read the clipboard', 'error')
        }
      },
    },
    [Icon('upload', { size: 16 }), el('span', {}, 'Paste')],
  )

  function refresh(): void {
    parsed = parseWeighInList(textarea.value, today())
    const { entries, skipped } = parsed

    summary.replaceChildren()
    preview.replaceChildren()
    skippedList.replaceChildren()

    if (textarea.value.trim() === '') {
      summary.append(
        el('p', { class: 'import-hint' }, [
          'Paste one entry per line — date first, then weight. ',
          el('span', { class: 'import-hint-example' }, 'e.g. 5 Mar 2026 74.5'),
        ]),
      )
      importButton.setAttribute('disabled', '')
      importButton.textContent = 'Import'
      return
    }

    if (entries.length === 0) {
      summary.append(
        el('p', { class: 'import-hint import-hint--error' }, [
          "Couldn't read any weigh-ins from that text.",
        ]),
      )
      importButton.setAttribute('disabled', '')
      importButton.textContent = 'Import'
      renderSkipped(skipped)
      return
    }

    const conflicts = entries.filter((e) => existingDates.has(e.date)).length
    const added = entries.length - conflicts

    summary.append(
      el('div', { class: 'import-counts' }, [
        el('span', { class: 'import-count import-count--new' }, [
          el('strong', {}, String(added)),
          el('span', {}, added === 1 ? ' new entry' : ' new entries'),
        ]),
        conflicts > 0
          ? el('span', { class: 'import-count import-count--conflict' }, [
              el('strong', {}, String(conflicts)),
              el('span', {}, conflicts === 1 ? ' will replace' : ' will replace'),
            ])
          : null,
        skipped.length > 0
          ? el('span', { class: 'import-count import-count--skipped' }, [
              el('strong', {}, String(skipped.length)),
              el('span', {}, ' skipped'),
            ])
          : null,
      ]),
    )

    // Preview list, newest first.
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1))
    preview.append(
      el(
        'ul',
        { class: 'import-preview-list' },
        sorted.slice(0, 12).map((entry) => {
          const isConflict = existingDates.has(entry.date)
          return el('li', { class: `import-row${isConflict ? ' is-conflict' : ''}` }, [
            el('span', { class: 'import-row-date' }, fmtRelative(entry.date, today())),
            el('span', { class: 'import-row-weight' }, `${entry.weightKg.toFixed(1)} kg`),
            entry.note ? el('span', { class: 'import-row-note' }, entry.note) : null,
            isConflict ? el('span', { class: 'import-row-badge' }, 'replaces') : null,
          ])
        }),
      ),
    )
    if (sorted.length > 12) {
      preview.append(el('p', { class: 'import-more' }, `+ ${sorted.length - 12} more`))
    }

    renderSkipped(skipped)

    importButton.removeAttribute('disabled')
    importButton.textContent = `Import ${entries.length}`
  }

  function renderSkipped(skipped: { line: string; reason: string }[]): void {
    if (skipped.length === 0) return
    skippedList.append(
      el('details', { class: 'import-skipped-details' }, [
        el('summary', { class: 'import-skipped-summary' }, `${skipped.length} line(s) skipped`),
        el(
          'ul',
          { class: 'import-skipped-list' },
          skipped.slice(0, 8).map((s) =>
            el('li', {}, [
              el('span', { class: 'import-skipped-line' }, s.line),
              el('span', { class: 'import-skipped-reason' }, s.reason),
            ]),
          ),
        ),
      ]),
    )
  }

  function doImport(): void {
    const { entries } = parsed
    if (entries.length === 0) return
    const { merged, overwritten } = mergeEntries(opts.existing, entries)
    opts.onImport(merged)
    Toast.show(
      overwritten > 0
        ? `Imported ${entries.length}, replaced ${overwritten}`
        : `Imported ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`,
      'success',
    )
    sheet.close()
  }

  textarea.addEventListener('input', refresh)

  const sheet = createSheet({
    title: 'Import a list',
    subtitle: 'One weigh-in per line: date, then weight',
    content: el('div', { class: 'import-sheet' }, [
      el('div', { class: 'import-input-row' }, [
        el('label', { class: 'visually-hidden', for: 'import-textarea' }, 'Weigh-in list'),
        textarea,
        pasteButton,
      ]),
      summary,
      preview,
      skippedList,
    ]),
    actions: [
      el(
        'button',
        { type: 'button', class: 'button button--ghost', onclick: () => sheet.close() },
        [el('span', {}, 'Cancel')],
      ),
      importButton,
    ],
  })

  // Give the textarea an id so the label resolves.
  textarea.id = 'import-textarea'

  refresh()
  sheet.open()
  return { close: sheet.close }
}

/** Read text from the clipboard, tolerating permission failures. */
async function readClipboard(): Promise<string> {
  try {
    if (!navigator.clipboard?.readText) return ''
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}
