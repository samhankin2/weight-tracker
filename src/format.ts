/**
 * Date formatting helpers for display.
 * Avoids pulling in date-fns for the few formats we need.
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** "5 Mar" */
export function fmtShort(iso: string): string {
  const { m, d } = parts(iso)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

/** "5 Mar 2026" */
export function fmtMedium(iso: string): string {
  const { y, m, d } = parts(iso)
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "5 March 2026" */
export function fmtLong(iso: string): string {
  const { y, m, d } = parts(iso)
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`
}

/** "Mon 5 Mar" */
export function fmtWithDay(iso: string): string {
  const { y, m, d } = parts(iso)
  const date = new Date(y, m - 1, d)
  return `${DAYS_SHORT[date.getDay()]} ${d} ${MONTHS_SHORT[m - 1]}`
}

/** "5 Mar – 12 Mar" or "5 Mar 2026 – 12 Mar 2026" */
export function fmtRange(start: string, end: string | null): string {
  if (!end) return `${fmtMedium(start)} – ongoing`
  const s = parts(start)
  const e = parts(end)
  if (s.y === e.y) return `${fmtShort(start)} – ${fmtShort(end)}`
  return `${fmtMedium(start)} – ${fmtMedium(end)}`
}

/** "Today" / "Yesterday" / "5 Mar" */
export function fmtRelative(iso: string, todayIso: string): string {
  // daysApart(a, b) returns b - a, so a date in the past is negative.
  const diff = daysApart(todayIso, iso)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === -2) return '2 days ago'
  if (diff === 1) return 'Tomorrow'
  return fmtWithDay(iso)
}

/** Days between two ISO dates (b - a). */
export function daysApart(a: string, b: string): number {
  const pa = parts(a)
  const pb = parts(b)
  const da = new Date(pa.y, pa.m - 1, pa.d).getTime()
  const db = new Date(pb.y, pb.m - 1, pb.d).getTime()
  return Math.round((db - da) / 86400000)
}

/** Value for an <input type="date">. */
export function toDateInputValue(iso: string): string {
  const { y, m, d } = parts(iso)
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Parse an <input type="date"> value, guarding against empty/invalid. */
export function fromDateInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}
