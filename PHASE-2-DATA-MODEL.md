# Phase 2 — Training module: data model & progression engine

**Status:** draft spec, not yet implemented.
**Storage:** independent key `training:v1` (own schema version), sibling of
`weight-tracker:v1`. The two stores stay decoupled; phase 4 reads both.

---

## 1. Entities

```ts
type ExerciseId = string

type LoadMode =
  | 'total'          // barbell / machine total resistance
  | 'per-dumbbell'   // the number entered is one dumbbell
  | 'added'          // added to bodyweight (dumbbell curls, weighted pull-ups)
  | 'bodyweight'     // no load
  | 'assistance'     // assisted; lower is harder

type BodyArea = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'other'

interface Exercise {
  id: ExerciseId
  name: string                  // "Bench press"
  bodyArea: BodyArea            // user-facing; the library's chips filter on this
  category: 'push' | 'pull' | 'legs' | 'core' | 'cardio' | 'mobility' | 'other'
  equipment?: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'band' | 'other'
  muscles: string[]             // derived from bodyArea; drives weekly volume stats
  loadMode: LoadMode            // locked once sets have been logged
  loadStepKg: number            // default increment, normally 2.5
  restSec: number               // default rest after a working set
  progression: ProgressionRule  // how load advances for this lift
  archived?: boolean            // hidden from pickers, history retained
  createdAt: string             // YYYY-MM-DD
}

interface ProgressionRule {
  kind: 'reps-then-load' | 'reps-only' | 'manual'
  repMin?: number               // lower bound of working rep range
  repMax?: number               // upper bound of working rep range
  incrementKg?: number          // load step (e.g. 2.5)
  targetRpe?: number            // RPE ceiling for "rep range achieved cleanly"
  deloadOnMiss?: boolean        // drop load if repMin not reached
}

interface WorkoutSession {
  id: string
  date: string                  // YYYY-MM-DD, local calendar
  templateId?: string
  name?: string                 // "Push A"
  notes?: string
  exercises: SessionExercise[]
  startedAt?: number            // epoch ms — for duration
  endedAt?: number
}

interface SessionExercise {
  exerciseId: ExerciseId
  nameSnapshot: string          // survives deletion/rename of the exercise
  loadModeSnapshot: LoadMode    // survives a load-mode change (mode is locked anyway)
  notes?: string
  sets: SetEntry[]
}

interface SetEntry {
  reps: number
  weightKg: number
  rpe?: number                  // 6..10
  setType?: 'warmup' | 'working' | 'drop' | 'failure'
  completed?: boolean           // false = logged but abandoned
}

interface RoutineTemplate {
  id: string
  name: string                  // "Push A"
  exercises: RoutineExercise[]
}

interface RoutineExercise {
  exerciseId: ExerciseId
  targetSets: number
  repMin: number
  repMax: number
  restSec: number
  startLoadKg?: number          // optional starting load for the first session
  loadStepKg?: number           // override of the exercise's step for this routine
}

interface TrainingState {
  version: number
  exercises: Exercise[]
  sessions: WorkoutSession[]
  templates: RoutineTemplate[]
  activeDraft: WorkoutDraft | null
  settings: {
    defaultRestSec: number
    restTimerEnabled: boolean
  }
}
```

### The in-progress draft

```ts
interface WorkoutDraft {
  session: WorkoutSession        // startedAt set; endedAt unset
  currentExerciseIndex: number
  currentSetIndex: number
  restEndsAt?: number            // epoch ms — absolute, so a suspended
  restRemainingSec?: number      // app survives a screen-off pause
  restPaused: boolean
  startedAt: number
}
```

The draft is persisted in the same `training:v1` payload. It is **not** a
finished session: it never appears in history until Finish moves it there, and
Discard removes only the draft. Reload restores it and returns to the logger
at the same set.

**Timer rule:** `restEndsAt` is an absolute timestamp, and the visible
countdown is recomputed from `Date.now()` on each tick. The tick must update
**only the timer's text node** — committing it to the store would re-render the
entire app once a second. The same applies to the elapsed-workout clock.

### Body area, muscles and category

The exercise sheet asks for one thing: the **body area**. Everything else is
derived, so the library's chips, the row labels and the volume stats can never
drift apart.

| Body area | `muscles` | `category` |
| --- | --- | --- |
| chest | `['chest']` | push |
| back | `['back']` | pull |
| legs | `['legs']` | legs |
| shoulders | `['shoulders']` | push |
| arms | `['biceps', 'triceps']` | pull |
| core | `['core']` | core |
| other | `[]` | other |

`category` is the coarse internal grouping only — it is never shown to the
user, and it keeps `cardio` / `mobility` available for later work. The library
row label is derived from `muscles` using the same table the chips filter on,
so an Arms exercise reads **Arms**, never **Biceps**.

### Load mode and record eligibility

`loadMode` is chosen at exercise creation and **locked once any set has been
logged** for that exercise, because changing it would silently invalidate
every historical comparison.

Estimated 1RM is only computed when `loadMode` is `total` or `per-dumbbell`.
It is suppressed for `added`, `bodyweight` and `assistance`, where the
entered number is not total resistance.

**Rules inherited from the existing codebase:** weights in kg only; dates are
local `YYYY-MM-DD` strings, never `Date` objects; ids are generated strings.

---

## 2. Progression engine (pure, unit-testable)

Module `src/modules/training/progression.ts`. No DOM, no storage — same
discipline as `metrics.ts`.

### 2.1 Suggested next session

```ts
suggestNext(exercise, history, rule): {
  loadKg: number
  repTarget: number
  repRange: [number, number]
  warmups: { weightKg: number; reps: number }[]
  action: 'increase' | 'hold' | 'deload' | 'manual'
  rationale: string             // one calm sentence, shown in the UI
}
```

Decision logic, `reps-then-load` kind (default):

| Last session | Condition | Action |
| --- | --- | --- |
| completed working sets | reps == `repMax` on all sets | **increase** load by `incrementKg`, reset target reps to `repMin` |
| completed working sets | reps within range | **hold** load, target one rep above the best set last time, capped at `repMax` |
| completed working sets | any set RPE > `targetRpe` | **hold** load, target the same reps (RPE-limited day) |
| missed | reps < `repMin` on any set, or RPE at ceiling with `deloadOnMiss` | **deload** by `incrementKg`, target `repMin` |

`reps-only`: load never changes; the target rep advances by one per session
up to `repMax`. `manual`: no suggestion; `action: 'manual'` and the UI shows
**Target set manually** with the last session's performance for reference.

An RPE-driven rule (`rpe`) was considered and dropped from the first ship —
it adds a second axis of judgement for little gain at this stage.

**Precedence note:** the design's guidance text ("Reach 10 reps on all 4 sets,
then try 62.5 kg") is derived from the rule, so the rationale string is
generated from the engine rather than hard-coded in the UI.

### 2.2 Warmup sets

Barbell work gets suggested warmups from the target load: 40% x 10, 60% x 5,
80% x 3 (rounded to the nearest plate increment). Machines and dumbbells get
none by default.

### 2.3 PR detection

- e1RM (Epley) = `weightKg * (1 + reps / 30)`.
- Only count sets with `reps <= 12` for e1RM; beyond that the estimate is noise.
- A PR is a new best e1RM for that exercise (and optionally a new best at a
  specific rep count — e.g. "5 reps at 100kg").

### 2.4 Volume

- Tonnage per session = sum(`weightKg * reps`).
- Weekly volume per muscle = sum over exercises containing that muscle.
  Reference band to display: 10-20 sets per muscle per week (set count, not
  tonnage — show set count as the primary number, tonnage secondary).

---

## 3. Phase 4 formulas (for the integration module, not phase 2)

These live in a later module but the training data must support them now.

- **BMR** — Mifflin-St Jeor: `10*kg + 6.25*cm - 5*age + (5 male | -161 female)`.
  The weight app's profile currently stores Starting weight, Goal weight and
  Height — **no age and no sex** — so this needs new profile fields before
  phase 4, or a cruder fallback that states its method on screen.
- **Exercise expenditure** — per-session expenditure estimated from tonnage:
  a rough `kcal ≈ tonnage_kg * 0.5` is too crude to trust; instead use
  MET-hours per session category, scaled by body mass, and expose it as an
  *estimate with a stated method*, never as a precise number.
- **Implied intake** — over a window of N days:
  `intake ≈ TDEE + (Δweight_kg * 7700 * -1 / N)`.
  7700 kcal/kg is the standard approximation for mixed tissue.
- **The comparison** — logged intake vs implied intake. The gap is the
  "am I counting right" signal.
- **Honesty constraints** (must appear in the UI copy, not just the docs):
  the app cannot distinguish "I mis-logged food" from "my true expenditure
  changed". So the output is phrased as *consistency between what you logged
  and what the scale says*, never as a verdict on the user. Weight noise,
  glycogen/water shifts and menstrual-cycle water retention are named as the
  likely confounders.
- **Window**: default 28 days, with a minimum of 14 days before the app is
  willing to show a gap at all.

---

## 5. Implementation notes tied to the existing codebase

- **`BigNumberInput` must be generalised first.** It is currently
  weight-specific (`valueKg`, `Weight in ${unit}` aria-label, `.big-number-*`
  classes, `weight-input-` id prefix) and has **no `maxValue`** and **no
  internal validation** — `minValue` is only the stepper's starting floor when
  the field is blank, and range rejection is done by the caller
  (`logWeight.ts:157-181`). Reps and load both need a real max clamp.
- **The engine takes `weightKg` in kilograms and never converts.** `SetEntry`
  is `{ reps, weightKg, rpe? }` — the unit lives in the type name so it cannot
  be confused with body weight at a call site.
- **RPE is a number, not an enum.** `erasableSyntaxOnly` is on, so
  `setType` and any RPE scale are union types and `const` objects, never
  `enum`.
- **`data-focus-key` on every logger control.** The app re-renders the whole
  view on every store change; a control without a unique key loses focus
  mid-set. Two controls sharing a key means focus jumps to the first.
- **Ids:** `ExerciseId` / session id / set id are generated strings, never
  array indices — entries get reordered and deleted.
- **Dates:** `YYYY-MM-DD` local-calendar strings throughout, using
  `toISODate`/`fromISODate`/`addDays`/`daysBetween`/`today` from `src/metrics.ts`.
  Never `Date` objects, never `new Date(string)` without care.

---

## 6. Open items in this spec

- [x] Confirm which profile fields the weight tracker already stores (height,
      age, sex) — the weight app's Settings has Starting weight, Goal weight
      and Height only. **No age or sex field exists**, so Mifflin-St Jeor BMR
      needs either a new profile field or a different (and more approximate)
      approach in phase 4. This is a phase 4 blocker, not a phase 2 one.
- [x] Decide the exercise → muscle mapping — a single user-facing **body
      area** per exercise, with muscles and category derived from it (see
      above). No separate curated muscle map is needed for filtering; only
      phase 4's volume stats depend on how precise the tagging has to be.
- [ ] Rest timer behaviour with the screen off (wake lock vs background timer).
      Deferred to phase 2.1.
- [ ] Whether warmup sets are logged as real sets (affects volume stats — they
      should be excluded from working-volume totals).
