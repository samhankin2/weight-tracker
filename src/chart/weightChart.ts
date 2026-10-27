/**
 * Weight trend chart (Chart.js v4).
 *
 * Two series over a continuous daily category axis:
 *  - raw weigh-ins (secondary, dotted feel, gaps preserved)
 *  - trailing 7-day average (primary, thicker, soft gradient fill)
 *
 * Phase ranges are shaded with a tiny inline plugin because the Chart.js
 * annotation plugin is deliberately not a dependency.
 *
 * Mobile notes:
 *  - the canvas must live in a container with a defined height and
 *    `position: relative` (Chart.js measures the parent, not the canvas)
 *  - x labels are thinned to at most five "Mar 5" ticks at 360px
 *  - tooltips are index-based and open on touch (no hover required)
 */

import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import type {
  ChartArea,
  ChartConfiguration,
  Plugin,
  Scale,
  ScriptableContext,
  TooltipItem,
} from 'chart.js'
import { fmtDelta, fmtKg, fromISODate } from '../metrics'
import type { DailyPoint } from '../metrics'
import type { Phase, WeightEntry } from '../types'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Neutral palette used when the design tokens are not on the page. */
const FALLBACK = {
  accent: '#2563eb',
  text: '#1f2937',
  grid: '#e5e7eb',
  muted: '#9ca3af',
  surface: '#ffffff',
} as const

export interface WeightChartOptions {
  series: DailyPoint[]
  phases: Phase[]
  entries: WeightEntry[]
  /** Chart window in days. Used for the empty-state copy. */
  windowDays: number
  /** Show the 7-day average line. */
  showAverage: boolean
  /** Alias for `showAverage`, kept for callers that use trend terminology. */
  showTrend?: boolean
  unit?: 'kg'
}

export interface WeightChartHandle {
  readonly chart: Chart<'line', (number | null)[], string>
  /** True when the visible window contains no weigh-ins. */
  readonly isEmpty: boolean
  destroy(): void
  update(series: DailyPoint[], phases: Phase[]): void
  /** Re-read design tokens (call after a manual light/dark toggle). */
  refreshTheme(): void
  /** Force a re-measure; Chart.js already observes container resizes. */
  resize(): void
}

interface ChartTheme {
  text: string
  grid: string
  accent: string
  muted: string
  surface: string
  font: string
}

interface PhaseBand {
  phase: Phase
  left: number
  right: number
  startVisible: boolean
}

/** Read theme colours from the canvas' computed style, with safe fallbacks. */
function readTheme(canvas: HTMLCanvasElement): ChartTheme {
  // A detached canvas does not inherit `:root` tokens; read from <html> then.
  const source = canvas.isConnected ? canvas : canvas.ownerDocument.documentElement
  const style = getComputedStyle(source)
  const read = (names: string[], fallback: string): string => {
    for (const name of names) {
      const value = style.getPropertyValue(name).trim()
      if (value) return value
    }
    return fallback
  }

  return {
    text: read(['--color-text'], FALLBACK.text),
    // `--color-grid` is the documented token; `--color-border` is the
    // design-system equivalent used by this app.
    grid: read(['--color-grid', '--color-border'], FALLBACK.grid),
    accent: read(['--color-accent'], FALLBACK.accent),
    muted: read(['--color-muted', '--color-text-muted'], FALLBACK.muted),
    surface: read(['--color-surface'], FALLBACK.surface),
    font: read(['--font-sans'], 'system-ui, -apple-system, "Segoe UI", sans-serif'),
  }
}

/** Convert any hex/rgb colour to `rgba()`; unknown formats use the fallback. */
function withAlpha(color: string, alpha: number, fallback: string = FALLBACK.accent): string {
  const value = color.trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value)
  if (hex) {
    let digits = hex[1]
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((char) => char + char)
        .join('')
    }
    if (digits.length === 6 || digits.length === 8) {
      const r = parseInt(digits.slice(0, 2), 16)
      const g = parseInt(digits.slice(2, 4), 16)
      const b = parseInt(digits.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value)
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[,\s/]+/).filter(Boolean)
    if (r && g && b) return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  if (value === fallback) return `rgba(148, 163, 184, ${alpha})`
  return withAlpha(fallback, alpha, '#94a3b8')
}

/** "Mar 5" */
function shortDate(iso: string): string {
  if (!ISO_DATE.test(iso)) return ''
  const date = fromISODate(iso)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}

/** "Wed, Mar 5, 2026" */
function longDate(iso: string): string {
  if (!ISO_DATE.test(iso)) return ''
  const date = fromISODate(iso)
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/**
 * Map phase date ranges onto x pixels. Category scales place point `i` at the
 * centre of its slot when `offset: true`, so a day's band is one step wide.
 */
function computeBands(
  labels: string[],
  phases: Phase[],
  x: Scale,
  area: ChartArea,
): PhaseBand[] {
  const count = labels.length
  if (count === 0) return []

  const first = labels[0]
  const last = labels[count - 1]
  if (!first || !last) return []

  let step = area.width
  if (count > 1) {
    const a = x.getPixelForValue(0)
    const b = x.getPixelForValue(1)
    const delta = Math.abs(b - a)
    step = Number.isFinite(delta) && delta > 0 ? delta : area.width / (count - 1)
  }
  const half = step / 2

  const bands: PhaseBand[] = []
  for (const phase of phases) {
    if (phase.endDate !== null && phase.endDate < first) continue
    if (phase.startDate > last) continue

    let startIndex = labels.findIndex((date) => date >= phase.startDate)
    if (startIndex === -1) startIndex = count - 1

    const endLimit = phase.endDate ?? last
    let endIndex = count - 1
    while (endIndex > startIndex && labels[endIndex] > endLimit) endIndex--
    if (labels[endIndex] > endLimit) continue

    const left = Math.max(area.left, x.getPixelForValue(startIndex) - half)
    const right = Math.min(area.right, x.getPixelForValue(endIndex) + half)
    if (right - left < 1) continue

    bands.push({
      phase,
      left,
      right,
      startVisible: phase.startDate >= first && phase.startDate <= last,
    })
  }
  return bands
}

/**
 * Create the weight chart and return a small imperative handle.
 * Never throws on empty data; `isEmpty` is exposed so the caller can show
 * its own empty state if desired.
 */
export function createWeightChart(
  canvas: HTMLCanvasElement,
  opts: WeightChartOptions,
): WeightChartHandle {
  const unit = opts.unit ?? 'kg'
  const averageVisible = opts.showAverage || opts.showTrend === true
  const hasEntriesAtCreation = opts.entries.length > 0
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let theme = readTheme(canvas)
  let destroyed = false

  const current = {
    series: opts.series,
    phases: opts.phases,
    labels: [] as string[],
    empty: false,
    emptyMessage: '',
  }

  /** Fill `current` from a series, keeping labels/data in sync. */
  function sync(series: DailyPoint[], phases: Phase[]): void {
    current.series = series
    current.phases = phases
    current.labels = series.length > 0 ? series.map((point) => point.date) : ['']
    current.empty =
      series.length === 0 ||
      (series.every((point) => point.weightKg === null) &&
        series.every((point) => point.avg7Kg === null))
    current.emptyMessage = hasEntriesAtCreation
      ? `No weigh-ins in the last ${opts.windowDays} days`
      : 'No weigh-ins yet'
  }

  sync(opts.series, opts.phases)

  function dataFor(keys: 'weightKg' | 'avg7Kg'): (number | null)[] {
    if (current.series.length === 0) return [null]
    return current.series.map((point) => point[keys])
  }

  function rawData(): (number | null)[] {
    return dataFor('weightKg')
  }

  function avgData(): (number | null)[] {
    return dataFor('avg7Kg')
  }

  /** Soft accent gradient under the average line. */
  function areaFill(context: ScriptableContext<'line'>): string | CanvasGradient {
    const area = context.chart.chartArea
    if (!area) return withAlpha(theme.accent, 0.12)
    const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
    gradient.addColorStop(0, withAlpha(theme.accent, 0.18))
    gradient.addColorStop(0.65, withAlpha(theme.accent, 0.06))
    gradient.addColorStop(1, withAlpha(theme.accent, 0))
    return gradient
  }

  /**
   * Phase shading + labels + empty state. Inline plugins are per-chart, so
   * the closure sees the latest series/phases after `update()`.
   */
  const phaseBands: Plugin<'line'> = {
    id: 'weightPhaseBands',
    beforeDatasetsDraw(chart) {
      if (current.empty) return
      const area = chart.chartArea
      const x = chart.scales.x
      if (!area || !x) return

      const { ctx } = chart
      const bands = computeBands(current.labels, current.phases, x, area)
      ctx.save()
      for (const band of bands) {
        ctx.fillStyle = withAlpha(band.phase.color, 0.12, FALLBACK.muted)
        ctx.fillRect(band.left, area.top, band.right - band.left, area.height)

        if (band.startVisible) {
          const borderX = Math.round(band.left) + 0.5
          ctx.lineWidth = 1
          ctx.strokeStyle = withAlpha(band.phase.color, 0.45, FALLBACK.muted)
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(borderX, area.top)
          ctx.lineTo(borderX, area.bottom)
          ctx.stroke()
        }
      }
      ctx.restore()
    },
    afterDatasetsDraw(chart) {
      const area = chart.chartArea
      if (!area) return

      const { ctx } = chart
      ctx.save()

      if (current.empty) {
        ctx.fillStyle = theme.muted
        ctx.font = `500 13px ${theme.font}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          current.emptyMessage,
          area.left + area.width / 2,
          area.top + area.height / 2,
          Math.max(40, area.width - 16),
        )
        ctx.restore()
        return
      }

      const x = chart.scales.x
      if (!x) {
        ctx.restore()
        return
      }

      ctx.font = `600 10px ${theme.font}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      for (const band of computeBands(current.labels, current.phases, x, area)) {
        const width = band.right - band.left
        if (width < 42) continue
        ctx.fillStyle = withAlpha(theme.text, 0.62, FALLBACK.text)
        ctx.fillText(band.phase.name, band.left + 6, area.top + 5, width - 10)
      }
      ctx.restore()
    },
  }

  const config: ChartConfiguration<'line', (number | null)[], string> = {
    type: 'line',
    data: {
      labels: current.labels,
      datasets: [
        {
          label: 'Weigh-in',
          data: rawData(),
          borderColor: () => withAlpha(theme.muted, 0.7, FALLBACK.muted),
          backgroundColor: () => withAlpha(theme.muted, 0.7, FALLBACK.muted),
          borderWidth: 1.5,
          pointRadius: 2.5,
          pointBackgroundColor: () => withAlpha(theme.muted, 0.85, FALLBACK.muted),
          pointBorderWidth: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: () => theme.text,
          pointHoverBorderColor: () => theme.surface,
          pointHoverBorderWidth: 2,
          tension: 0.2,
          fill: false,
          spanGaps: false,
        },
        {
          label: '7-day average',
          data: avgData(),
          borderColor: () => theme.accent,
          backgroundColor: areaFill,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: () => theme.accent,
          pointHoverBorderColor: () => theme.surface,
          pointHoverBorderWidth: 2,
          cubicInterpolationMode: 'monotone',
          tension: 0.35,
          fill: 'origin',
          spanGaps: false,
          hidden: !averageVisible,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 80,
      animation: reduceMotion ? false : { duration: 240 },
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      layout: { padding: { top: 4, right: 6, bottom: 0, left: 0 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(17, 24, 39, 0.96)',
          borderColor: 'rgba(255, 255, 255, 0.14)',
          borderWidth: 1,
          titleColor: '#f9fafb',
          bodyColor: '#e5e7eb',
          cornerRadius: 10,
          padding: 10,
          caretSize: 5,
          caretPadding: 10,
          displayColors: false,
          titleFont: { size: 12, weight: 600 },
          titleMarginBottom: 6,
          bodyFont: { size: 12 },
          bodySpacing: 4,
          // The average series is the tooltip anchor while it is visible:
          // it exists on unlogged days too, which lets us say "Not logged".
          // Checked per-render so external visibility toggles keep working.
          filter: (item: TooltipItem<'line'>): boolean =>
            item.datasetIndex === (item.chart.isDatasetVisible(1) ? 1 : 0),
          callbacks: {
            title(items) {
              const point = current.series[items[0]?.dataIndex ?? -1]
              return point ? longDate(point.date) : ''
            },
            label(item) {
              const point = current.series[item.dataIndex]
              if (!point) return ''
              return point.weightKg === null
                ? 'Not logged'
                : `${fmtKg(point.weightKg, 1)} ${unit}`
            },
            afterLabel(item) {
              const point = current.series[item.dataIndex]
              if (!point) return ''
              const average =
                point.avg7Kg === null ? '—' : `${fmtKg(point.avg7Kg, 1)} ${unit}`
              return [`7-day avg  ${average}`, `Change  ${fmtDelta(point.deltaKg, 1)}`]
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          offset: true,
          display: !current.empty,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: () => theme.muted,
            font: { size: 11, family: theme.font },
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            autoSkipPadding: 14,
            maxTicksLimit: 5,
            padding: 4,
            callback(value) {
              const index = typeof value === 'number' ? value : Number(value)
              const iso = current.labels[index]
              return iso ? shortDate(iso) : ''
            },
          },
        },
        y: {
          type: 'linear',
          position: 'left',
          display: !current.empty,
          grace: '8%',
          grid: {
            color: () => withAlpha(theme.grid, 0.8, FALLBACK.grid),
            drawTicks: false,
          },
          border: { display: false },
          ticks: {
            color: () => theme.muted,
            font: { size: 11, family: theme.font },
            maxTicksLimit: 5,
            padding: 6,
            callback(value, index) {
              const n = typeof value === 'number' ? value : Number(value)
              if (!Number.isFinite(n)) return ''
              const text = fmtKg(n, 1)
              // Unit lives on the lowest tick, saving horizontal space on mobile.
              return index === 0 ? `${text} ${unit}` : text
            },
          },
          afterDataLimits(scale) {
            const min = Number(scale.min)
            const max = Number(scale.max)
            if (!Number.isFinite(min) || !Number.isFinite(max)) return
            // Keep small changes legible: never show a range narrower than 2 kg.
            if (max - min >= 2) return
            const center = (min + max) / 2
            scale.min = center - 1
            scale.max = center + 1
          },
        },
      },
    },
    plugins: [phaseBands],
  }

  // Functional canvas hygiene for flex containers.
  canvas.style.display = 'block'
  canvas.style.minWidth = '0'
  canvas.style.maxWidth = '100%'

  const chart = new Chart<'line', (number | null)[], string>(canvas, config)

  function setAxisVisibility(visible: boolean): void {
    const scales = chart.options.scales
    if (!scales) return
    for (const key of ['x', 'y']) {
      const axis = scales[key] as unknown as { display?: boolean } | undefined
      if (axis) axis.display = visible
    }
  }

  function describe(): string {
    if (current.empty) return current.emptyMessage
    const logged = current.series.filter((point) => point.weightKg !== null).length
    return `Weight chart, ${logged} weigh-in${logged === 1 ? '' : 's'} over the last ${opts.windowDays} days`
  }

  function applyAccessibility(): void {
    if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', describe())
  }

  setAxisVisibility(!current.empty)
  applyAccessibility()

  function refreshTheme(): void {
    if (destroyed) return
    theme = readTheme(canvas)
    // `resize()` re-measures after a CSS/theme swap; `update` repaints the
    // scriptable colours (all themed colours are scriptable closures).
    chart.resize()
    chart.update('none')
  }

  let resizeFrame = 0
  const onWindowResize = (): void => {
    if (resizeFrame !== 0) return
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0
      if (!destroyed) chart.resize()
    })
  }
  window.addEventListener('resize', onWindowResize)

  let themeQuery: MediaQueryList | null = null
  const onThemeChange = (): void => refreshTheme()
  if (typeof window.matchMedia === 'function') {
    themeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    themeQuery.addEventListener('change', onThemeChange)
  }

  return {
    chart,
    get isEmpty(): boolean {
      return current.empty
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      if (resizeFrame !== 0) {
        window.cancelAnimationFrame(resizeFrame)
        resizeFrame = 0
      }
      window.removeEventListener('resize', onWindowResize)
      themeQuery?.removeEventListener('change', onThemeChange)
      chart.destroy()
    },
    update(series: DailyPoint[], phases: Phase[]): void {
      if (destroyed) return
      sync(series, phases)
      chart.data.labels = current.labels
      const [raw, average] = chart.data.datasets
      if (raw) raw.data = rawData()
      if (average) average.data = avgData()
      setAxisVisibility(!current.empty)
      applyAccessibility()
      chart.update()
    },
    refreshTheme,
    resize(): void {
      if (!destroyed) chart.resize()
    },
  }
}
