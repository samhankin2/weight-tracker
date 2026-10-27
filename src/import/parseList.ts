/**
 * Parsing for pasted weigh-in lists.
 *
 * Expected shape: one entry per line, date first, then the weight.
 *
 *   5 Mar 2026 74.5
 *   2026-03-05 74.5
 *   05/03/2026 74.5
 *   5/3 74.5
 *
 * Day-first for numeric dates (05/03/2026 is 5 March). Month names are
 * unambiguous. Extra columns on a line are ignored, so a line like
 * "5 Mar 74.5 after gym" still works.
 */

export interface ParsedEntry {
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** Weight in kilograms. */
  weightKg: number
  /** Anything left over on the line, kept as a note. */
  note?: string
  /** The original line, for the preview. */
  raw: string
}

export interface ParseResult {
  entries: ParsedEntry[]
  /** Lines that could not be understood. */
  skipped: { line: string; reason: string }[]
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

/** Plausible bounds for a human body weight in kilograms. */
export const MIN_PLAUSIBLE_KG = 20
export const MAX_PLAUSIBLE_KG = 400

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Build an ISO date, validating the calendar day. */
function toISO(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  // Reject impossible days (e.g. 31 February).
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Parse a date fragment found at the start of a line.
 * Returns the ISO date and how many characters were consumed.
 *
 * A trailing separator (whitespace, comma, dash, colon) is required after a
 * date so that headings like "March 2026" are not mistaken for a weigh-in.
 */
function parseDateAt(text: string, defaultYear: number): { iso: string; length: number } | null {
  // ISO: 2026-03-05 (also 2026/03/05)
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=\s|[,;:\-]|$)/.exec(text)
  if (iso) {
    const result = toISO(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    if (result) return { iso: result, length: iso[0].length }
    return null
  }

  // Day-Month-Year or Day/Month/Year: 05/03/2026, 5-3-26, 5/3/2026
  const dmy = /^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?(?=\s|[,;:\-]|$)/.exec(text)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    let year = defaultYear
    if (dmy[3]) {
      year = Number(dmy[3])
      if (year < 100) year += 2000
    }
    const result = toISO(year, month, day)
    if (result) return { iso: result, length: dmy[0].length }
    return null
  }

  // "5 Mar 2026", "5 March", "5th Mar 2026"
  const dayMonthName =
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?(?=\s|[,;:\-]|$)/.exec(text)
  if (dayMonthName) {
    const month = MONTHS[dayMonthName[2].toLowerCase()]
    if (month) {
      const day = Number(dayMonthName[1])
      const year = dayMonthName[3] ? Number(dayMonthName[3]) : defaultYear
      const result = toISO(year, month, day)
      if (result) return { iso: result, length: dayMonthName[0].length }
    }
    return null
  }

  // "Mar 5 2026", "March 5th 2026"
  const monthNameDay =
    /^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?(?=\s|[,;:\-]|$)/.exec(text)
  if (monthNameDay) {
    const month = MONTHS[monthNameDay[1].toLowerCase()]
    if (month) {
      const day = Number(monthNameDay[2])
      const year = monthNameDay[3] ? Number(monthNameDay[3]) : defaultYear
      const result = toISO(year, month, day)
      if (result) return { iso: result, length: monthNameDay[0].length }
    }
    return null
  }

  // Bare year-month-day with spaces: "2026 03 05"
  const spaced = /^(\d{4})\s+(\d{1,2})\s+(\d{1,2})(?=\s|[,;:\-]|$)/.exec(text)
  if (spaced) {
    const result = toISO(Number(spaced[1]), Number(spaced[2]), Number(spaced[3]))
    if (result) return { iso: result, length: spaced[0].length }
  }

  return null
}

/**
 * True when a line begins with something that looks like a date but did not
 * parse — e.g. "31 Feb 2026". Used to give a precise error instead of the
 * vague "No date found".
 */
function looksLikeADate(text: string): boolean {
  return (
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text) ||
    /^\d{1,2}[-/]\d{1,2}([-/]\d{2,4})?/.test(text) ||
    /^\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}/.test(text) ||
    /^[A-Za-z]{3,9}\s+\d{1,2}/.test(text)
  )
}

/**
 * Parse a weight token, allowing a trailing unit. Returns kilograms, or null
 * if the token is not a plausible weight.
 */
function parseWeight(token: string): number | null {
  const match = /^(\d{1,3}(?:[.,]\d{1,2})?)\s*(kg|kgs|kilos?|lb|lbs|pounds?|st)?/i.exec(token.trim())
  if (!match) return null

  let value = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(value)) return null

  const unit = match[2]?.toLowerCase()
  if (unit === 'lb' || unit === 'lbs' || unit === 'pound' || unit === 'pounds') {
    value = value * 0.45359237
  } else if (unit === 'st') {
    value = value * 6.35029318
  }

  value = Math.round(value * 10) / 10
  if (value < MIN_PLAUSIBLE_KG || value > MAX_PLAUSIBLE_KG) return null
  return value
}

/**
 * Parse a block of pasted text into weigh-in entries.
 *
 * A line is understood when it starts with a date and contains a plausible
 * weight. The weight may appear before or after the date.
 */
export function parseWeighInList(text: string, todayIso?: string): ParseResult {
  const defaultYear = todayIso ? Number(todayIso.slice(0, 4)) : new Date().getFullYear()
  const entries: ParsedEntry[] = []
  const skipped: { line: string; reason: string }[] = []

  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Skip obvious noise: headings, blank bullets, section rules.
    if (/^[#=\-*_~]{2,}$/.test(line)) continue
    if (/^(weight|weigh-?ins?|date|body weight|logs?|entries)\s*:?$/i.test(line)) continue
    // Month/year section headings: "March 2026", "Mar 2026".
    if (/^[A-Za-z]{3,9}\s+\d{4}\s*:?$/i.test(line)) continue

    const dateMatch = parseDateAt(line, defaultYear)
    let iso: string | null = null
    let rest = line
    let dateLength = 0

    if (dateMatch) {
      iso = dateMatch.iso
      rest = line.slice(dateMatch.length).trim()
      dateLength = dateMatch.length
    } else if (looksLikeADate(line)) {
      // The line starts with something date-shaped but is not a valid date.
      skipped.push({ line, reason: 'Not a valid date' })
      continue
    }

    if (!iso) {
      // Maybe the weight comes first: "74.5 5 Mar 2026"
      const leadingWeight = /^\d{1,3}(?:[.,]\d{1,2})?\s*(?:kg|lbs?|lb)?\s+/i.exec(line)
      if (leadingWeight) {
        const after = line.slice(leadingWeight[0].length)
        const trailingDate = parseDateAt(after, defaultYear)
        if (trailingDate) {
          const weight = parseWeight(leadingWeight[0])
          if (weight !== null) {
            const note = after.slice(trailingDate.length).replace(/^[\s,:-]+/, '').trim()
            entries.push({
              date: trailingDate.iso,
              weightKg: weight,
              note: note || undefined,
              raw: line,
            })
            continue
          }
        }
      }
      skipped.push({ line, reason: 'No date found' })
      continue
    }

    // The date is at the start; find the weight in what remains.
    const weightMatch = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(kg|kgs|kilos?|lb|lbs|pounds?|st)?/i.exec(rest)
    if (!weightMatch) {
      skipped.push({ line, reason: 'No weight found' })
      continue
    }

    const weight = parseWeight(weightMatch[0])
    if (weight === null) {
      skipped.push({
        line,
        reason: `Weight out of range (${MIN_PLAUSIBLE_KG}-${MAX_PLAUSIBLE_KG} kg)`,
      })
      continue
    }

    // Whatever follows the weight is treated as a note.
    const note = rest
      .slice(weightMatch[0].length)
      .replace(/^[\s,;:-]+/, '')
      .trim()

    entries.push({ date: iso, weightKg: weight, note: note || undefined, raw: line })
    void dateLength
  }

  return { entries, skipped }
}

/**
 * Merge parsed entries into existing ones.
 * Later entries win for the same date; existing entries not mentioned are kept.
 */
export function mergeEntries(
  existing: { date: string; weightKg: number; note?: string }[],
  incoming: ParsedEntry[],
): { merged: { date: string; weightKg: number; note?: string }[]; overwritten: number } {
  const byDate = new Map(existing.map((e) => [e.date, { ...e }]))
  let overwritten = 0

  for (const entry of incoming) {
    if (byDate.has(entry.date)) overwritten++
    byDate.set(entry.date, {
      date: entry.date,
      weightKg: entry.weightKg,
      note: entry.note,
    })
  }

  const merged = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { merged, overwritten }
}
