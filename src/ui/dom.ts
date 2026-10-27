import { icons } from './icons'
import type { IconName } from './icons'

export type DOMChild = Node | string | number | null | undefined | false | DOMChild[]
export type ClassValue = string | false | null | undefined | ClassValue[] | Record<string, boolean>
export type ElementProps = Record<string, unknown>

/** Create an HTML element without framework or innerHTML dependencies. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: DOMChild = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class' || key === 'className') {
      node.className = String(value)
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value)
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value)
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (key === 'value' || key === 'checked') {
      Reflect.set(node, key, value)
    } else {
      node.setAttribute(key, value === true ? '' : String(value))
    }
  }

  appendChildren(node, children)
  return node
}

function appendChildren(parent: Node, children: DOMChild): void {
  if (children === null || children === undefined || children === false) return
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child)
    return
  }
  parent.appendChild(children instanceof Node ? children : document.createTextNode(String(children)))
}

/** Join conditional class names. Arrays and string-to-boolean maps are supported. */
export function clsx(...values: ClassValue[]): string {
  const classes: string[] = []
  const visit = (value: ClassValue): void => {
    if (!value) return
    if (typeof value === 'string') {
      if (value.trim()) classes.push(value.trim())
    } else if (Array.isArray(value)) {
      value.forEach(visit)
    } else {
      for (const [name, enabled] of Object.entries(value)) if (enabled) classes.push(name)
    }
  }
  values.forEach(visit)
  return classes.join(' ')
}

export interface IconOptions {
  size?: number
  className?: string
  /** Supplying a label exposes the icon as an image; otherwise it is decorative. */
  label?: string
}

/** Render a consistent, inline stroke icon. */
export function Icon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const size = options.size ?? 24
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('focusable', 'false')
  svg.classList.add('icon')
  if (options.className) svg.classList.add(...options.className.split(/\s+/))

  if (options.label) {
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', options.label)
  } else {
    svg.setAttribute('aria-hidden', 'true')
  }

  for (const data of icons[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', data)
    svg.append(path)
  }
  return svg
}
