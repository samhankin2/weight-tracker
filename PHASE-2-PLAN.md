# Phase 2 plan — Health suite (training tracker first)

**Status:** planning. Nothing in this document is implemented yet.
**Companion:** `PHASE-2-DATA-MODEL.md` (types, progression engine, phase 4 maths).

---

## 1. The suite

Four phases, one product, one PWA:

| Phase | Module | Purpose |
| --- | --- | --- |
| 1 | **Weight** (exists) | Bodyweight trend, 7-day average, goal, phases |
| 2 | **Training** | Exercise library, session logging, progressive overload |
| 3 | **Nutrition** | Natural-language food log, LLM council, calorie targets |
| 4 | **Insight** | Join the three: is the logging consistent with the scale? |

**Shape decision:** one PWA, one repo, shared core (design tokens, UI
components, storage helpers), each module in its own storage key with its own
schema version. Rationale: `localStorage` is origin-scoped, so separate
deployed apps could not see each other's data without a backend, and phase 4
is worthless if the three modules cannot talk.

**Repository naming:** keep the repo named `weight-tracker` for now — renaming
it changes the public Pages URL (`samhankin2.github.io/weight-tracker/`),
which breaks any bookmark and any shared link. The *product* can be renamed in
the UI without touching the repo. Deferred decision, revisit at phase 4.

---

## 1b. Codebase reuse map (from code survey, `file:line` refs)

### Reuse verbatim

| Area | Where | Note |
| --- | --- | --- |
| Tab pattern | `src/main.ts:22-28`, `102-122`, `190-216` | `TABS` registry + `switch` in `renderView`. No `default:` — TS catches an unhandled tab. |
| Tab bar CSS | `src/app.css:544` | `grid-template-columns: repeat(3, 1fr)` → becomes `repeat(4, 1fr)` |
| Store semantics | `src/appStore.ts:31-53` | `commit` → coalesced `setTimeout(0)` flush → save then notify. Keep exactly this behaviour. |
| Storage pattern | `src/store.ts:26-45`, `48-121` | try/catch → empty state; per-record validate + coerce on load. This is what survives hand-edited localStorage. |
| UI primitives | `src/ui/dom.ts`, `src/ui/components.ts` | `el`, `clsx`, `Icon`, `createSheet`, `Toast`, `confirm`, `SegmentedControl`, `StatTile`, `Badge`, `Chip`, `EmptyState`, `MetricCard` |
| Tokens + classes | `src/design/tokens.css`, `ui.css`, `app.css` | all domain-neutral: `.card`, `.stat-tile`, `.entry-*`, `.field-*`, `.button*`, `.sheet-*` |
| Chart helpers | `src/chart/weightChart.ts:107-159` (`readTheme`, `withAlpha`), `miniSparkline.ts:28` (`renderSparkline`) | theme + resize/destroy lifecycle and the sparkline are domain-agnostic |
| Date maths | `src/metrics.ts:65-99`, `src/format.ts:48-114` | `toISODate`/`fromISODate`/`addDays`/`daysBetween`/`today` — do not re-implement. `date-fns` is a dependency but imported nowhere. |
| Service worker | `public/sw.js` | unchanged — a single Vite bundle means training code is precached automatically. |
| Focus + a11y | `src/main.ts:160-188`, `src/ui/components.ts:53-195` | `data-focus-key` convention; sheet focus trap, Escape on document capture, focus restore. |

### Generalise (small, contained changes)

1. **`BigNumberInput` → generic numeric input** (`components.ts:365-518`). Today it
   is weight-specific: prop `valueKg`, aria-label `Weight in ${unit}`,
   class `.big-number-*`, input id prefix `weight-input-`. It also has **no
   `maxValue`** and **no validation** — `minValue` is only the stepper's floor
   when the field is blank, and range rejection lives in the caller
   (`logWeight.ts:157-181`). Reps (1-30, step 1) and load (0-500, step 2.5) both
   need a real max clamp. Add `label`/`ariaLabel`, `maxValue`, rename
   `valueKg` → `value`.
2. **`Store` → generic `PersistentStore<T>`** (`appStore.ts`). The class is not
   exported and its constructor hard-binds `loadState()`. Extract a generic
   factory taking `{load, save}` adapters; the existing `store` becomes an
   alias so `main.ts`/`dashboard.ts` keep compiling.
3. **`store.ts` → key-parameterised adapter.** Same read/normalise/save shape,
   second key `training:v1`. Never reuse `weight-tracker:v1`.
4. **FAB → per-tab action descriptor** (`main.ts:124-136`). The FAB is
   hardcoded to `Log weight`. Training needs its own primary action
   ("Start session"), and the FAB must not lie on the training tab.
5. **`weightChart.ts` → generic line chart**, or a new
   `src/training/exerciseChart.ts` that reuses the extracted `readTheme` /
   `withAlpha`. The current chart is coupled to the weight domain: dataset
   labels `'Weigh-in'`/`'7-day average'`, `point.weightKg` mapping, a ≥2 kg
   y-axis floor (`afterDataLimits`, `weightChart.ts:507-516`), weight-specific
   empty text and tooltips. A reps chart with a 1-30 axis needs none of that.
6. **Multi-step sheet Escape stack** (`components.ts:130-137`). Each sheet
   installs a document-level Escape listener in capture phase, so one Escape
   press closes *both* an inner sheet and its parent. The session logger will
   open `confirm()` dialogs (delete a set, discard session) from inside a
   sheet and will hit this. Needs a topmost-sheet check or a z-ordered stack.

### Write new

- `src/modules/training/` — types, store, progression engine, metrics.
- `src/views/training.ts` + `src/training/training.css` (set-row classes;
  the codebase has no generic row/tile abstraction).
- `SetRow` / `ExerciseRow` components — `.entry-row` is the only list pattern
  that exists.
- `src/ui/icons.ts` — no exercise/gym glyph yet; the icon union in
  `main.ts:24` needs widening.

### Traps a new module will trip over

1. **Full re-render on every store change** (`main.ts:160-188`). Any state a
   view uses must be read inside `render`; mutating state during render risks
   a loop. A live session timer must live in the view closure, not in state.
2. **Chart teardown contract** — the view must expose `__chart` on its root
   (`dashboard.ts:363`, consumed at `main.ts:186-187`) or Chart.js instances
   leak on every re-render.
3. **Silent save failures** — `saveState` returns false on quota/denied and
   callers ignore it (`appStore.ts:40,51`). A large training payload could
   vanish silently; the new adapter should check the boolean.
4. **Corrupt-load is silent** — `store.ts:26-45` returns an empty state on any
   parse error with no user-visible warning. Worth a one-time toast in the
   training store.
5. **Backup collision** — `importState` runs the *weight* `migrate()`, so
   pasting a training JSON into Settings would be silently "repaired" into an
   empty weight state rather than rejected. Guard it.
6. **`reset()` must not touch the other module's key** (`appStore.ts:175`
   hardcodes `version: 1` and keeps the profile — mirror that).
7. **`erasableSyntaxOnly`** (`tsconfig.json:13,18-20`) bans `enum` and
   constructor parameter properties — use union types and `const` objects. My
   data model already uses string unions.
8. **`verbatimModuleSyntax` + `noUnusedLocals`** — `import type` for
   type-only imports; an unused import fails the build.
9. **Duplicate implementations** — `renderSparkline` (`miniSparkline.ts:28`)
   vs the private copy in `components.ts:212-242`; `.button`/`.app-shell`
   defined in both `ui.css` and `app.css`. Use `renderSparkline`; do not add a
   third copy of anything.
10. **No URL routing** — `activeTab` is in-memory only (`main.ts:35`), so
    there is no back button and a reload lands on the dashboard. Do not build
    a router for phase 2.
11. **PowerShell `Set-Content` corrupts source files** — use the edit/write
    tools (HANDOFF.md:155-159).

---

## 2. Phase 2 — Training tracker

### Goal
Log a gym session in under five seconds per set, and always know what the next
target is for every lift.

### Scope

**In:**
- Exercise library: seeded with common movements, custom exercises, search,
  categories, muscle tags.
- Session logger: the core interaction — add sets, edit reps/load/RPE, mark
  complete, survive accidental navigation or reload.
- Progression engine: per-exercise rule, next-target guidance, deload
  detection, warmup suggestions for barbell work.
- History: per-exercise load/reps/e1RM trend, personal records, weekly volume
  per muscle group.
- Routine templates (e.g. Push/Pull/Legs) and a "today" view.

**Out (phase 2, deliberately):**
- Nutrition, energy balance, anything phase 4 needs from phases 1 and 3.
- Video/photo capture of form.
- Wearable import (Apple Health, Google Fit) — no API keys, no value here.
- Anything gamified: no XP, no levels, no confetti. The app stays a quiet
  instrument.

**Deferred to phase 2.1 (specified, not built):** the rest timer, plate
breakdown sheet, Push/Pull/Legs starter routines, undo on a saved set,
"Repeat workout", "Save as routine", per-muscle weekly volume stats, and the
Load/Reps/e1RM metric switcher on the exercise trend chart. The rest timer is
the one deferral most likely to move into phase 2 proper — it is a genuine
gym-loop feature and the specification is complete — but it costs screen-off
behaviour that is easier to get right once the logger is solid.

### Work breakdown

| # | Unit | Done when |
| --- | --- | --- |
| 2a | **Refactor groundwork.** Extract generic `PersistentStore<T>` from `appStore.ts`; make `store.ts` key-parameterised; generalise `BigNumberInput` (label, `maxValue`, `valueKg`→`value`); add a Training tab + per-tab FAB descriptor | Existing weight tracker unchanged in behaviour; a `training:v1` store round-trips a payload |
| 2b | **Types + library.** `src/modules/training/types.ts`, normaliser, exercise CRUD, search, categories, seed list, default progression rule | Can create, rename, archive, search exercises; a corrupt payload loads empty without breaking the app |
| 2c | **Session logger.** Set entry, steppers, RPE, complete/skip, draft survives reload | A full session can be logged on a phone without pinching or typing |
| 2d | **Progression engine.** Pure module + next-target card. Load modes: `total`, `per-dumbbell`, `added`, `bodyweight`, `assistance`, locked once sets are logged | Engine unit tests pass; target matches the decision table in the data-model doc |
| 2e | **History.** Per-exercise trend chart, personal bests, recent sessions | Chart renders with real data; personal best detected on a new best e1RM |
| 2f | **Templates + today view.** Push/Pull/Legs split runs end to end | A template produces a session you can log against |
| 2g | **Polish.** a11y pass, dark mode, empty/error states, copy | Meets the accessibility commitments in `HANDOFF.md` |

**Cross-cutting:** the session logger is the most focus-sensitive surface in the
app, so every control in it gets a unique `data-focus-key`. Nested `confirm()`
dialogs inside the logger need the topmost-sheet Escape fix before 2c ships.

### Verification policy (deliberately light)

Per your instruction not to QA to the nth degree:
- Gate is `npm run build` green (tsc + Vite).
- Pure logic (progression engine, volume maths) gets unit tests — cheap,
  fast, and the only place a silent wrong number hides.
- The session logger is verified by hand on a real phone, not by an automated
  browser script. A smoke script for it would cost more than it returns.
- No re-running the existing deployed-site verification unless something
  structural changes.

---

## 3. Phase 3 — Nutrition (shape agreed, detailed plan later)

Decisions already taken: **pure LLM council, no food database**, and **direct
browser calls to providers, keys stored on the device**.

Design consequences to build in, because they are what makes model estimates
usable rather than decorative:

- **Two or three different vendors, not three times the same model.** A
  council of near-identical models is one model with extra latency. Genuine
  diversity (different families) is the point.
- **Temperature 0, structured JSON output** per item: kcal, protein, carbs,
  fat, grams, confidence.
- **Agreement threshold.** If the council's answers fall within tolerance,
  accept. If they do not, escalate to a third model as adjudicator and mark
  the entry **low confidence**.
- **Show the spread, do not average it away.** The UI states the range and
  which model dissented. A number with visible disagreement is more honest
  than a confident midpoint.
- **Cache by (description, portion)** so re-logging "usual breakfast" is
  instant and stable.
- **The correction loop.** Log the raw council output for every entry. When
  you correct an entry, the corrected value becomes the anchor for that
  description next time — so the app's accuracy improves from your own
  corrections instead of drifting on fresh estimates.
- **Key storage:** device-local, never in a build-time env var (a Vite env var
  is baked into the shipped JS and is therefore public). No key leaves the
  device except in the request to the provider.

Provider choice is a phase 3 research task: which vendors allow browser-direct
CORS calls, and their free-tier behaviour for personal use.

---

## 4. Phase 4 — Insight

Reads all three stores. The honest version of "am I counting correctly":

- Estimated intake from logged food, vs intake implied by the weight trend
  over 28 days.
- Training expenditure included in the model, with its method named on screen.
- Output phrased as *consistency*, never as a verdict: the app cannot
  distinguish mis-logged food from genuinely changed expenditure, and must not
  pretend otherwise. Confounders named: scale noise, glycogen and water
  shifts, cycle-related water retention.
- Below 14 days of data, the app says it is not ready rather than guessing.

---

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| Session logger ergonomics are the hardest unknown — chalky hands, one thumb, phone in hand | Design it against the real phone early; 2c is a prototype-first unit |
| The logger is the most focus-sensitive surface in the app, and the app re-renders on every store change | Every logger control gets an explicit `data-focus-key`; never mutate state during a render |
| Existing `weightChart.ts` is domain-coupled to body weight | Generalise to a small parametrised chart rather than duplicating Chart.js setup |
| Weekly muscle-volume stats need an exercise → muscle map | Curated seed map for common exercises, user-editable tags for custom ones |
| Rest timer with the screen off is a platform rabbit hole | Explicitly out of scope until the logger is solid; wake-lock is the sane answer |
| Council estimates drift over time | The correction loop above turns your corrections into anchors |

---

## 7. Where the design meets the code

Notes from reconciling the UX spec against the code survey. Each of these is
a small, deliberate deviation or addition — nothing here is a surprise.

1. **The logger is a full-screen view, and there is no router.** The app has
   an in-memory `activeTab` (`main.ts:35`) and no URL routing. The logger
   therefore needs a view-state flag alongside `activeTab` — e.g. a
   `loggerOpen` boolean in the app shell, not a route.
2. **"Reload restores into the logger" needs persistence, not just state.**
   Because the tab is in-memory only, a reload currently lands on the
   dashboard. Restoring into the logger means the draft's presence is the
   signal: if `activeDraft` exists on load, open the logger directly and
   show **Workout restored.**
3. **The four-tab bar needs `repeat(4, 1fr)`** (`app.css:544`) and a new
   glyph in `src/ui/icons.ts`. Tab order becomes Trend · Training · History ·
   Settings, which shifts the existing History tab's position — worth doing
   now rather than after muscle memory forms.
4. **"Weight history" as the accessible name** for the existing History tab
   is a genuine improvement for screen readers and costs one string change.
5. **The FAB becomes a per-tab descriptor** rather than a second FAB, per the
   explorer's finding that the current FAB is hardcoded to `Log weight`
   (`main.ts:124-136`).
6. **The rest timer's absolute end timestamp** (`restEndsAt`) is what makes it
   survive a screen-off suspension, and the "tick must not commit to the
   store" rule in the data-model doc is what keeps it from re-rendering the
   whole app every second.
7. **The exercise trend chart reuses the existing chart-window control
   pattern** (`focusKey: 'chart-window'`) for its 30d/90d/6mo/1y/All range
   control, and needs the generic line-chart factory rather than the
   weight-coupled `weightChart.ts`.
8. **Load-mode locking** is a data-model rule (see the data-model doc), not a
   UI-only guard, so it survives import/export round-trips.
9. **The designer's "no `Weight` inside Training" rule** also implies the
   existing History tab's copy stays as it is — no mass rename. Scope the
   terminology change to the Training module only.
10. **"View chart data" as a table** is a new capability; the existing weight
    chart has no equivalent. Cheap to add with the generic chart, and it is
    the accessible fallback for the trend data.

## 6. Open decisions

Resolved during planning:

- **Seed exercise list** — seed both a curated exercise list (~40 common
  movements) and the Push/Pull/Legs starter routines. Seeding removes the
  "add your first exercise before you can log anything" tax on day one, which
  is exactly the kind of friction that kills a tracker. Starter routines are
  marked phase 2.1.
- **Rest timer** — phase 2.1, not phase 2. The specification is complete; the
  screen-off behaviour is the risky part.
- **Set-entry order** — chronological. Completed sets append to the bottom of
  the list and the *current* set is always the next one, displayed in the
  set card at the top. Newest-first would fight the muscle memory of reading
  a plan top to bottom.
- **Can a session stay open overnight** — yes. The draft persists with no
  expiry, and reopening restores the logger at the same set. This falls out of
  the draft model rather than needing special handling.

Still open:

- [ ] Does the training dataset need its own export, or does the weight
      export grow a second section? (The weight importer currently *repairs*
      unknown payloads into an empty weight state, so training JSON needs a
      guard either way.)
- [ ] Seed exercise list contents — worth doing against a real rack photo
      rather than from memory, so the body areas match the exercises you
      actually own.
- [ ] **Phase 4 needs age and sex for BMR, and the profile has neither.**
      The weight tracker stores Starting weight, Goal weight and Height only.
      Mifflin-St Jeor needs age and sex; without them phase 4 has to fall
      back to a rougher formula and say so. Decide whether to add profile
      fields now (a small change to the weight app's Settings) or accept a
      cruder model in phase 4.
- [ ] Whether bodyweight and assisted exercises need a `bodyweightKg` factor
      to make e1RM meaningful, or whether suppression is acceptable.

Resolved during implementation:

- [x] **Category vocabulary.** The exercise sheet now asks for a single
      **body area** (Chest / Back / Legs / Shoulders / Arms / Core / Other);
      `muscles` and the internal `category` are derived from it. The chips,
      the row labels and the future volume stats now share one source of
      truth.
