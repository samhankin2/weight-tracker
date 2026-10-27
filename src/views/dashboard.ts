/**
 * Dashboard view: headline number, chart, key metrics, and recent entries.
 * Mobile-first: everything stacks in a single column.
 */

import { createWeightChart, type WeightChartHandle } from '../chart/weightChart'
import { renderPhaseLegend } from '../chart/phaseLegend'
import { fmtRelative, fmtWithDay } from '../format'
import {
  buildDailySeries,
  computeOverallStats,
  daysBetween,
  fmtDelta,
  fmtKg,
  fmtRate,
  sortEntries,
  today,
} from '../metrics'
import type { AppState } from '../types'
import { Badge, EmptyState, SegmentedControl, StatTile } from '../ui/components'
import { el, Icon } from '../ui/dom'

export interface DashboardCallbacks {
  onLog: () => void
  onEditEntry: (date: string) => void
  onNewPhase: () => void
  onEditPhase: (id: string) => void
  onDeletePhase: (id: string) => void
  onOpenSettings: () => void
  /** Chart time-range change, in days. 0 means "all". */
  onWindowChange?: (days: number) => void
}

const WINDOW_OPTIONS = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '180', label: '6mo' },
  { value: '365', label: '1y' },
  { value: '0', label: 'All' },
]

export function renderDashboard(state: AppState, cb: DashboardCallbacks): HTMLElement {
  const now = today()
  const stats = computeOverallStats(state.entries, state.profile, now)
  const sorted = sortEntries(state.entries)

  // ---- Headline: current weight + trend --------------------------------
  const headlineValue = stats.latestKg !== null ? fmtKg(stats.latestKg) : '-'
  const latestDate = stats.latestDate ? fmtRelative(stats.latestDate, now) : 'No entries yet'

  const trendTone =
    stats.trendKgPerWeek === null
      ? 'neutral'
      : stats.trendKgPerWeek > 0.05
        ? 'up'
        : stats.trendKgPerWeek < -0.05
          ? 'down'
          : 'neutral'

  const headline = el('section', { class: 'headline', 'aria-label': 'Current weight' }, [
    el('h1', { class: 'visually-hidden' }, 'Current weight'),
    el('div', { class: 'headline-main' }, [
      el('div', { class: 'headline-value' }, [
        el('span', { class: 'headline-number' }, headlineValue),
        el('span', { class: 'headline-unit' }, 'kg'),
      ]),
      el('div', { class: 'headline-meta' }, [
        el('span', { class: 'headline-date' }, latestDate),
        stats.trendKgPerWeek !== null
          ? Badge({
              label: `${fmtRate(stats.trendKgPerWeek)} 7-day trend`,
              tone: trendTone === 'neutral' ? 'neutral' : trendTone,
              icon:
                stats.trendKgPerWeek > 0.05
                  ? 'trending-up'
                  : stats.trendKgPerWeek < -0.05
                    ? 'trending-down'
                    : undefined,
            })
          : null,
      ]),
    ]),
  ])

  // ---- Chart ------------------------------------------------------------
  const chartFrame = el('div', { class: 'chart-frame' })
  const canvas = el('canvas', { id: 'weight-chart', role: 'img' })
  chartFrame.append(canvas)
  const chartEmpty = el('div', { class: 'chart-empty' })

  const windowControl = SegmentedControl({
    options: WINDOW_OPTIONS,
    value: String(state.profile.chartWindowDays),
    ariaLabel: 'Chart time range',
    focusKey: 'chart-window',
    onChange: (value) => {
      const days = Number(value)
      cb.onWindowChange?.(days)
    },
  })

  const chartLegend = el('ul', { class: 'chart-legend' }, [
    el('li', { class: 'chart-legend-item' }, [
      el('span', { class: 'chart-swatch chart-swatch--avg', 'aria-hidden': 'true' }),
      el('span', {}, '7-day average'),
    ]),
    el('li', { class: 'chart-legend-item' }, [
      el('span', { class: 'chart-swatch chart-swatch--raw', 'aria-hidden': 'true' }),
      el('span', {}, 'Weigh-ins'),
    ]),
  ])

  const chartSection = el('section', { class: 'card chart-card', 'aria-label': 'Weight chart' }, [
    el('div', { class: 'chart-head' }, [
      el('h2', { class: 'card-title' }, 'Trend'),
      windowControl,
    ]),
    chartFrame,
    chartEmpty,
    chartLegend,
  ])

  // ---- Primary metrics grid --------------------------------------------
  const sparkValues = sorted.slice(-14).map((e) => e.weightKg)

  const tiles = el('div', { class: 'stat-grid' }, [
    StatTile({
      label: '7-day avg',
      value: fmtKg(stats.avg7Kg),
      unit: 'kg',
      sublabel: stats.avg7Kg !== null ? 'Smoothed trend' : 'Need 7 days',
      sparkline: sparkValues,
    }),
    StatTile({
      label: 'Total change',
      value: stats.totalChangeKg !== null ? fmtDelta(stats.totalChangeKg).replace(' kg', '') : '-',
      unit: stats.totalChangeKg !== null ? 'kg' : undefined,
      sublabel: 'Since first entry',
      tone:
        stats.totalChangeKg === null
          ? 'neutral'
          : stats.totalChangeKg > 0.05
            ? 'up'
            : stats.totalChangeKg < -0.05
              ? 'down'
              : 'neutral',
    }),
    StatTile({
      label: 'Weekly rate',
      value: stats.rateKgPerWeek !== null ? fmtRate(stats.rateKgPerWeek).replace(' kg/wk', '') : '-',
      unit: stats.rateKgPerWeek !== null ? 'kg/wk' : undefined,
      sublabel: 'Overall pace',
      tone:
        stats.rateKgPerWeek === null
          ? 'neutral'
          : stats.rateKgPerWeek > 0.05
            ? 'up'
            : stats.rateKgPerWeek < -0.05
              ? 'down'
              : 'neutral',
    }),
    StatTile({
      label: 'Streak',
      value: String(stats.currentStreak),
      unit: stats.currentStreak === 1 ? 'day' : 'days',
      sublabel: `Best: ${stats.longestStreak}`,
      tone: 'neutral',
    }),
  ])

  // Optional tiles that only appear when the underlying data is available.
  if (stats.bmi !== null) {
    tiles.append(
      StatTile({
        label: 'BMI',
        value: stats.bmi.toFixed(1),
        sublabel: bmiLabel(stats.bmi),
        tone: 'neutral',
      }),
    )
  }
  if (stats.volatilityKg !== null) {
    tiles.append(
      StatTile({
        label: 'Daily swing',
        value: stats.volatilityKg.toFixed(2),
        unit: 'kg',
        sublabel: 'Average movement',
        tone: 'neutral',
      }),
    )
  }

  const metricsCard = el('section', { class: 'card', 'aria-label': 'Key metrics' }, [
    el('h2', { class: 'card-title' }, 'Metrics'),
    tiles,
  ])

  // ---- Goal progress ----------------------------------------------------
  let goalCard: HTMLElement | null = null
  if (stats.goalProgress !== null) {
    const pct = Math.round(stats.goalProgress * 100)
    const bar = el(
      'div',
      {
        class: 'progress-track',
        role: 'progressbar',
        'aria-valuenow': String(pct),
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-label': 'Progress toward goal',
      },
      [el('div', { class: 'progress-fill', style: { width: `${pct}%` } })],
    )

    // "Reached" and "to go" are mutually exclusive - never show both.
    let detail: string
    if (stats.goalReached) {
      detail =
        stats.toGoalKg !== null && Math.abs(stats.toGoalKg) >= 0.05
          ? `Goal reached - ${fmtDelta(-stats.toGoalKg)} past goal`
          : 'Goal reached'
    } else if (stats.toGoalKg !== null) {
      detail = `${fmtDelta(-stats.toGoalKg)} to go`
    } else {
      detail = '-'
    }

    goalCard = el('section', { class: 'card', 'aria-label': 'Goal progress' }, [
      el('h2', { class: 'card-title' }, [
        Icon('target', { size: 18 }),
        el('span', {}, 'Goal'),
      ]),
      el('div', { class: 'goal-row' }, [
        el('span', { class: 'goal-figure' }, `${pct}%`),
        el('span', { class: 'goal-detail' }, detail),
      ]),
      bar,
    ])
  }

  // ---- Phases -----------------------------------------------------------
  const phaseList = renderPhaseLegend(state.phases, {
    onEdit: cb.onEditPhase,
    onDelete: cb.onDeletePhase,
  })

  const phasesCard = el('section', { class: 'card', 'aria-label': 'Training phases' }, [
    el('div', { class: 'card-head-row' }, [
      el('h2', { class: 'card-title' }, [
        Icon('flag', { size: 18 }),
        el('span', {}, 'Phases'),
      ]),
      el(
        'button',
        {
          type: 'button',
          class: 'button button--ghost button--small',
          'data-focus-key': 'phases-new',
          onclick: cb.onNewPhase,
        },
        [Icon('plus', { size: 16 }), el('span', {}, 'New')],
      ),
    ]),
    el('p', { class: 'card-hint' }, 'Shade the chart to mark stages like bulk or cut.'),
    phaseList,
  ])

  // ---- Recent entries ---------------------------------------------------
  const recent = sorted.slice(-5).reverse()
  const recentList = el(
    'ul',
    { class: 'entry-list' },
    recent.length === 0
      ? []
      : recent.map((entry) => {
          const prev = sorted.filter((e) => e.date < entry.date).pop()
          const delta = prev ? entry.weightKg - prev.weightKg : null
          return el('li', { class: 'entry-row' }, [
            el(
              'button',
              {
                type: 'button',
                class: 'entry-main',
                onclick: () => cb.onEditEntry(entry.date),
                'aria-label': `Edit weigh-in for ${fmtWithDay(entry.date)}, ${fmtKg(entry.weightKg)} kilograms`,
              },
              [
                el('span', { class: 'entry-date' }, fmtRelative(entry.date, now)),
                el('span', { class: 'entry-weight' }, `${fmtKg(entry.weightKg)} kg`),
              ],
            ),
            el(
              'span',
              {
                class: `entry-delta ${
                  delta === null ? '' : delta > 0.05 ? 'is-up' : delta < -0.05 ? 'is-down' : ''
                }`,
              },
              delta === null ? '' : fmtDelta(delta),
            ),
          ])
        }),
  )

  const historyCard = el('section', { class: 'card', 'aria-label': 'Recent entries' }, [
    el('h2', { class: 'card-title' }, 'Recent'),
    recent.length === 0
      ? EmptyState({
          icon: 'activity',
          title: 'No weigh-ins yet',
          message: 'Tap the + button to record your first weight.',
          actionLabel: 'Record first weight',
          onAction: cb.onLog,
        })
      : recentList,
  ])

  // ---- Assemble ---------------------------------------------------------
  const root = el('div', { class: 'view view--dashboard' }, [
    headline,
    chartSection,
    metricsCard,
    goalCard,
    phasesCard,
    historyCard,
    el('div', { class: 'view__spacer' }),
  ])

  // ---- Mount chart after layout ----------------------------------------
  requestAnimationFrame(() => {
    const days = state.profile.chartWindowDays
    const series = buildDailySeries(
      state.entries,
      state.phases,
      now,
      days === 0 ? Math.max(30, daysBetweenFirst(now, state)) : days,
    )

    const handle: WeightChartHandle = createWeightChart(canvas, {
      series,
      phases: state.phases,
      entries: state.entries,
      windowDays: days,
      showAverage: true,
      unit: 'kg',
    })

    if (handle.isEmpty) {
      chartFrame.classList.add('is-hidden')
      chartEmpty.append(
        EmptyState({
          icon: 'activity',
          title: 'Nothing to chart yet',
          message: 'Log a few weigh-ins and your trend will appear here.',
          actionLabel: 'Add a weigh-in',
          onAction: cb.onLog,
        }),
      )
    }

    // Store handle for teardown via a property on the root element.
    ;(root as HTMLElement & { __chart?: WeightChartHandle }).__chart = handle
  })

  return root
}

/** Days between the first entry and today, for the "All" window. */
function daysBetweenFirst(now: string, state: AppState): number {
  const first = sortEntries(state.entries)[0]
  if (!first) return 30
  return Math.min(3650, Math.max(30, daysBetween(first.date, now) + 1))
}

/** Plain-language BMI category. */
function bmiLabel(bmi: number): string {
  if (bmi < 18.5) return 'Underweight'
  if (bmi < 25) return 'Healthy range'
  if (bmi < 30) return 'Overweight'
  return 'High range'
}
