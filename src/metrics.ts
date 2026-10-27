/**
 * Pure metric computations. No DOM, no localStorage — safe to unit test.
 * All weights in kg. All dates are YYYY-MM-DD local calendar strings.
 */

import type { Phase, Profile, WeightEntry } from './types'

export interface DailyPoint {
  date: string
  /** Raw weight if logged that day, else null. */
  weightKg: number | null
  /** Trailing 7-day average (inclusive of this day), null if no data. */
  avg7Kg: number | null
  /** Trailing 7-day average of daily changes, null if <2 points of data. */
  rateKgPerWeek: number | null
  /** Weight change vs the previous logged entry, kg. */
  deltaKg: number | null
  /** Index of the phase this day belongs to, or -1. */
  phaseIndex: number
}

export interface RangeStats {
  /** Number of logged entries in range. */
  count: number
  startWeightKg: number | null
  endWeightKg: number | null
  /** end - start, kg. */
  changeKg: number | null
  minKg: number | null
  maxKg: number | null
  avgKg: number | null
  /** kg per week across the range, sign preserved. */
  rateKgPerWeek: number | null
  /** Average absolute day-to-day movement, kg. */
  volatilityKg: number | null
  /** Consecutive days with both a log and the previous day logged. */
  loggedDays: number
  /** Ratio of days in range that have a log. */
  adherence: number
}

export interface OverallStats extends RangeStats {
  latestKg: number | null
  latestDate: string | null
  /** Change since the very first logged entry. */
  totalChangeKg: number | null
  /** Progress from start weight toward goal, 0..1. null when unknown. */
  goalProgress: number | null
  /** Distance remaining to goal in kg (signed; 0 = at goal). */
  toGoalKg: number | null
  /** True when the goal weight has been reached or passed. */
  goalReached: boolean
  bmi: number | null
  /** Trend of the last 7 days (kg/week) from the 7-day average series. */
  trendKgPerWeek: number | null
  /** 7-day average of the most recent entries. */
  avg7Kg: number | null
  /** Streak of consecutive logged days ending today (or yesterday). */
  currentStreak: number
  /** Longest streak of consecutive logged days ever. */
  longestStreak: number
}

/** ISO date string for a Date, in local time. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse YYYY-MM-DD into a local Date at midnight. */
export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Add days to an ISO date string. */
export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const MS = 86400000
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / MS)
}

/** Today's ISO date. */
export function today(): string {
  return toISODate(new Date())
}

/** Sort entries ascending by date. Returns a new array. */
export function sortEntries(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Find the phase covering a given date, or null. Later phases win on overlap. */
export function phaseForDate(phases: Phase[], date: string): Phase | null {
  for (let i = phases.length - 1; i >= 0; i--) {
    const p = phases[i]
    if (p.startDate <= date && (p.endDate === null || p.endDate >= date)) return p
  }
  return null
}

/**
 * Build a continuous daily series over the requested window ending today.
 * Missing days are carried forward for the 7-day average, so the average
 * line stays continuous, but `weightKg` is null on unlogged days.
 */
export function buildDailySeries(
  entries: WeightEntry[],
  phases: Phase[],
  endDate: string = today(),
  days: number = 90,
): DailyPoint[] {
  const sorted = sortEntries(entries)
  const byDate = new Map(sorted.map((e) => [e.date, e.weightKg]))
  const start = addDays(endDate, -(days - 1))

  // Daily 7-day average: mean of all logged weights within the trailing 7 days.
  const dailyAvg: (number | null)[] = []
  for (let i = 0; i < days; i++) {
    const dayStart = addDays(start, i)
    let sum = 0
    let n = 0
    for (let k = 0; k < 7; k++) {
      const d = addDays(dayStart, -k)
      const w = byDate.get(d)
      if (w !== undefined) {
        sum += w
        n++
      }
    }
    dailyAvg.push(n === 0 ? null : sum / n)
  }

  // Daily deltas between consecutive logged entries (skips unlogged gaps).
  const series: DailyPoint[] = []
  let prevLogged: { date: string; weight: number } | null = null
  let prevAvg: number | null = null
  let prevAvgDate: string | null = null

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    const w = byDate.get(date) ?? null
    const avg = dailyAvg[i]

    let delta: number | null = null
    if (w !== null && prevLogged) {
      delta = w - prevLogged.weight
    }
    if (w !== null) prevLogged = { date, weight: w }

    // Rate: change in the 7-day average between the current day and 7 days ago.
    let rate: number | null = null
    if (avg !== null && prevAvgDate !== null) {
      const gap = daysBetween(prevAvgDate, date)
      if (gap >= 7 && prevAvg !== null) {
        const perWeek = ((avg - prevAvg) / gap) * 7
        rate = Math.abs(perWeek) < 1e-9 ? 0 : perWeek
      }
    }
    if (avg !== null) {
      prevAvg = avg
      prevAvgDate = date
    }

    const ph = phaseForDate(phases, date)
    series.push({
      date,
      weightKg: w,
      avg7Kg: avg,
      rateKgPerWeek: rate,
      deltaKg: delta,
      phaseIndex: ph ? phases.indexOf(ph) : -1,
    })
  }
  return series
}

/** Compute stats over an inclusive date range. */
export function computeRangeStats(
  entries: WeightEntry[],
  startDate: string,
  endDate: string,
): RangeStats {
  const inRange = sortEntries(entries).filter((e) => e.date >= startDate && e.date <= endDate)
  const count = inRange.length

  const empty: RangeStats = {
    count: 0,
    startWeightKg: null,
    endWeightKg: null,
    changeKg: null,
    minKg: null,
    maxKg: null,
    avgKg: null,
    rateKgPerWeek: null,
    volatilityKg: null,
    loggedDays: count,
    adherence: 0,
  }
  if (count === 0) return empty

  const weights = inRange.map((e) => e.weightKg)
  const start = weights[0]
  const end = weights[weights.length - 1]
  const change = end - start
  const spanDays = Math.max(1, daysBetween(inRange[0].date, inRange[inRange.length - 1].date))
  const rate = (change / spanDays) * 7

  // Mean absolute day-to-day change between consecutive logged entries.
  let absSum = 0
  let absN = 0
  for (let i = 1; i < inRange.length; i++) {
    absSum += Math.abs(inRange[i].weightKg - inRange[i - 1].weightKg)
    absN++
  }

  const rangeDays = daysBetween(startDate, endDate) + 1

  return {
    count,
    startWeightKg: start,
    endWeightKg: end,
    changeKg: change,
    minKg: Math.min(...weights),
    maxKg: Math.max(...weights),
    avgKg: weights.reduce((a, b) => a + b, 0) / weights.length,
    rateKgPerWeek: Math.abs(rate) < 1e-9 ? 0 : rate,
    volatilityKg: absN === 0 ? null : absSum / absN,
    loggedDays: count,
    adherence: rangeDays <= 0 ? 0 : count / rangeDays,
  }
}

/** Overall dashboard stats across all entries. */
export function computeOverallStats(
  entries: WeightEntry[],
  profile: Profile,
  now: string = today(),
): OverallStats {
  const sorted = sortEntries(entries)
  const base = computeRangeStats(entries, sorted[0]?.date ?? now, now)

  const latest = sorted[sorted.length - 1] ?? null
  const totalChange = latest && sorted.length > 1 ? latest.weightKg - sorted[0].weightKg : null

  let goalProgress: number | null = null
  let toGoal: number | null = null
  let goalReached = false
  if (profile.startWeightKg !== null && profile.goalWeightKg !== null && latest) {
    const span = profile.goalWeightKg - profile.startWeightKg
    if (Math.abs(span) > 1e-9) {
      const done = latest.weightKg - profile.startWeightKg
      goalProgress = Math.max(0, Math.min(1, done / span))
      toGoal = latest.weightKg - profile.goalWeightKg
      // "Reached" means we are at or past the goal in the direction of travel.
      goalReached = span < 0 ? done <= span : done >= span
    }
  }

  let bmi: number | null = null
  if (profile.heightCm && profile.heightCm > 0 && latest) {
    const m = profile.heightCm / 100
    bmi = latest.weightKg / (m * m)
  }

  // Trend: compare the 7-day average now vs 7 days earlier.
  const avg7now = averageLast(entries, now, 7)
  const avg7prev = averageLast(entries, addDays(now, -7), 7)
  let trend: number | null = null
  if (avg7now !== null && avg7prev !== null) {
    const t = avg7now - avg7prev
    trend = Math.abs(t) < 1e-9 ? 0 : t
  }

  const { streak, longest } = computeStreaks(sorted.map((e) => e.date))

  return {
    ...base,
    latestKg: latest?.weightKg ?? null,
    latestDate: latest?.date ?? null,
    totalChangeKg: totalChange,
    goalProgress,
    toGoalKg: toGoal,
    goalReached,
    bmi,
    trendKgPerWeek: trend,
    avg7Kg: avg7now,
    currentStreak: streak,
    longestStreak: longest,
  }
}

/** Mean of logged weights within the trailing `days` days ending at `endDate`. */
export function averageLast(entries: WeightEntry[], endDate: string, days: number): number | null {
  const start = addDays(endDate, -(days - 1))
  const inRange = entries.filter((e) => e.date >= start && e.date <= endDate)
  if (inRange.length === 0) return null
  return inRange.reduce((a, e) => a + e.weightKg, 0) / inRange.length
}

/** Current and longest streak of consecutive logged calendar days. */
export function computeStreaks(dates: string[]): { streak: number; longest: number } {
  if (dates.length === 0) return { streak: 0, longest: 0 }
  const set = new Set(dates)
  const sorted = [...set].sort()

  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) {
      run++
    } else {
      run = 1
    }
    if (run > longest) longest = run
  }

  // Current streak: count back from today, or from yesterday if today unlogged.
  const now = today()
  let cursor = set.has(now) ? now : addDays(now, -1)
  let streak = 0
  while (set.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return { streak, longest }
}

/** Suggested healthy-rate range bounds per week (kg). */
export const RATE_BOUNDS = { cut: 0.75, bulk: 0.25 } as const

/** Human label for a weekly rate. */
export function describeRate(rate: number | null): string {
  if (rate === null) return '—'
  if (Math.abs(rate) < 0.05) return 'holding steady'
  return rate < 0 ? 'losing' : 'gaining'
}

/** Format a kg value with the given precision. */
export function fmtKg(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toFixed(digits)
}

/** Format a signed delta, e.g. "+1.2 kg". */
export function fmtDelta(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = v > 0 ? '+' : v < 0 ? '−' : '±'
  return `${s}${Math.abs(v).toFixed(digits)} kg`
}

/** Format a signed rate as kg per week. */
export function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = v > 0 ? '+' : v < 0 ? '−' : '±'
  return `${s}${Math.abs(v).toFixed(2)} kg/wk`
}
