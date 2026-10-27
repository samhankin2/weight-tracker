/**
 * Parser tests for the pasted-list importer.
 * Run with: npx tsx qa/parse-test.ts  (or compile and run with node)
 */

import { mergeEntries, parseWeighInList } from '../src/import/parseList'

let passed = 0
let failed = 0

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}\n        expected: ${e}\n        actual:   ${a}`)
  }
}

const TODAY = '2026-03-05'

console.log('\n=== Date + weight on one line ===')
{
  const r = parseWeighInList('5 Mar 2026 74.5', TODAY)
  check('ISO date', r.entries, [
    { date: '2026-03-05', weightKg: 74.5, note: undefined, raw: '5 Mar 2026 74.5' },
  ])
}

console.log('\n=== Common formats ===')
{
  const cases: [string, string, number][] = [
    ['2026-03-05 74.5', '2026-03-05', 74.5],
    ['2026/03/05 74.5', '2026-03-05', 74.5],
    ['05/03/2026 74.5', '2026-03-05', 74.5],
    ['5/3/2026 74.5', '2026-03-05', 74.5],
    ['5-3-2026 74.5', '2026-03-05', 74.5],
    ['5 Mar 2026 74.5', '2026-03-05', 74.5],
    ['5 March 2026 74.5', '2026-03-05', 74.5],
    ['Mar 5 2026 74.5', '2026-03-05', 74.5],
    ['March 5 2026 74.5', '2026-03-05', 74.5],
    ['5th Mar 2026 74.5', '2026-03-05', 74.5],
    ['2026 03 05 74.5', '2026-03-05', 74.5],
    ['5 Mar 74.5', '2026-03-05', 74.5],
    ['5/3 74.5', '2026-03-05', 74.5],
  ]
  for (const [input, date, weight] of cases) {
    const r = parseWeighInList(input, TODAY)
    check(
      `"${input}"`,
      r.entries.length === 1 ? [r.entries[0].date, r.entries[0].weightKg] : r.entries,
      [date, weight],
    )
  }
}

console.log('\n=== Weight before date ===')
{
  const r = parseWeighInList('74.5 5 Mar 2026', TODAY)
  check('weight first', r.entries.length === 1 ? [r.entries[0].date, r.entries[0].weightKg] : r.entries, [
    '2026-03-05',
    74.5,
  ])
}

console.log('\n=== Units ===')
{
  const r = parseWeighInList('5 Mar 2026 74.5 kg', TODAY)
  check('kg suffix', r.entries[0]?.weightKg, 74.5)
}
{
  const r = parseWeighInList('5 Mar 2026 165 lbs', TODAY)
  check('lbs converted', r.entries[0]?.weightKg, 74.8)
}

console.log('\n=== Notes ===')
{
  const r = parseWeighInList('5 Mar 2026 74.5 after gym', TODAY)
  check('note captured', r.entries[0]?.note, 'after gym')
}
{
  const r = parseWeighInList('5 Mar 2026 74.5 - felt strong', TODAY)
  check('note with dash', r.entries[0]?.note, 'felt strong')
}

console.log('\n=== Multiple lines ===')
{
  const r = parseWeighInList(
    ['5 Mar 2026 74.5', '12 Mar 2026 74.8', '19 Mar 2026 75.1'].join('\n'),
    TODAY,
  )
  check('three entries', r.entries.length, 3)
  check('dates in order', r.entries.map((e) => e.date), [
    '2026-03-05',
    '2026-03-12',
    '2026-03-19',
  ])
  check('weights', r.entries.map((e) => e.weightKg), [74.5, 74.8, 75.1])
  check('nothing skipped', r.skipped.length, 0)
}

console.log('\n=== Blank lines and noise are ignored ===')
{
  const r = parseWeighInList(
    ['', '   ', 'Weigh-ins', '5 Mar 2026 74.5', '---', '12 Mar 2026 74.8'].join('\n'),
    TODAY,
  )
  check('two entries', r.entries.length, 2)
  // "Weigh-ins" is a heading: ignored outright, not reported as a bad line.
  check('nothing skipped', r.skipped.length, 0)
}

console.log('\n=== Out-of-range weights are rejected, not guessed ===')
{
  const r = parseWeighInList('5 Mar 2026 0.5', TODAY)
  check('0.5 rejected', r.entries.length, 0)
  check('reason given', r.skipped[0]?.reason.includes('out of range'), true)
}
{
  const r = parseWeighInList('5 Mar 2026 900', TODAY)
  check('900 rejected', r.entries.length, 0)
}

console.log('\n=== Invalid dates are rejected ===')
{
  const r = parseWeighInList('31 Feb 2026 74.5', TODAY)
  check('31 Feb rejected', r.entries.length, 0)
  check('skipped', r.skipped.length, 1)
  check('precise reason', r.skipped[0]?.reason, 'Not a valid date')
}
{
  const r = parseWeighInList('5 Mar 2026', TODAY)
  check('date but no weight', r.entries.length, 0)
  check('reason', r.skipped[0]?.reason, 'No weight found')
}

console.log('\n=== Day-first is never month-first ===')
{
  // 05/03/2026 must be 5 March, NOT 3 May.
  const r = parseWeighInList('05/03/2026 74.5', TODAY)
  check('05/03/2026 is 5 March', r.entries[0]?.date, '2026-03-05')
}
{
  // 12/03/2026 is 12 March (12 is unambiguous).
  const r = parseWeighInList('12/03/2026 74.5', TODAY)
  check('12/03/2026 is 12 March', r.entries[0]?.date, '2026-03-12')
}
{
  // 13/03/2026 cannot be a month, so it must be 13 March.
  const r = parseWeighInList('13/03/2026 74.5', TODAY)
  check('13/03/2026 is 13 March', r.entries[0]?.date, '2026-03-13')
}

console.log('\n=== Merge: pasted values overwrite ===')
{
  const existing = [
    { date: '2026-03-05', weightKg: 70, note: 'old' },
    { date: '2026-03-12', weightKg: 74.8 },
  ]
  const incoming = parseWeighInList('5 Mar 2026 74.5', TODAY).entries
  const { merged, overwritten } = mergeEntries(existing, incoming)
  check('one overwritten', overwritten, 1)
  check('total count', merged.length, 2)
  check('existing overwritten', merged.find((e) => e.date === '2026-03-05')?.weightKg, 74.5)
  check('untouched kept', merged.find((e) => e.date === '2026-03-12')?.weightKg, 74.8)
}

console.log('\n=== Merge: new dates are added ===')
{
  const existing = [{ date: '2026-03-05', weightKg: 70 }]
  const incoming = parseWeighInList('19 Mar 2026 75.1', TODAY).entries
  const { merged, overwritten } = mergeEntries(existing, incoming)
  check('none overwritten', overwritten, 0)
  check('two total', merged.length, 2)
  check('sorted', merged.map((e) => e.date), ['2026-03-05', '2026-03-19'])
}

console.log('\n=== Merge: note is replaced when present ===')
{
  const existing = [{ date: '2026-03-05', weightKg: 70, note: 'old note' }]
  const incoming = parseWeighInList('5 Mar 2026 74.5 new note', TODAY).entries
  const { merged } = mergeEntries(existing, incoming)
  check('note replaced', merged[0]?.note, 'new note')
}

console.log('\n=== Realistic pasted notes list ===')
{
  const text = [
    'Weigh-ins',
    '',
    'March 2026',
    '5 Mar 2026 74.5',
    '12 Mar 2026 74.8',
    '19 Mar 2026 75.1 after gym',
    '',
    'April 2026',
    '2 Apr 2026 75.4',
    '9 Apr 2026 75.2',
    '',
    'some random line without numbers',
  ].join('\n')
  const r = parseWeighInList(text, TODAY)
  check('five entries', r.entries.length, 5)
  check('skipped the junk line', r.skipped.length, 1)
  check('junk reason', r.skipped[0]?.reason, 'No date found')
  check('last date', r.entries[4]?.date, '2026-04-09')
}

console.log('\n=== Month headings are ignored, not parsed as dates ===')
{
  const r = parseWeighInList(['March 2026', '5 Mar 2026 74.5'].join('\n'), TODAY)
  check('one entry', r.entries.length, 1)
  check('nothing skipped', r.skipped.length, 0)
}

console.log('\n=== A heading never steals the next line\'s weight ===')
{
  const r = parseWeighInList(['March 2026', '5 Mar 2026 74.5'].join('\n'), TODAY)
  check('weight correct', r.entries[0]?.weightKg, 74.5)
  check('date correct', r.entries[0]?.date, '2026-03-05')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
