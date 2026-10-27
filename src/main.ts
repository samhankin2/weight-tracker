/**
 * App shell: navigation, view routing, FAB, and global wiring.
 */

import './design/tokens.css'
import './design/ui.css'
import './app.css'

import { store } from './appStore'
import { openLogWeightSheet } from './sheets/logWeight'
import { openPhaseSheet } from './sheets/phaseSheet'
import { openImportListSheet } from './sheets/importList'
import { renderDashboard } from './views/dashboard'
import { renderHistory } from './views/history'
import { renderSettings } from './views/settings'
import { computeOverallStats, sortEntries, today } from './metrics'
import { confirm, Toast } from './ui/components'
import { el, Icon } from './ui/dom'
import type { AppState } from './types'
import { registerServiceWorker } from './pwa'

type TabId = 'dashboard' | 'history' | 'settings'

const TABS: { id: TabId; label: string; icon: 'activity' | 'calendar' | 'settings' }[] = [
  { id: 'dashboard', label: 'Trend', icon: 'activity' },
  { id: 'history', label: 'History', icon: 'calendar' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

class App {
  private root: HTMLElement
  private tabBar!: HTMLElement
  private viewHost!: HTMLElement
  private fab!: HTMLButtonElement
  private activeTab: TabId = 'dashboard'
  private chartHandle: { destroy(): void } | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.build()
    this.render()
    store.subscribe(() => this.render())
  }

  // ---- Shell -------------------------------------------------------------

  private build(): void {
    this.viewHost = el('main', { class: 'view-host', id: 'main-content' })
    this.tabBar = this.buildTabBar()
    this.fab = this.buildFab()

    const skipLink = el('a', { class: 'skip-link', href: '#main-content' }, 'Skip to content')

    this.root.append(
      skipLink,
      el('div', { class: 'app-shell' }, [
        this.viewHost,
        this.fab,
        this.tabBar,
      ]),
    )

    this.setupFabScrollBehaviour()
  }

  /**
   * Hide the FAB while the page is scrolled down and bring it back when the
   * user returns to the top. This keeps the floating button from covering
   * content underneath it on small screens.
   */
  private setupFabScrollBehaviour(): void {
    let lastY = window.scrollY
    let ticking = false

    const update = (): void => {
      ticking = false
      const y = window.scrollY
      const delta = y - lastY

      // Only react to meaningful movement.
      if (Math.abs(delta) < 8) return

      if (delta > 0 && y > 80) {
        this.fab.classList.add('is-hidden')
      } else {
        this.fab.classList.remove('is-hidden')
      }
      lastY = y
    }

    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return
        ticking = true
        window.requestAnimationFrame(update)
      },
      { passive: true },
    )
  }

  private buildTabBar(): HTMLElement {
    const buttons = TABS.map((tab) => {
      const button = el(
        'button',
        {
          type: 'button',
          class: 'tab-button',
          'aria-current': tab.id === this.activeTab ? 'page' : 'false',
          onclick: () => this.setTab(tab.id),
        },
        [
          Icon(tab.icon, { size: 22 }),
          el('span', { class: 'tab-label' }, tab.label),
        ],
      )
      button.dataset.tab = tab.id
      return button
    })

    return el('nav', { class: 'tab-bar', 'aria-label': 'Main' }, buttons)
  }

  private buildFab(): HTMLButtonElement {
    const fab = el(
      'button',
      {
        type: 'button',
        class: 'fab',
        'aria-label': 'Log weight',
        onclick: () => this.openLogSheet(),
      },
      [Icon('plus', { size: 30 })],
    ) as HTMLButtonElement
    return fab
  }

  // ---- Routing -----------------------------------------------------------

  private setTab(tab: TabId): void {
    if (this.activeTab === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    this.activeTab = tab
    this.render()
    // The window is the scroll container, not the view host.
    window.scrollTo({ top: 0 })
  }

  private syncTabBar(): void {
    const buttons = this.tabBar.querySelectorAll<HTMLButtonElement>('.tab-button')
    buttons.forEach((b) => {
      b.setAttribute('aria-current', b.dataset.tab === this.activeTab ? 'page' : 'false')
    })
  }

  // ---- Render ------------------------------------------------------------

  private render(): void {
    const state = store.get()

    // Remember what had focus so it can be restored after the re-render.
    // Without this, changing the chart range (or any setting) would drop
    // keyboard focus to <body>.
    const active = document.activeElement
    const focusKey =
      active instanceof HTMLElement && this.viewHost.contains(active)
        ? focusIdentity(active)
        : null

    // Tear down the previous chart before replacing the DOM.
    this.chartHandle?.destroy()
    this.chartHandle = null

    const view = this.renderView(state)
    this.viewHost.replaceChildren(view)
    this.syncTabBar()

    if (focusKey) {
      const restored = this.viewHost.querySelector<HTMLElement>(focusKey)
      restored?.focus({ preventScroll: true })
    }

    // Capture the chart handle so it can be destroyed on the next render.
    const handle = (view as HTMLElement & { __chart?: { destroy(): void } }).__chart
    if (handle) this.chartHandle = handle
  }

  private renderView(state: AppState): HTMLElement {
    switch (this.activeTab) {
      case 'dashboard':
        return renderDashboard(state, {
          onLog: () => this.openLogSheet(),
          onEditEntry: (date) => this.openLogSheet(date),
          onNewPhase: () => this.openPhaseSheet(),
          onEditPhase: (id) => this.openPhaseSheet(id),
          onDeletePhase: (id) => this.deletePhase(id),
          onOpenSettings: () => this.setTab('settings'),
          onWindowChange: (days) => store.updateProfile({ chartWindowDays: days }),
        })
      case 'history':
        return renderHistory(state, {
          onEditEntry: (date) => this.openLogSheet(date),
          onLog: () => this.openLogSheet(),
        })
      case 'settings':
        return renderSettings(state, {
          onUpdateProfile: (patch) => store.updateProfile(patch),
          onReplaceState: (next) => store.replaceState(next),
          onReset: () => store.reset(),
          onManagePhases: () => this.setTab('dashboard'),
          onImportList: () => this.openImportListSheet(),
        })
    }
  }

  // ---- Actions -----------------------------------------------------------

  private openLogSheet(date?: string): void {
    const state = store.get()
    const targetDate = date ?? today()
    const existing = state.entries.find((e) => e.date === targetDate)

    // Prefill new entries with the most recent weigh-in.
    const latest = sortEntries(state.entries)[state.entries.length - 1]

    openLogWeightSheet({
      date: targetDate,
      existing,
      prefillKg: existing ? undefined : latest?.weightKg,
      onSave: (d, weightKg, note, originalDate) => {
        if (originalDate && originalDate !== d) {
          // The date was changed while editing: move the entry, and if the
          // target date already had a value, it gets replaced.
          store.moveWeight(originalDate, d)
          store.setWeight(d, weightKg, note)
          Toast.show('Weigh-in moved', 'success')
          return
        }
        store.setWeight(d, weightKg, note)
        Toast.show(existing ? 'Weigh-in updated' : 'Weight saved', 'success')
      },
      onDelete: (d) => {
        void this.deleteEntry(d)
      },
    })
  }

  private async deleteEntry(date: string): Promise<void> {
    const ok = await confirm({
      title: 'Delete weigh-in?',
      message: 'This weigh-in will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) {
      store.deleteWeight(date)
      Toast.show('Weigh-in deleted', 'success')
    }
  }

  private openPhaseSheet(id?: string): void {
    const state = store.get()
    const phase = id ? state.phases.find((p) => p.id === id) : undefined

    openPhaseSheet({
      phase,
      colorIndex: state.phases.length,
      onSave: (data) => {
        if (phase) {
          store.updatePhase(phase.id, data)
          Toast.show('Phase updated', 'success')
        } else {
          store.addPhase(data)
          Toast.show('Phase added', 'success')
        }
      },
      onDelete: (pid) => {
        void this.deletePhase(pid)
      },
    })
  }

  private openImportListSheet(): void {
    const state = store.get()
    openImportListSheet({
      existing: state.entries,
      onImport: (entries) => {
        store.replaceEntries(entries)
      },
    })
  }

  private async deletePhase(id: string): Promise<void> {
    const state = store.get()
    const phase = state.phases.find((p) => p.id === id)
    if (!phase) return

    const stats = computeOverallStats(state.entries, state.profile, today())
    const ok = await confirm({
      title: `Delete "${phase.name}"?`,
      message: 'The chart shading for this phase will be removed. Your weigh-ins are kept.',
      confirmLabel: 'Delete phase',
      destructive: true,
    })
    if (ok) {
      store.deletePhase(id)
      Toast.show('Phase deleted', 'success')
      void stats
    }
  }
}

// ---- Focus preservation --------------------------------------------------

/**
 * Build a CSS selector that identifies an element after a re-render.
 *
 * Only elements that opt in with an explicit `data-focus-key` are eligible.
 * A heuristic class/index fallback is deliberately NOT used: several distinct
 * controls share the same class (e.g. every Settings `.field-input`), so a
 * class-derived selector resolves to the wrong element and can silently
 * redirect the user's typing into the wrong field.
 */
function focusIdentity(element: HTMLElement): string | null {
  const explicit = element.dataset.focusKey
  if (!explicit) return null
  return `[data-focus-key="${cssEscape(explicit)}"]`
}

/** Minimal CSS.escape polyfill for attribute values and class names. */
function cssEscape(value: string): string {
  return value.replace(/["'\\\]]/g, '\\$&')
}

// ---- Bootstrap -----------------------------------------------------------

const root = document.getElementById('app')
if (root) {
  new App(root)
  // Persist any pending changes before the tab closes.
  window.addEventListener('pagehide', () => store.flush())
  window.addEventListener('beforeunload', () => store.flush())
  // Offline support. Registration failures never break the app.
  registerServiceWorker()
}
