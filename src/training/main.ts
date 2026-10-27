/**
 * Training page shell.
 *
 * This is a second entry point in the same build, not a tab in the weight app.
 * There is deliberately no link between the two pages; they share an origin,
 * so both stores stay readable for the later insight module.
 */

import '../design/tokens.css'
import '../design/ui.css'
import '../app.css'
import './training.css'

import { registerServiceWorker } from '../pwa'
import { EmptyState, SegmentedControl, Toast } from '../ui/components'
import { el } from '../ui/dom'
import { trainingStore } from './store'
import type { ExerciseInput, TrainingHealth } from './store'
import { openExerciseSheet } from './exerciseSheet'
import {
  DEFAULT_LIBRARY_FILTER,
  renderExercises,
  type LibraryCallbacks,
  type LibraryFilterState,
} from './library'
import type { TrainingState } from './types'

type SectionId = 'today' | 'routines' | 'exercises' | 'sessions'

const SECTIONS: readonly { value: SectionId; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'routines', label: 'Routines' },
  { value: 'exercises', label: 'Exercises' },
  { value: 'sessions', label: 'Sessions' },
]

class TrainingApp {
  private root: HTMLElement
  private noticeHost!: HTMLElement
  private navHost!: HTMLElement
  private viewHost!: HTMLElement
  private activeSection: SectionId = 'today'
  private libraryFilter: LibraryFilterState = { ...DEFAULT_LIBRARY_FILTER }
  /** Focus target for the render that follows a programmatic section change. */
  private pendingFocusKey: string | null = null
  /** Signature of the notices currently mounted, so they are not re-announced. */
  private noticeSignature = ''

  constructor(root: HTMLElement) {
    this.root = root
    this.build()
    this.render()
    trainingStore.subscribe(() => this.render())
  }

  // ---- Shell -------------------------------------------------------------

  private build(): void {
    this.noticeHost = el('div', { class: 'training-notices' })
    this.navHost = el('div', { class: 'training-nav' })
    this.viewHost = el('main', { class: 'training-view-host', id: 'training-content' })

    const header = el('header', { class: 'training-header' }, [
      el(
        'h1',
        {
          class: 'training-title',
          tabindex: '-1',
          'data-focus-key': 'training-heading',
        },
        'Training',
      ),
    ])

    const shell = el('div', { class: 'training-shell' }, [
      header,
      this.noticeHost,
      this.navHost,
      this.viewHost,
    ])

    const skipLink = el('a', { class: 'skip-link', href: '#training-content' }, 'Skip to content')
    this.root.append(skipLink, shell)
  }

  // ---- Render ------------------------------------------------------------

  private render(): void {
    const state = trainingStore.get()
    const health = trainingStore.getHealth()

    // Focus survives the re-render only for controls that opted in with a
    // unique `data-focus-key` — same contract as the weight app.
    const active = document.activeElement
    const focusKey =
      active instanceof HTMLElement && this.root.contains(active) ? focusIdentity(active) : null

    const signature = `${health.corruptLoad}:${health.saveFailed}`
    if (signature !== this.noticeSignature) {
      this.noticeSignature = signature
      this.noticeHost.replaceChildren(...this.buildNotices(health))
    }

    this.navHost.replaceChildren(
      SegmentedControl({
        options: SECTIONS,
        value: this.activeSection,
        ariaLabel: 'Training section',
        focusKey: 'section',
        onChange: (value) => this.setSection(value as SectionId),
      }),
    )

    this.viewHost.replaceChildren(this.renderView(state))

    const target = this.pendingFocusKey ?? focusKey
    this.pendingFocusKey = null
    if (target) this.focusByKey(target)
  }

  private renderView(state: TrainingState): HTMLElement {
    switch (this.activeSection) {
      case 'today':
        return renderToday(state, {
          onOpenExercises: () => this.setSection('exercises', 'exercises-heading'),
        })
      case 'routines':
        return renderRoutines(state)
      case 'exercises':
        return renderExercises(state, this.libraryFilter, this.libraryCallbacks())
      case 'sessions':
        return renderSessions(state)
    }
  }

  private libraryCallbacks(): LibraryCallbacks {
    return {
      onNewExercise: (prefillName) => this.openNewExercise(prefillName),
      onEditExercise: (id) => this.openEditExercise(id),
      onFilterChange: (next) => {
        this.libraryFilter = next
      },
    }
  }

  private setSection(next: SectionId, focusKey?: string): void {
    if (next === this.activeSection) return
    this.activeSection = next
    this.pendingFocusKey = focusKey ?? null
    this.render()
    window.scrollTo({ top: 0 })
  }

  // ---- Notices -----------------------------------------------------------

  private buildNotices(health: TrainingHealth): HTMLElement[] {
    const notices: HTMLElement[] = []

    if (health.corruptLoad) {
      notices.push(
        buildNotice({
          message: "Some training data couldn't be read. Your other entries are still available.",
          actions: [
            noticeAction({
              label: 'Export backup',
              ariaLabel: 'Export backup of unreadable training data',
              focusKey: 'notice-corrupt-export',
              onClick: () => {
                trainingStore.exportBackup()
                Toast.show('Backup downloaded', 'success')
              },
            }),
            noticeAction({
              label: 'Retry',
              ariaLabel: 'Retry reading training data',
              focusKey: 'notice-corrupt-retry',
              onClick: () => {
                if (trainingStore.retryLoad()) this.focusByKey('training-heading')
                else Toast.show('Training data is still unreadable', 'error')
              },
            }),
          ],
        }),
      )
    }

    if (health.saveFailed) {
      notices.push(
        buildNotice({
          message:
            "Couldn't save on this device. Keep this tab open; your latest changes may be lost if you close it.",
          actions: [
            noticeAction({
              label: 'Retry',
              ariaLabel: 'Retry saving training data',
              focusKey: 'notice-save-retry',
              onClick: () => {
                trainingStore.retrySave()
                if (!trainingStore.getHealth().saveFailed) this.focusByKey('training-heading')
              },
            }),
            noticeAction({
              label: 'Export backup',
              ariaLabel: 'Export current training data',
              focusKey: 'notice-save-export',
              onClick: () => {
                trainingStore.exportBackup()
                Toast.show('Backup downloaded', 'success')
              },
            }),
          ],
        }),
      )
    }

    return notices
  }

  // ---- Exercise actions --------------------------------------------------

  private openNewExercise(prefillName?: string): void {
    const state = trainingStore.get()
    openExerciseSheet({
      ...(prefillName ? { prefillName } : {}),
      otherNames: state.exercises.map((exercise) => exercise.name),
      loadModeLocked: false,
      onSave: (input) => {
        trainingStore.addExercise(input)
        Toast.show('Exercise added', 'success')
      },
      onClose: () => this.restoreFocusLater('exercise-new', 'library-empty-new'),
    })
  }

  private openEditExercise(id: string): void {
    const state = trainingStore.get()
    const exercise = state.exercises.find((entry) => entry.id === id)
    if (!exercise) return

    const locked = trainingStore.hasLoggedSets(id)
    openExerciseSheet({
      exercise,
      otherNames: state.exercises
        .filter((entry) => entry.id !== id)
        .map((entry) => entry.name),
      loadModeLocked: locked,
      onSave: (input: ExerciseInput) => {
        trainingStore.updateExercise(id, input)
        Toast.show('Exercise updated', 'success')
      },
      onArchive: () => {
        trainingStore.archiveExercise(id)
        Toast.show('Exercise archived', 'success')
      },
      onRestore: exercise.archived
        ? () => {
            trainingStore.restoreExercise(id)
            Toast.show('Exercise restored', 'success')
          }
        : undefined,
      onClose: () => this.restoreFocusLater(`exercise-row:${id}`, 'exercises-heading'),
    })
  }

  // ---- Focus -------------------------------------------------------------

  private focusByKey(key: string): void {
    const target = this.root.querySelector<HTMLElement>(`[data-focus-key="${cssEscape(key)}"]`)
    target?.focus({ preventScroll: true })
  }

  /**
   * The originating control may have been replaced by a re-render, or removed
   * entirely (an archived exercise), so retry briefly and fall back.
   */
  private restoreFocusLater(...keys: string[]): void {
    const attempt = (remaining: number): void => {
      for (const key of keys) {
        const target = this.root.querySelector<HTMLElement>(`[data-focus-key="${cssEscape(key)}"]`)
        if (target) {
          target.focus({ preventScroll: true })
          return
        }
      }
      if (remaining > 0) window.setTimeout(() => attempt(remaining - 1), 60)
    }
    window.setTimeout(() => attempt(4), 0)
  }
}

/* -------------------------------------------------------------------------- */
/* Views that are not the exercise library                                    */
/* -------------------------------------------------------------------------- */

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

function sectionHeading(title: string, focusKey: string): HTMLElement {
  return el('div', { class: 'view-header' }, [
    el('h2', { class: 'view-title', tabindex: '-1', 'data-focus-key': focusKey }, title),
  ])
}

function renderToday(
  state: TrainingState,
  cb: { onOpenExercises: () => void },
): HTMLElement {
  const exerciseCount = state.exercises.filter((exercise) => !exercise.archived).length
  const routineCount = state.templates.length
  const counts: string[] = []
  if (exerciseCount > 0) counts.push(plural(exerciseCount, 'exercise'))
  if (routineCount > 0) counts.push(plural(routineCount, 'routine'))

  const empty = EmptyState({
    icon: 'activity',
    title: 'No routines yet',
    message: 'Create a routine or start an empty workout.',
    actionLabel: exerciseCount > 0 ? 'Open exercises' : 'Add your first exercise',
    onAction: cb.onOpenExercises,
  })
  empty
    .querySelector<HTMLElement>('.button')
    ?.setAttribute('data-focus-key', 'today-add-exercise')

  return el('div', { class: 'view training-view' }, [
    counts.length > 0
      ? el('p', { class: 'training-counts' }, counts.join(' · '))
      : null,
    empty,
  ])
}

function renderRoutines(state: TrainingState): HTMLElement {
  const templates = state.templates
  const body =
    templates.length === 0
      ? EmptyState({
          icon: 'flag',
          title: 'No routines yet',
          message: 'Save the exercises and targets you use often.',
        })
      : el(
          'ul',
          { class: 'training-simple-list' },
          templates.map((template) =>
            el('li', { class: 'card' }, [
              el('h3', { class: 'card-title' }, template.name),
              el('p', { class: 'card-hint' }, plural(template.exercises.length, 'exercise')),
            ]),
          ),
        )

  return el('div', { class: 'view training-view' }, [
    sectionHeading('Routines', 'routines-heading'),
    body,
    el(
      'p',
      { class: 'training-note' },
      templates.length === 0
        ? 'Routines arrive in a later build.'
        : 'Routine editing arrives in a later build.',
    ),
  ])
}

function renderSessions(state: TrainingState): HTMLElement {
  const sessions = state.sessions
  const body =
    sessions.length === 0
      ? EmptyState({
          icon: 'calendar',
          title: 'No workouts yet',
          message: 'Finished workouts will appear here.',
        })
      : el(
          'ul',
          { class: 'training-simple-list' },
          sessions.map((session) =>
            el('li', { class: 'card' }, [
              el('h3', { class: 'card-title' }, session.name ?? 'Workout'),
              el(
                'p',
                { class: 'card-hint' },
                `${formatSessionDate(session.date)} · ${plural(session.exercises.length, 'exercise')}`,
              ),
            ]),
          ),
        )

  return el('div', { class: 'view training-view' }, [
    sectionHeading('Sessions', 'sessions-heading'),
    body,
    el(
      'p',
      { class: 'training-note' },
      sessions.length === 0
        ? 'Sessions arrive in a later build.'
        : 'Session detail arrives in a later build.',
    ),
  ])
}

function formatSessionDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/* -------------------------------------------------------------------------- */
/* Small builders                                                             */
/* -------------------------------------------------------------------------- */

interface NoticeActionSpec {
  label: string
  ariaLabel: string
  focusKey: string
  onClick: () => void
}

function noticeAction({ label, ariaLabel, focusKey, onClick }: NoticeActionSpec): HTMLElement {
  return el(
    'button',
    {
      class: 'button button--secondary button--small',
      type: 'button',
      'aria-label': ariaLabel,
      'data-focus-key': focusKey,
      onClick,
    },
    label,
  )
}

function buildNotice({
  message,
  actions,
}: {
  message: string
  actions: HTMLElement[]
}): HTMLElement {
  return el('section', { class: 'notice', role: 'alert' }, [
    el('p', { class: 'notice-text' }, message),
    el('div', { class: 'notice-actions' }, actions),
  ])
}

/* -------------------------------------------------------------------------- */
/* Focus preservation                                                         */
/* -------------------------------------------------------------------------- */

function focusIdentity(element: HTMLElement): string | null {
  const explicit = element.dataset.focusKey
  if (!explicit) return null
  return `[data-focus-key="${cssEscape(explicit)}"]`
}

function cssEscape(value: string): string {
  return value.replace(/["'\\\]]/g, '\\$&')
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

const root = document.getElementById('app')
if (root) {
  new TrainingApp(root)
  // Offline support. Registration failures never break the app.
  registerServiceWorker()
}
