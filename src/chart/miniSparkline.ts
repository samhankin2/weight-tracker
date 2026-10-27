/**
 * Inline SVG sparkline for stat tiles.
 *
 * The returned element is decorative (`aria-hidden`); the tile's value and
 * label carry the accessible information. It stretches to its container via
 * CSS (`.stat-sparkline { width: 100%; height: ... }`) while
 * `preserveAspectRatio="none"` and `vector-effect` keep the stroke crisp.
 */

export interface SparklineOptions {
  /** viewBox width, in arbitrary units. Defaults to 100. */
  width?: number
  /** viewBox height. Defaults to 28 (matches the 1.75rem tile policy). */
  height?: number
  /** Stroke colour. Defaults to `currentColor` so design tokens apply. */
  color?: string
  /** Fill the area under the line with a low-opacity wash. Defaults to true. */
  fill?: boolean
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Build a sparkline from numeric values.
 * 0 values → a faint dashed baseline; 1 value → a flat line; many → polyline.
 * Non-finite values are ignored so a single bad reading cannot break the tile.
 */
export function renderSparkline(values: number[], opts: SparklineOptions = {}): SVGSVGElement {
  const width = Math.max(8, opts.width ?? 100)
  const height = Math.max(8, opts.height ?? 28)
  const color = opts.color ?? 'currentColor'
  const fill = opts.fill ?? true
  const padX = 1
  const padY = 2

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.classList.add('stat-sparkline')

  const points = values.filter((value) => Number.isFinite(value))

  if (points.length === 0) {
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(padX))
    line.setAttribute('x2', String(width - padX))
    line.setAttribute('y1', String(height / 2))
    line.setAttribute('y2', String(height / 2))
    line.setAttribute('stroke', color)
    line.setAttribute('stroke-width', '1')
    line.setAttribute('stroke-dasharray', '2 4')
    line.setAttribute('stroke-linecap', 'round')
    line.setAttribute('opacity', '0.35')
    svg.append(line)
    return svg
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min
  const plotWidth = width - padX * 2
  const plotHeight = height - padY * 2

  const yFor = (value: number): number =>
    span === 0 ? height / 2 : padY + (1 - (value - min) / span) * plotHeight

  // A single reading has no slope: draw a flat line rather than a dot that
  // would distort when the SVG is stretched by `preserveAspectRatio="none"`.
  const coords =
    points.length === 1
      ? [
          { x: padX, y: height / 2 },
          { x: width - padX, y: height / 2 },
        ]
      : points.map((value, index) => ({
          x: padX + (index / (points.length - 1)) * plotWidth,
          y: yFor(value),
        }))

  const linePath = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')

  if (fill && points.length > 1) {
    const first = coords[0]
    const last = coords[coords.length - 1]
    if (first && last) {
      const area = document.createElementNS(SVG_NS, 'path')
      area.setAttribute(
        'd',
        `${linePath} L${last.x.toFixed(2)} ${height - padY} L${first.x.toFixed(2)} ${height - padY} Z`,
      )
      area.setAttribute('fill', color)
      area.setAttribute('fill-opacity', '0.14')
      svg.append(area)
    }
  }

  const line = document.createElementNS(SVG_NS, 'path')
  line.setAttribute('d', linePath)
  line.setAttribute('fill', 'none')
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', '1.5')
  line.setAttribute('stroke-linecap', 'round')
  line.setAttribute('stroke-linejoin', 'round')
  line.setAttribute('vector-effect', 'non-scaling-stroke')
  svg.append(line)

  return svg
}
