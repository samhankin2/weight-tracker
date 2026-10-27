import { clsx, el, Icon } from './dom'
import type { DOMChild } from './dom'
import type { IconName } from './icons'

export type UIContent = DOMChild

/* -------------------------------------------------------------------------- */
/* Shared dialog utilities                                                    */
/* -------------------------------------------------------------------------- */

let bodyLockCount = 0
let previousBodyOverflow = ''

function lockBody(): void {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyLockCount += 1
}

function unlockBody(): void {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) document.body.style.overflow = previousBodyOverflow
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => !node.hasAttribute('hidden') && node.getClientRects().length > 0)
}

let nextSheetId = 0

export interface SheetOptions {
  title: string
  subtitle?: string
  content: UIContent
  actions?: UIContent
  /** Useful for promise-based dialogs; called exactly once per open/close cycle. */
  onClose?: () => void
}

export interface SheetHandle {
  element: HTMLDivElement
  open: () => void
  close: () => void
}

/** Create a mobile bottom sheet which becomes a centered dialog on larger screens. */
export function createSheet({ title, subtitle, content, actions, onClose }: SheetOptions): SheetHandle {
  const id = `sheet-${++nextSheetId}`
  const titleId = `${id}-title`
  const subtitleId = subtitle ? `${id}-subtitle` : undefined
  let isOpen = false
  let previousFocus: HTMLElement | null = null
  let closeTimer: number | undefined
  let openFrame: number | undefined
  let focusRetry = 0

  const closeButton = el(
    'button',
    {
      class: 'icon-button sheet-close',
      type: 'button',
      'aria-label': 'Close dialog',
      onClick: () => close(),
    },
    Icon('x', { size: 20 }),
  )
  const heading = el('h2', { class: 'sheet-title', id: titleId }, title)
  const header = el('div', { class: 'sheet-header' }, [
    el('div', { class: 'sheet-heading' }, [
      heading,
      subtitle ? el('p', { class: 'sheet-subtitle', id: subtitleId }, subtitle) : null,
    ]),
    closeButton,
  ])
  const body = el('div', { class: 'sheet-content' }, content)
  const footer = actions
    ? el('div', { class: 'sheet-actions' }, actions)
    : null
  const panel = el(
    'section',
    {
      class: 'sheet-panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': subtitleId,
      tabindex: '-1',
    },
    [el('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }), header, body, footer],
  )
  const backdrop = el('div', { class: 'sheet-backdrop', 'aria-hidden': 'true' })
  const element = el('div', { class: 'sheet-layer', hidden: true }, [backdrop, panel])

  function trapFocus(event: KeyboardEvent): void {
    if (!isOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = focusableElements(panel)
    if (focusable.length === 0) {
      event.preventDefault()
      panel.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  /**
   * Document-level Escape handler. Runs while the sheet is open so Escape
   * works even when focus has not yet landed inside the dialog.
   */
  function onDocumentKeydown(event: KeyboardEvent): void {
    if (!isOpen) return
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
    document.removeEventListener('keydown', onDocumentKeydown, true)
  }

  function open(): void {
    if (isOpen) return
    if (closeTimer !== undefined) window.clearTimeout(closeTimer)
    isOpen = true
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!element.isConnected) document.body.append(element)
    element.hidden = false
    lockBody()
    openFrame = window.requestAnimationFrame(() => {
      element.classList.add('is-open')
      moveFocusIntoSheet()
    })
  }

  /**
   * Move focus into the sheet. The panel may not be focusable yet on the
   * first frame, so retry until focus actually lands.
   */
  function moveFocusIntoSheet(): void {
    const autofocus = panel.querySelector<HTMLElement>('[data-autofocus]')
    const target = autofocus ?? focusableElements(panel)[0] ?? panel
    target.focus()
    if (document.activeElement === target) return
    // Focus did not take (panel not yet focusable) — try again next frame.
    if (focusRetry < 5) {
      focusRetry++
      window.requestAnimationFrame(moveFocusIntoSheet)
    }
  }

  function close(): void {
    if (!isOpen) return
    isOpen = false
    focusRetry = 0
    if (openFrame !== undefined) window.cancelAnimationFrame(openFrame)
    document.removeEventListener('keydown', onDocumentKeydown, true)
    element.classList.remove('is-open')
    unlockBody()
    if (previousFocus?.isConnected) previousFocus.focus()
    previousFocus = null
    onClose?.()
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220
    closeTimer = window.setTimeout(() => {
      if (!isOpen) {
        element.hidden = true
        element.remove()
      }
    }, duration)
  }

  backdrop.addEventListener('click', close)
  element.addEventListener('keydown', trapFocus)
  // Escape must work even if focus has not yet moved into the sheet, so the
  // handler lives on the document while the sheet is open.
  document.addEventListener('keydown', onDocumentKeydown, true)
  return { element, open, close }
}

/* -------------------------------------------------------------------------- */
/* Stats and grouping                                                         */
/* -------------------------------------------------------------------------- */

export type StatTone = 'default' | 'up' | 'down' | 'neutral'

export interface StatTileProps {
  label: string
  value: string | number
  unit?: string
  sublabel?: string
  tone?: StatTone
  sparkline?: number[]
}

function createSparkline(values: number[]): SVGSVGElement | null {
  const points = values.filter((value) => Number.isFinite(value))
  if (points.length === 0) return null
  const width = 96
  const height = 28
  const padding = 3
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min
  const coordinates = points.map((value, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
    const y = range === 0 ? height / 2 : height - padding - ((value - min) / range) * (height - padding * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'stat-sparkline')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('preserveAspectRatio', 'none')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', `M${coordinates.join(' L')}`)
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.append(path)
  return svg
}

export function StatTile({
  label,
  value,
  unit,
  sublabel,
  tone = 'default',
  sparkline,
}: StatTileProps): HTMLElement {
  const toneMark = tone === 'up' ? '↗' : tone === 'down' ? '↘' : tone === 'neutral' ? '→' : ''
  const toneLabel = tone === 'up' ? 'Increasing' : tone === 'down' ? 'Decreasing' : tone === 'neutral' ? 'Holding steady' : ''
  const sparklineElement = sparkline ? createSparkline(sparkline) : null
  return el('article', { class: 'stat-tile', 'data-tone': tone }, [
    el('span', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value-row' }, [
      el('span', { class: 'stat-value' }, String(value)),
      unit ? el('span', { class: 'stat-unit' }, unit) : null,
      toneMark
        ? el('span', { class: 'stat-tone-mark', 'aria-hidden': 'true' }, toneMark)
        : null,
    ]),
    toneLabel ? el('span', { class: 'sr-only' }, toneLabel) : null,
    sublabel ? el('span', { class: 'stat-sublabel' }, sublabel) : null,
    sparklineElement,
  ])
}

export interface MetricCardProps {
  title: string
  icon?: IconName
  content: UIContent
  actions?: UIContent
}

export function MetricCard({ title, icon, content, actions }: MetricCardProps): HTMLElement {
  return el('section', { class: 'metric-card' }, [
    el('div', { class: 'metric-card-header' }, [
      el('div', { class: 'metric-card-heading' }, [
        icon ? Icon(icon, { className: 'metric-card-icon', size: 20 }) : null,
        el('h2', { class: 'metric-card-title' }, title),
      ]),
      actions ? el('div', { class: 'metric-card-actions' }, actions) : null,
    ]),
    el('div', { class: 'metric-card-content' }, content),
  ])
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption {
  value: string
  label: string
}

export interface SegmentedControlProps {
  options: readonly SegmentedOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  /**
   * Stable prefix for `data-focus-key` on each option, so keyboard focus can
   * be restored after the control is re-rendered.
   */
  focusKey?: string
}

export function SegmentedControl({ options, value, onChange, ariaLabel, focusKey }: SegmentedControlProps): HTMLElement {
  let selected = value
  const buttons = new Map<string, HTMLButtonElement>()
  const group = el('div', {
    class: 'segmented-control',
    role: 'radiogroup',
    'aria-label': ariaLabel,
    ...(focusKey ? { 'data-focus-key': focusKey } : {}),
  })

  function updateSelection(next: string, focus = false): void {
    selected = next
    for (const [optionValue, button] of buttons) {
      const active = optionValue === selected
      button.setAttribute('aria-checked', String(active))
      button.tabIndex = active ? 0 : -1
      if (active && focus) button.focus()
    }
  }

  function choose(next: string, focus = false): void {
    const changed = next !== selected
    updateSelection(next, focus)
    if (changed) onChange(next)
  }

  options.forEach((option, index) => {
    const button = el('button', {
      class: 'segmented-option',
      type: 'button',
      role: 'radio',
      'aria-checked': String(option.value === selected),
      tabindex: option.value === selected ? '0' : '-1',
      ...(focusKey ? { 'data-focus-key': `${focusKey}:${option.value}` } : {}),
      onClick: () => choose(option.value),
    }, option.label)
    button.addEventListener('keydown', (event) => {
      let nextIndex: number | null = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
      if (event.key === 'Home') nextIndex = 0
      if (event.key === 'End') nextIndex = options.length - 1
      if (nextIndex !== null) {
        event.preventDefault()
        choose(options[nextIndex].value, true)
      }
    })
    buttons.set(option.value, button)
    group.append(button)
  })
  if (options.length > 0 && !buttons.has(selected)) updateSelection(options[0].value)
  return group
}

export interface BigNumberInputProps {
  valueKg: number
  onChange: (valueKg: number) => void
  step?: number
  unit: string
  onSubmit?: (valueKg: number) => void
  bigStepButtons?: boolean
  /** Lowest plausible value. Used as the starting point for the steppers. */
  minValue?: number
  /** Select the entire value when the field gains focus (default true). */
  selectOnFocus?: boolean
  /** Receive focus as soon as the surrounding sheet opens. */
  autoFocus?: boolean
}

/** A thumb-friendly decimal input with repeat-on-hold steppers. */
export function BigNumberInput({
  valueKg,
  onChange,
  step = 0.1,
  unit,
  onSubmit,
  bigStepButtons = true,
  minValue = 0,
  selectOnFocus = true,
  autoFocus = false,
}: BigNumberInputProps): HTMLElement {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.1
  const precision = Math.max(1, (String(safeStep).split('.')[1] ?? '').length)
  const floor = Number.isFinite(minValue) && minValue > 0 ? minValue : 0
  let current = Number.isFinite(valueKg) ? Math.max(0, valueKg) : 0
  /** True while the field is empty, so the placeholder shows instead of "0.0". */
  let isBlank = current <= 0
  const inputId = `weight-input-${++nextSheetId}`
  const input = el('input', {
    class: 'big-number-value',
    id: inputId,
    type: 'text',
    inputmode: 'decimal',
    pattern: '[0-9]*[.,]?[0-9]*',
    autocomplete: 'off',
    'aria-label': `Weight in ${unit}`,
    placeholder: '0',
    value: isBlank ? '' : current.toFixed(precision),
    ...(autoFocus ? { 'data-autofocus': 'true' } : {}),
  })
  const round = (value: number): number => Math.round(value * 1000) / 1000
  const parseInput = (): number | null => {
    const raw = input.value.trim().replace(',', '.')
    if (!raw || !/^\d*\.?\d*$/.test(raw)) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  const renderValue = (): void => {
    input.value = isBlank || current <= 0 ? '' : current.toFixed(precision)
  }
  const setValue = (next: number): void => {
    const normalized = Math.max(0, round(next))
    const changed = normalized !== current
    current = normalized
    isBlank = false
    renderValue()
    if (changed) onChange(current)
  }
  const adjust = (direction: number): void => {
    // Stepping from a blank field starts at the plausible floor, not zero.
    const base = isBlank || current <= 0 ? floor : current
    setValue(base + direction * safeStep)
  }

  function makeStepButton(direction: number): HTMLButtonElement {
    const increase = direction > 0
    const button = el('button', {
      class: clsx('step-button', increase ? 'step-button--increase' : 'step-button--decrease'),
      type: 'button',
      'aria-label': `${increase ? 'Increase' : 'Decrease'} weight by ${safeStep} ${unit}`,
    }, Icon(increase ? 'plus' : 'minus', { size: 28 }))
    let repeatDelay: number | undefined
    let repeatInterval: number | undefined
    let suppressClick = false
    const stopRepeat = (): void => {
      if (repeatDelay !== undefined) window.clearTimeout(repeatDelay)
      if (repeatInterval !== undefined) window.clearInterval(repeatInterval)
      repeatDelay = undefined
      repeatInterval = undefined
    }
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      suppressClick = true
      adjust(direction)
      try {
        button.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is not available in a few embedded web views.
      }
      repeatDelay = window.setTimeout(() => {
        repeatInterval = window.setInterval(() => adjust(direction), 75)
      }, 425)
    })
    button.addEventListener('pointerup', stopRepeat)
    button.addEventListener('pointercancel', () => {
      stopRepeat()
      suppressClick = false
    })
    button.addEventListener('click', () => {
      if (suppressClick) {
        suppressClick = false
        return
      }
      adjust(direction)
    })
    return button
  }

  input.addEventListener('input', () => {
    const parsed = parseInput()
    if (parsed !== null) {
      const changed = parsed !== current
      current = parsed
      isBlank = input.value.trim() === ''
      if (changed) onChange(current)
    }
  })
  input.addEventListener('focus', () => {
    // Select the whole value so typing replaces it instead of appending.
    if (selectOnFocus) {
      requestAnimationFrame(() => input.select())
    }
  })
  input.addEventListener('blur', () => {
    const parsed = parseInput()
    if (parsed !== null) current = parsed
    renderValue()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const parsed = parseInput()
    if (parsed !== null) current = parsed
    renderValue()
    onSubmit?.(current)
  })

  return el('div', { class: clsx('big-number-input', !bigStepButtons && 'big-number-input--compact') }, [
    el('div', { class: 'big-number-display' }, [
      input,
      el('span', { class: 'big-number-unit', 'aria-hidden': 'true' }, unit),
    ]),
    el('div', { class: 'big-number-steppers' }, [
      makeStepButton(-1),
      el('span', { class: 'step-hint', 'aria-hidden': 'true' }, `${safeStep} ${unit}`),
      makeStepButton(1),
    ]),
  ])
}

/* -------------------------------------------------------------------------- */
/* Feedback and dialogs                                                       */
/* -------------------------------------------------------------------------- */

export type ToastTone = 'default' | 'success' | 'error' | 'info'
let toastElement: HTMLDivElement | null = null
let toastTimer: number | undefined
let toastHideTimer: number | undefined
let toastFrame: number | undefined

function ensureToast(): HTMLDivElement {
  if (toastElement) return toastElement
  toastElement = el('div', {
    class: 'toast',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    hidden: true,
  })
  document.body.append(toastElement)
  return toastElement
}

export const Toast = {
  show(message: string, tone: ToastTone = 'default'): void {
    const element = ensureToast()
    if (toastTimer !== undefined) window.clearTimeout(toastTimer)
    if (toastHideTimer !== undefined) window.clearTimeout(toastHideTimer)
    if (toastFrame !== undefined) window.cancelAnimationFrame(toastFrame)
    const iconName: IconName = tone === 'success' ? 'check' : tone === 'error' ? 'x' : 'info'
    element.dataset.tone = tone
    element.replaceChildren(Icon(iconName, { size: 19 }), el('span', { class: 'toast-message' }, message))
    element.hidden = false
    element.classList.remove('is-visible')
    toastFrame = window.requestAnimationFrame(() => element.classList.add('is-visible'))
    toastTimer = window.setTimeout(() => {
      element.classList.remove('is-visible')
      toastHideTimer = window.setTimeout(() => {
        element.hidden = true
      }, 180)
    }, 2500)
  },
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel: string
  destructive: boolean
}

/** Promise-based confirmation. Escape, backdrop, and Cancel all resolve false. */
export function confirm({ title, message, confirmLabel, destructive }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let sheet: SheetHandle
    const settle = (result: boolean): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const cancelButton = el('button', {
      class: 'button button--secondary',
      type: 'button',
      'data-autofocus': destructive,
      onClick: () => {
        settle(false)
        sheet.close()
      },
    }, 'Cancel')
    const confirmButton = el('button', {
      class: clsx('button', destructive ? 'button--danger' : 'button--primary'),
      type: 'button',
      'data-autofocus': !destructive,
      onClick: () => {
        settle(true)
        sheet.close()
      },
    }, confirmLabel)
    sheet = createSheet({
      title,
      content: el('p', { class: 'confirm-message' }, message),
      actions: [cancelButton, confirmButton],
      onClose: () => settle(false),
    })
    sheet.open()
  })
}

/* -------------------------------------------------------------------------- */
/* Empty states and pills                                                     */
/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
  icon: IconName
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps): HTMLElement {
  return el('section', { class: 'empty-state' }, [
    el('div', { class: 'empty-state-icon' }, Icon(icon, { size: 28 })),
    el('h2', { class: 'empty-state-title' }, title),
    el('p', { class: 'empty-state-message' }, message),
    actionLabel && onAction
      ? el('button', { class: 'button button--primary', type: 'button', onClick: onAction }, actionLabel)
      : null,
  ])
}

export type BadgeTone = 'default' | 'accent' | 'up' | 'down' | 'neutral'

export interface BadgeProps {
  label: string
  tone?: BadgeTone
  icon?: IconName
}

export function Badge({ label, tone = 'default', icon }: BadgeProps): HTMLSpanElement {
  return el('span', { class: 'badge', 'data-tone': tone }, [
    icon ? Icon(icon, { size: 14 }) : null,
    el('span', {}, label),
  ])
}

export interface ChipProps {
  label: string
  selected?: boolean
  onClick?: (selected: boolean) => void
  ariaLabel?: string
}

export function Chip({ label, selected = false, onClick, ariaLabel }: ChipProps): HTMLButtonElement {
  let isSelected = selected
  const button = el('button', {
    class: 'chip',
    type: 'button',
    'aria-pressed': String(isSelected),
    'aria-label': ariaLabel,
  }, [
    el('span', { class: 'chip-check', 'aria-hidden': 'true' }, isSelected ? Icon('check', { size: 15 }) : null),
    el('span', {}, label),
  ])
  button.addEventListener('click', () => {
    isSelected = !isSelected
    button.setAttribute('aria-pressed', String(isSelected))
    const check = button.querySelector('.chip-check')
    check?.replaceChildren(isSelected ? Icon('check', { size: 15 }) : '')
    onClick?.(isSelected)
  })
  return button
}
