/**
 * Exercise library.
 *
 * Search and filtering are view state, not store state, so typing does not
 * commit anything. Filter changes update the list in place; a store change
 * (create, edit, archive) rebuilds the whole view, and the shell hands the
 * remembered filter state back in.
 */

import type { TrainingState, Exercise } from './types'
import { BODY_AREA_MAP, equipmentLabel } from './types'
import { Badge, Chip, EmptyState } from '../ui/components'
import { el, Icon } from '../ui/dom'

export type LibraryArea = 'all' | 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core'

export interface LibraryFilterState {
  query: string
  area: LibraryArea
  showArchived: boolean
}

export const DEFAULT_LIBRARY_FILTER: LibraryFilterState = {
  query: '',
  area: 'all',
  showArchived: false,
}

export interface LibraryCallbacks {
  onNewExercise: (prefillName?: string) => void
  onEditExercise: (id: string) => void
  onFilterChange: (next: LibraryFilterState) => void
}

interface AreaFilter {
  id: LibraryArea
  label: string
  /** Muscle tags this chip accepts. `null` = no filter. */
  muscles: readonly string[] | null
}

/**
 * One table for both the chips and the row label. Muscle lists come from
 * `BODY_AREA_MAP`, so the label a row shows can never name an area the chips
 * do not filter on.
 */
const AREA_FILTERS: readonly AreaFilter[] = [
  { id: 'all', label: 'All', muscles: null },
  { id: 'chest', label: 'Chest', muscles: BODY_AREA_MAP.chest.muscles },
  { id: 'back', label: 'Back', muscles: BODY_AREA_MAP.back.muscles },
  { id: 'legs', label: 'Legs', muscles: BODY_AREA_MAP.legs.muscles },
  { id: 'shoulders', label: 'Shoulders', muscles: BODY_AREA_MAP.shoulders.muscles },
  { id: 'arms', label: 'Arms', muscles: BODY_AREA_MAP.arms.muscles },
  { id: 'core', label: 'Core', muscles: BODY_AREA_MAP.core.muscles },
]

/** The body area shown in a row: the first chip the exercise matches. */
function areaFor(exercise: Exercise): string {
  const match = AREA_FILTERS.find(
    (filter) =>
      filter.muscles !== null &&
      exercise.muscles.some((muscle) => filter.muscles?.includes(muscle)),
  )
  return match?.label ?? 'Other'
}

function matchesQuery(exercise: Exercise, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return exercise.name.toLowerCase().includes(needle)
}

function matchesArea(exercise: Exercise, area: LibraryArea): boolean {
  const filter = AREA_FILTERS.find((entry) => entry.id === area)
  if (!filter || !filter.muscles) return true
  return exercise.muscles.some((muscle) => filter.muscles?.includes(muscle))
}

function lastUsedByExercise(state: TrainingState): Map<string, string> {
  const usage = new Map<string, string>()
  for (const session of state.sessions) {
    for (const entry of session.exercises) {
      const previous = usage.get(entry.exerciseId)
      if (!previous || session.date > previous) usage.set(entry.exerciseId, session.date)
    }
  }
  return usage
}

function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`
}

export function renderExercises(
  state: TrainingState,
  filter: LibraryFilterState,
  cb: LibraryCallbacks,
): HTMLElement {
  const live = filter

  const heading = el(
    'h2',
    {
      class: 'view-title',
      tabindex: '-1',
      'data-focus-key': 'exercises-heading',
    },
    'Exercises',
  )
  const header = el('div', { class: 'view-header' }, [heading])

  const hasExercises = state.exercises.length > 0
  const archived = state.exercises.filter((exercise) => exercise.archived)

  const results = el('div', { class: 'library-results' })
  const count = el('p', {
    class: 'library-count',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  })
  const chipsRow = el('div', {
    class: 'library-chips',
    role: 'group',
    'aria-label': 'Filter exercises by body area',
  })
  const chipButtons = new Map<LibraryArea, HTMLButtonElement>()

  let countTimer: number | undefined

  const visibleExercises = (): Exercise[] => {
    const usage = lastUsedByExercise(state)
    return state.exercises
      .filter((exercise) => {
        if (exercise.archived && !live.showArchived) return false
        if (!matchesQuery(exercise, live.query)) return false
        if (!matchesArea(exercise, live.area)) return false
        return true
      })
      .sort((a, b) => {
        if (Boolean(a.archived) !== Boolean(b.archived)) return a.archived ? 1 : -1
        const aUsed = usage.get(a.id) ?? ''
        const bUsed = usage.get(b.id) ?? ''
        if (aUsed !== bUsed) return aUsed < bUsed ? 1 : -1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })
  }

  const scheduleCount = (immediate: boolean): void => {
    const visible = visibleExercises()
    const text = plural(visible.length, 'exercise')
    if (countTimer !== undefined) window.clearTimeout(countTimer)
    if (immediate) {
      count.textContent = text
      return
    }
    countTimer = window.setTimeout(() => {
      if (!count.isConnected) return
      count.textContent = text
    }, 350)
  }

  const newExerciseButton = el(
    'button',
    {
      class: 'button button--primary',
      type: 'button',
      'data-focus-key': 'exercise-new',
      onClick: () => cb.onNewExercise(),
    },
    [Icon('plus', { size: 18 }), el('span', {}, 'New exercise')],
  )

  const searchId = 'exercise-search'
  const searchInput = el('input', {
    class: 'field-input',
    id: searchId,
    type: 'search',
    value: live.query,
    autocomplete: 'off',
    'aria-describedby': 'exercise-search-hint',
    'data-focus-key': 'exercise-search',
  })
  const searchField = el('div', { class: 'field library-search' }, [
    el('label', { class: 'field-label', for: searchId }, 'Search exercises'),
    searchInput,
    el(
      'p',
      { class: 'field-hint', id: 'exercise-search-hint' },
      'Filter by name. The count updates as you type.',
    ),
  ])

  const toolbar = el('div', { class: 'library-toolbar' }, [searchField, newExerciseButton])

  const archivedToggle = el(
    'button',
    {
      class: 'button button--secondary library-archived-toggle',
      type: 'button',
      'data-focus-key': 'library-archived-toggle',
      'aria-pressed': String(live.showArchived),
      onClick: () => {
        live.showArchived = !live.showArchived
        cb.onFilterChange({ ...live })
        syncArchivedToggle()
        renderResults()
      },
    },
    '',
  )

  const syncArchivedToggle = (): void => {
    archivedToggle.setAttribute('aria-pressed', String(live.showArchived))
    archivedToggle.textContent = live.showArchived
      ? 'Hide archived'
      : `Show archived (${archived.length})`
    archivedToggle.hidden = archived.length === 0
  }

  const syncChips = (): void => {
    for (const [id, button] of chipButtons) {
      const active = id === live.area
      button.setAttribute('aria-pressed', String(active))
      const check = button.querySelector('.chip-check')
      check?.replaceChildren(active ? Icon('check', { size: 15 }) : '')
    }
  }

  const setArea = (area: LibraryArea): void => {
    live.area = area
    cb.onFilterChange({ ...live })
    syncChips()
    scheduleCount(false)
    renderResults()
  }

  for (const entry of AREA_FILTERS) {
    const chip = Chip({
      label: entry.label,
      selected: live.area === entry.id,
      onClick: () => setArea(entry.id),
    })
    chip.setAttribute('data-focus-key', `exercise-area:${entry.id}`)
    chipButtons.set(entry.id, chip)
    chipsRow.append(chip)
  }

  function emptyStateWithKey(
    node: HTMLElement,
    key: string,
  ): HTMLElement {
    node.querySelector<HTMLElement>('.button')?.setAttribute('data-focus-key', key)
    return node
  }

  function renderResults(): void {
    const visible = visibleExercises()

    if (visible.length === 0) {
      if (state.exercises.length === 0) {
        results.replaceChildren(
          emptyStateWithKey(
            EmptyState({
              icon: 'activity',
              title: 'No exercises yet',
              message: 'Add the exercises you actually train.',
              actionLabel: 'New exercise',
              onAction: () => cb.onNewExercise(),
            }),
            'library-empty-new',
          ),
        )
        return
      }

      const searchText = live.query.trim()
      const everythingArchived =
        archived.length > 0 &&
        live.area === 'all' &&
        searchText === '' &&
        !live.showArchived

      results.replaceChildren(
        emptyStateWithKey(
          EmptyState(
            everythingArchived
              ? {
                  icon: 'activity',
                  title: 'No active exercises',
                  message: 'Archived exercises can be restored below.',
                }
              : {
                  icon: 'activity',
                  title: 'No exercises found',
                  message: 'Try a different name or category.',
                  ...(searchText
                    ? {
                        actionLabel: `Create "${searchText}"`,
                        onAction: () => cb.onNewExercise(searchText),
                      }
                    : {}),
                },
          ),
          'library-create-from-search',
        ),
      )
      return
    }

    const rows = visible.map((exercise) => {
      const area = areaFor(exercise)
      const equipment = equipmentLabel(exercise.equipment)
      const meta = equipment ? `${area} · ${equipment}` : area
      return el('li', { class: 'library-row-item' }, [
        el(
          'button',
          {
            class: 'library-row',
            type: 'button',
            'aria-label': `Edit ${exercise.name}`,
            'data-focus-key': `exercise-row:${exercise.id}`,
            onClick: () => cb.onEditExercise(exercise.id),
          },
          [
            el('span', { class: 'library-row-main' }, [
              el('span', { class: 'library-row-name' }, exercise.name),
              el('span', { class: 'library-row-meta' }, meta),
            ]),
            exercise.archived ? Badge({ label: 'Archived' }) : null,
            Icon('chevron-right', { size: 18, className: 'library-row-chevron' }),
          ],
        ),
      ])
    })

    results.replaceChildren(el('ul', { class: 'library-list' }, rows))
  }

  searchInput.addEventListener('input', () => {
    live.query = searchInput.value
    cb.onFilterChange({ ...live })
    scheduleCount(false)
    renderResults()
  })

  // ---- Initial paint -------------------------------------------------------

  syncChips()
  syncArchivedToggle()
  renderResults()
  scheduleCount(true)

  return el('div', { class: 'view training-view' }, [
    header,
    hasExercises ? toolbar : null,
    hasExercises ? chipsRow : null,
    hasExercises ? count : null,
    results,
    hasExercises ? archivedToggle : null,
  ])
}
