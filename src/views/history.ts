/**
 * History view: a reverse-chronological list of all entries, grouped by month.
 * Tapping a row opens the edit sheet.
 */

import { fmtKg, fmtDelta, sortEntries, today } from '../metrics'
import { fmtLong, fmtRelative } from '../format'
import type { AppState } from '../types'
import { EmptyState } from '../ui/components'
import { el } from '../ui/dom'

export interface HistoryCallbacks {
  onEditEntry: (date: string) => void
  onLog: () => void
}

export function renderHistory(state: AppState, cb: HistoryCallbacks): HTMLElement {
  const sorted = sortEntries(state.entries).reverse()
  const now = today()

  if (sorted.length === 0) {
    return el('div', { class: 'view view--history' }, [
      EmptyState({
        icon: 'calendar',
        title: 'No history yet',
        message: 'Once you log a weight it will show up here.',
        actionLabel: 'Record first weight',
        onAction: cb.onLog,
      }),
      el('div', { class: 'view__spacer' }),
    ])
  }

  // Group by month
  const groups = new Map<string, typeof sorted>()
  for (const entry of sorted) {
    const key = entry.date.slice(0, 7)
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }

  const sections: HTMLElement[] = []

  for (const [key, list] of groups) {
    const [y, m] = key.split('-').map(Number)
    const monthName = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })

    // Compute per-group delta so each row shows change from the previous entry.
    const ascending = sortEntries(state.entries)
    const rows = list.map((entry) => {
      const idx = ascending.findIndex((e) => e.date === entry.date)
      const prev = idx > 0 ? ascending[idx - 1] : null
      const delta = prev ? entry.weightKg - prev.weightKg : null
      const dayNum = Number(entry.date.slice(8, 10))

      return el('li', { class: 'entry-row entry-row--detailed' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'entry-main',
            onclick: () => cb.onEditEntry(entry.date),
            'aria-label': `Edit weigh-in for ${fmtLong(entry.date)}, ${fmtKg(entry.weightKg)} kilograms`,
          },
          [
            el('span', { class: 'entry-daynum' }, String(dayNum)),
            el('span', { class: 'entry-detail' }, [
              el('span', { class: 'entry-weight' }, `${fmtKg(entry.weightKg)} kg`),
              entry.note ? el('span', { class: 'entry-note' }, entry.note) : null,
            ]),
          ],
        ),
        el(
          'span',
          {
            class: `entry-delta ${
              delta === null ? '' : delta > 0.05 ? 'is-up' : delta < -0.05 ? 'is-down' : ''
            }`,
          },
          delta === null ? '—' : fmtDelta(delta),
        ),
      ])
    })

    sections.push(
      el('section', { class: 'history-group' }, [
        el('h2', { class: 'history-month' }, monthName),
        el('ul', { class: 'entry-list' }, rows),
      ]),
    )
  }

  return el('div', { class: 'view view--history' }, [
    el('div', { class: 'view-header' }, [
      el('h1', { class: 'view-title' }, 'History'),
      el('p', { class: 'view-subtitle' }, `${sorted.length} weigh-in${sorted.length === 1 ? '' : 's'}`),
    ]),
    ...sections,
    el('div', { class: 'view__spacer' }),
    el('p', { class: 'view-footer-note' }, `Last entry: ${fmtRelative(sorted[0].date, now)}`),
  ])
}
