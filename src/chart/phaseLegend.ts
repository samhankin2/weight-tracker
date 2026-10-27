/**
 * Phase legend for the weight chart.
 *
 * Renders one row per phase (colour swatch, name, inclusive date range) with
 * optional edit/delete ghost buttons. Mobile-first: rows wrap, and action
 * buttons honour the 44px minimum tap target (or the `--touch-target` token).
 *
 * The element is intentionally self-contained (no framework, no shared UI
 * imports) so the chart lane can ship independently. Structural layout lives
 * inline to guarantee wrapping and tap sizes; colours, type and spacing can
 * still be themed through the exported class names.
 */

import { fromISODate } from '../metrics'
import type { Phase } from '../types'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const ICON_PATHS = {
  edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 15H6L5 6', 'M10 11v5', 'M14 11v5'],
} as const

export interface PhaseLegendOptions {
  /** Renders an edit button when supplied. */
  onEdit?: (id: string) => void
  /** Renders a delete button when supplied. */
  onDelete?: (id: string) => void
  /** Denser rows and abbreviated dates. */
  compact?: boolean
}

/** "Mar 5" / "Mar 5, 2026" */
function formatDate(iso: string, withYear: boolean): string {
  if (!ISO_DATE.test(iso)) return iso
  const date = fromISODate(iso)
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`
  return withYear ? `${base}, ${date.getFullYear()}` : base
}

/** Inclusive range, abbreviated to one year where possible. */
function formatRange(phase: Phase, compact: boolean): string {
  const startYear = phase.startDate.slice(0, 4)
  const endDate = phase.endDate

  if (endDate === null) {
    return compact
      ? `${formatDate(phase.startDate, false)} – now`
      : `${formatDate(phase.startDate, true)} – ongoing`
  }

  const sameYear = startYear === endDate.slice(0, 4)
  if (sameYear) {
    const start = formatDate(phase.startDate, false)
    return compact
      ? `${start} – ${formatDate(endDate, false)}`
      : `${start} – ${formatDate(endDate, true)}`
  }

  return `${formatDate(phase.startDate, true)} – ${formatDate(endDate, true)}`
}

function createIcon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '20')
  svg.setAttribute('height', '20')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const data of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', data)
    svg.append(path)
  }
  svg.classList.add('icon')
  return svg
}

function createAction(
  kind: 'edit' | 'trash',
  label: string,
  className: string,
  handler: () => void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `phase-legend__action icon-button ${className}`
  button.setAttribute('aria-label', label)
  button.title = label
  // Functional tap target: at least 44px even before design CSS loads.
  button.style.minWidth = 'max(44px, var(--touch-target, 2.75rem))'
  button.style.minHeight = 'max(44px, var(--touch-target, 2.75rem))'
  button.style.display = 'inline-flex'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'center'
  button.style.padding = '0'
  button.append(createIcon(ICON_PATHS[kind]))
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    handler()
  })
  return button
}

/**
 * Render the legend. Returns a detached element; the caller appends it.
 * With no phases the container degrades to a short empty-state line.
 */
export function renderPhaseLegend(
  phases: Phase[],
  opts: PhaseLegendOptions = {},
): HTMLElement {
  const compact = opts.compact === true
  const root = document.createElement('div')
  root.className = compact ? 'phase-legend phase-legend--compact' : 'phase-legend'
  root.dataset.compact = compact ? 'true' : 'false'
  root.style.display = 'flex'
  root.style.flexWrap = 'wrap'
  root.style.alignItems = 'center'
  root.style.gap = compact ? '4px' : '8px'

  if (phases.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'phase-legend__empty'
    empty.textContent = 'No phases yet'
    root.append(empty)
    return root
  }

  root.setAttribute('role', 'list')
  root.setAttribute('aria-label', 'Training phases')

  const onEdit = opts.onEdit
  const onDelete = opts.onDelete

  for (const phase of phases) {
    const item = document.createElement('div')
    item.className = 'phase-legend__item'
    item.setAttribute('role', 'listitem')
    item.dataset.phaseId = phase.id
    item.style.display = 'flex'
    item.style.alignItems = 'center'
    item.style.gap = compact ? '6px' : '8px'
    item.style.minHeight = 'max(44px, var(--touch-target, 2.75rem))'
    item.style.maxWidth = '100%'
    // Non-compact is a tidy one-per-row list; compact wraps as chips.
    item.style.flex = compact ? '0 1 auto' : '1 1 100%'

    const swatch = document.createElement('span')
    swatch.className = 'phase-legend__swatch'
    swatch.setAttribute('aria-hidden', 'true')
    swatch.style.width = compact ? '10px' : '12px'
    swatch.style.height = compact ? '10px' : '12px'
    swatch.style.borderRadius = '999px'
    swatch.style.flexShrink = '0'
    swatch.style.backgroundColor = phase.color || '#94a3b8'
    item.append(swatch)

    const body = document.createElement('span')
    body.className = 'phase-legend__body'
    body.style.display = 'flex'
    body.style.flexDirection = 'column'
    body.style.flex = '1 1 auto'
    body.style.minWidth = '0'

    const name = document.createElement('span')
    name.className = 'phase-legend__name'
    name.textContent = phase.name
    name.style.overflowWrap = 'anywhere'

    const range = document.createElement('span')
    range.className = 'phase-legend__range'
    range.textContent = formatRange(phase, compact)

    body.append(name, range)
    item.append(body)

    if (onEdit || onDelete) {
      const actions = document.createElement('span')
      actions.className = 'phase-legend__actions'
      actions.style.display = 'inline-flex'
      actions.style.alignItems = 'center'
      actions.style.gap = '2px'
      actions.style.flexShrink = '0'

      if (onEdit) {
        actions.append(
          createAction('edit', `Edit ${phase.name} phase`, 'phase-legend__action--edit', () =>
            onEdit(phase.id),
          ),
        )
      }
      if (onDelete) {
        actions.append(
          createAction(
            'trash',
            `Delete ${phase.name} phase`,
            'phase-legend__action--delete',
            () => onDelete(phase.id),
          ),
        )
      }
      item.append(actions)
    }

    root.append(item)
  }

  return root
}
