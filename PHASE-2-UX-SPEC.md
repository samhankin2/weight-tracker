# Phase 2 — Training module: UX specification

**Status:** design spec, not yet implemented.
**Scope markers:** `[C]` = core phase 2, `[L]` = later (phase 2.1+). Everything
marked `[L]` is specified but explicitly out of the first ship.

---

## 1. Product direction

Training should feel like another use of the same quiet instrument, not a
separate fitness app.

- Reuse the existing warm surfaces, teal accent, tabular figures, 1px borders,
  soft shadows, 16px cards, bottom sheets, restrained motion.
- Optimise for a returning user mid-workout: **open logger → adjust if needed
  → Complete set**. With routine defaults prefilled, logging a set takes two
  taps from Training Home, including starting the workout.
- No celebratory animations, achievement badges, scores, streak pressure, or
  progress bars for overload.
- Guidance is factual: previous performance, the next target, and the
  condition for increasing load.
- One active workout per device. Everything works offline and is included in
  export/import/reset.

---

## 2. Navigation and screen inventory

### Main navigation

Four bottom tabs, in this order: **Trend · Training · History · Settings**.

"History" remains body-weight history. Give its heading and accessible
navigation name **"Weight history"** so it is not confused with training
sessions.

Within Training, a four-option segmented control:
**Today · Routines · Exercises · Sessions**.

### FAB behaviour `[C]`

Do not add a second, concurrent FAB. Reuse the existing FAB with an explicit,
context-dependent action:

| Location | FAB action | Accessible name |
| --- | --- | --- |
| Trend, weight History, Settings | Existing weight sheet | **Log weight** |
| Training, no active workout | Start the up-next routine; start empty if no routine | **Start Push** / **Start empty workout** |
| Training, active workout minimised | Return to the logger | **Resume workout** |
| Active session logger | Hidden | — |

Routine cards and the Today card also have visible start buttons, so the FAB
is never the only route. The weight FAB remains usable outside Training;
opening the weight sheet does not disturb the workout.

### Screen inventory

| Screen/overlay | Scope |
| --- | --- |
| Training — Today | `[C]` |
| Active session logger | `[C]` |
| Session overview sheet | `[C]` |
| Edit set sheet | `[C]` |
| Finish workout sheet | `[C]` |
| Routines | `[C]` |
| Routine editor | `[C]` |
| Exercise library | `[C]` |
| New/edit exercise sheet | `[C]` |
| Exercise detail (next target, records, trend) | `[C]` |
| Sessions | `[C]` |
| Session detail | `[C]` |
| Plate breakdown sheet | `[L]` |

---

## 3. Training — Today `[C]`

1. **Header** — H1 **Training**. No motivational subtitle or streak summary.
2. **Active workout card** (when applicable) — label **Workout in progress**,
   routine name, elapsed time, completed working sets, e.g.
   **Push · 24:18 · 7 of 18 sets**. Primary 56px button **Resume workout**,
   secondary text button **View workout**.
3. **Up next card** — label **Up next**, routine name, **5 exercises · Last
   done Monday**, exercise preview, primary 56–64px **Start Push**, secondary
   **Choose routine**. "Up next" is a suggestion based on routine order and
   least-recent completion — not a schedule. Never label it "Due" or mark
   missed days.
4. **Quick action** — secondary full-width **Start empty workout**.
5. **Recent session** — one compact card: **Pull · Friday · 48 min · 17
   sets**, plus **View all sessions**.

**Empty states:** no routines → **No routines yet** / **Create a routine or
start an empty workout.** / **Create routine** / **Start empty workout** /
optional quiet starter **Use Push / Pull / Legs** `[L]`. Routines but no
finished sessions → omit the Recent panel rather than showing a second empty
panel. No useful up-next → show **Choose a routine** instead of guessing.

**Accessibility:** the Up next card is a labelled region, not one giant
button; Start and Choose stay distinct. Active-workout info is not announced
every minute. The resume strip has one action and does not trap focus.

---

## 4. Active session logger `[C]`

A dedicated full-screen view, not a sheet. Hide the FAB and the bottom tab
bar while it is open. The header provides an explicit way back that does not
cancel the workout.

### A. Sticky header

- Leading back icon, 48px, accessible name **Back to Training; workout stays
  active**.
- Centre: routine name **Push**, small tabular text **24:18 elapsed**.
- Trailing 48px-minimum button **Finish** (accessible name **Finish
  workout**).

The workout continues while minimised. Navigation never prompts to save —
changes are already persisted.

### B. Rest strip `[L]`

Appears beneath the header only when rest is running, paused, or newly
completed. See section 7.

### C. Exercise heading

- Small text **Exercise 1 of 5**
- H1/H2 **Bench press**
- Text button **Exercises** opens the session overview
- Optional menu **Exercise options**: change target, replace exercise, remove
  from this workout. Removing requires confirmation only if it holds completed
  sets.

### D. Prior performance and guidance

A quiet bordered card, no progress indicator:

> **Last time**
> 60 kg × 8, 8, 8, 7
>
> **Next target**
> 60 kg × 8–10 reps
> Reach 10 reps on all 4 sets, then try 62.5 kg.

When the target is set-specific, lead with **Target for this set: 60 kg × 9
reps**. No red treatment for a lower performance, no "failed" state.

### E. Current set card

Header row: **Set 2 of 4**, optional plain badge **Warm-up** / **Working
set**, text button **Add set**.

Two large stepper rows follow.

**Reps** — `[ − ] [ 8 ] [ + ]`

- Minus/plus controls 64px high, ≥56px wide.
- Central value directly editable with a numeric keyboard.
- Step is 1 rep. Press-and-hold repeats, matching the existing weight
  steppers (425ms to start, 75ms repeat).
- Accessible names: **Decrease reps by 1** / **Bench press, set 2, reps** /
  **Increase reps by 1**.

**Total load (kg)** — `[ − ] [ 60.00 ] [ + ]`

- Same anatomy and visual grammar as the existing big-number input, arranged
  in compact rows rather than the weigh-in sheet's tall single-number layout.
- Default step comes from the exercise, normally **2.5 kg**.
- Beneath the label, a 44px-minimum text button **2.5 kg steps** opening
  **0.25, 0.5, 1, 2.5, 5 kg**. This makes 0.25 kg increments available
  without making ordinary increases require ten taps.
- Direct entry accepts quarter-kilogram values.
- Do **not** apply the weigh-in sheet's missing-decimal auto-correction here:
  silently reading 600 as 60 would be unsafe.
- Zero load is valid for bodyweight exercises; zero reps is not a completable
  set.

For a barbell exercise, a factual plate hint beneath the load:
**20 kg bar + 20 kg each side**, also a button labelled **View plate
breakdown** `[L]`.

Other load modes change the visible label: **Load per dumbbell (kg)**,
**Added load (kg)**, **Assistance (kg)**. Assistance means lower is harder, and
ordinary e1RM must not be computed from it.

Never use the unqualified word "Weight" inside Training.

### F. Completed sets

A compact textual list, not a row of colour-only check circles:
**Set 1 · 60 kg × 8 · Done** with an **Edit** button. At 360px older sets
collapse behind **1 completed set · View**. The current set stays visible
without scrolling on the baseline viewport.

### G. Sticky primary footer

Full-width 64px primary button above the safe-area inset: **Complete set**.
Secondary 48px **Add exercise** where space permits. The primary footer never
moves when values change.

### Completing a set

1. The next set is prefilled from the routine target or the corresponding
   previous set.
2. Tap plus/minus only if actual performance differs.
3. Tap **Complete set**.
4. The set is committed locally before any success state.
5. Focus stays on **Complete set**.
6. A polite status message announces **Set 2 saved — 60 kg, 10 reps.**
7. Rest starts automatically if enabled.
8. The next set appears immediately, prefilled — normally the same load, with
   target reps from the progression rule.
9. After an exercise's final set, advance and announce **Bench press complete.
   Next: Overhead press, set 1 of 3.**
10. After the workout's final set, open the Finish review. Never silently
    finish on the same tap.

**Undo** is available in the saved-set feedback for five seconds `[L]`;
undo restores the set as current and cancels the newly started rest. A
failure to save must not display "saved" or advance as though the data were
secure.

### Adding sets and moving around

- **Add set** inserts an extra set after the exercise's planned sets, copying
  the previous set's load and reps as a starting point.
- A completed set's **Edit** opens the standard bottom sheet with the same
  large controls.
- **Exercises** opens the session overview: routine exercise order, per
  exercise **2 of 4 sets complete**, current exercise marked with text and
  icon, tap to make current, **Add exercise** at the bottom.
- Jumping around does not mark skipped sets complete.
- No swipe-only navigation, no drag-only reordering.

### Persistence and recovery

Persist on every completed set and every meaningful draft edit: active routine
and exercise order, current exercise and set, entered reps and load, completed
sets, start time and elapsed-time basis, rest end timestamp or paused
remaining, per-set progression and load-step overrides.

- Switching tabs or opening Log weight minimises the logger.
- Reload restores directly into the active logger with a single status
  **Workout restored.**
- If restoration happens after rest expiry, show **Rest complete**, not a
  stale countdown.
- Starting another workout while one exists offers **Resume workout** and
  **Discard workout**; never silently replace it.
- Draft workouts do not appear as finished sessions. Finish moves the draft
  into session history; Discard removes only the draft.

### Logger states

- First use, no prior performance: omit Last time, show **Set a starting
  load and rep target.** Never invent a starting load.
- No completed sets: the Finish review says **No completed sets yet** and
  offers only **Keep training** or **Discard workout**.
- Invalid value: inline message beside the field, with `aria-invalid` and a
  described error — **Enter reps between 1 and 100.** / **Enter a load
  between 0 and 1000 kg.** / **Use quarter-kilogram increments.**
- Storage error: persistent banner — **Couldn't save on this device. Keep
  this tab open; your latest changes may be lost if you close it.** Actions
  **Retry**, **Export backup**.
- Offline: no warning; logging remains fully available.

### Logger accessibility

- Do not autofocus a numeric field on entry — the keyboard must not cover the
  logger.
- All labels carry exercise and set context for screen readers.
- Debounce stepper announcements during press-and-hold; do not announce every
  repeated increment.
- Rest ticks and elapsed time are not live regions.
- Completed-set, exercise-change, save-error and rest-complete events use a
  polite status region.
- Destructive actions alone use red.
- Current/completed state always includes text or a check icon, never colour
  alone.
- Stable focus identities are required for steppers, numeric inputs, Add set,
  Complete set and exercise navigation across whole-view re-renders.

---

## 5. Routines and routine editor `[C]`

### Routines screen

H1 **Routines**, 48px button **New routine**. Each routine card: name
(**Push**), **5 exercises**, **Last done Monday** or **Not used yet**, an
exercise summary, **Start** and **Edit** buttons. Do not make the whole card
clickable when it contains several actions.

Empty state: **No routines yet** / **Save the exercises and targets you use
often.** / **Create routine** / **Use Push / Pull / Legs** `[L]`.

### Routine editor

Sheet on mobile, centred dialog on larger screens.

1. **Routine name**
2. **Exercises** — reorderable rows: exercise name, **4 sets · 8–10 reps · Rest
   90 s**, **Move up**, **Move down**, **Edit**, **Remove**
3. **Add exercise**
4. Per-exercise editor: number of sets, target rep range, optional starting
   load, rest duration, optional routine-specific target override
5. Footer: **Cancel**, **Save routine**

Defaults for a newly added exercise: 3 sets, the exercise's default rep range
(initially 8–12), the exercise's load step (initially 2.5 kg), 90 seconds
rest, reps-then-load progression.

Deleting a routine: **Delete "Push"?** / **The routine will be removed. Your
past workouts are kept.** / **Delete routine**.

**Accessibility:** reordering uses explicit buttons — drag handles may be
supplementary only. Announce **Bench press moved to position 2 of 5.** The
exercise editor sheet traps and restores focus to that exercise's Edit button.
Validation appears beside Routine name or the relevant target field.

---

## 6. Exercise library and custom exercises `[C]`

### Library layout

1. H1 **Exercises**
2. Button **New exercise**
3. Search input with a persistent accessible label **Search exercises**
4. Horizontally wrapping category chips: **All · Chest · Back · Legs ·
   Shoulders · Arms · Core**
5. Result count in quiet text: **24 exercises**
6. Rows sorted by recent use, then alphabetically: **Bench press** /
   **Chest · Barbell** / **Last: 60 kg × 8** / optional **Next: 60 kg × 9**
7. Tapping the row opens Exercise detail
8. When invoked from an active workout, each row also has a distinct 48px
   button **Add Bench press to workout**

**Search states:** no matches → **No exercises found** / **Try a different
name or category.** / **Create "[search text]"** when the text is non-empty.
Library failure is a data error, not a network error — preserve the search
text and show the global recovery message.

### New/edit exercise sheet

Title **New exercise** / **Edit exercise**. Fields: **Exercise name**,
**Category**, **Equipment**, **Load entry** (total load / load per dumbbell /
added load / bodyweight only / assistance), **Default load step**,
**Progression** (**Reps, then load** default / **Reps only** / **Manual
target**), **Target rep range** (minimum and maximum reps), **Rest after set**.
Footer **Cancel**, **Save exercise**.

Explanatory text for the default: **Increase reps within the range. When every
set reaches the top of the range, increase the load next time.**

Do not silently alter past comparisons if the load mode changes. Once an
exercise has logged sets, lock its load mode and explain: **Load entry can't
change after sets have been logged. Create a new exercise to track it
differently.**

Duplicate-name validation: **An exercise with this name already exists.**

Deleting a custom exercise does not erase workout history — past sessions
retain its name and values.

**Accessibility:** the search field has a real label, not placeholder-only
naming. Category chips expose pressed state. The result count is announced
politely after a debounce, not on every keystroke. Add buttons include the
exercise name to avoid duplicate accessible names. New exercise opens with
focus on Exercise name; close restores focus to **New exercise**.

---

## 7. Rest timer `[L]`

Include an optional rest timer, but as a slim non-modal strip in the logger,
not a separate screen. Default 90 seconds after each completed working set,
using the exercise or routine rest setting; warm-up sets may have a shorter
default. Do not start rest after the workout is finished.

- Running: **Rest 01:28** · **Pause rest** · **+30 s** · **Skip rest**
- Paused: **Rest paused 01:28** · **Resume rest** · **+30 s** · **Skip rest**
- Expired while open: **Rest complete** · **Dismiss**

Completing another set replaces the old interval with the new one. **Skip
rest** dismisses only the timer — it never skips a set, and the label must
never be shortened to "Skip".

**Screen-off behaviour:** use an absolute end timestamp, not a count of timer
callbacks. Phone browsers may suspend JavaScript when the screen is off; on
reopening, calculate from the current time and show the correct remaining
duration or **Rest complete**. Do not promise a reliable alarm or vibration
while the PWA is closed or the phone is locked. Default is silent; an optional
completion vibration applies only while the app is active and enabled. No
persistent pulsing animation.

Settings copy: **Rest timer** / **Rest alerts work while the app is open. Your
phone may pause timers when the screen is off; the time is corrected when you
return.**

**Accessibility:** the display has an accessible name such as **Rest time
remaining: 1 minute 28 seconds**, but is not live. Announce **Rest complete**
once. Every timer control is at least 48px and explicitly named.
Reduced-motion mode removes all timer transitions.

---

## 8. Progressive overload, records and trends `[C]`

### Next-target rules

Default rule: **Reps, then load**. For a routine of 4 sets at 8–10 reps with
a 2.5 kg increment:

- If the previous session did not reach 10 reps on every set, keep 60 kg and
  target one additional rep on the next relevant set, capped at 10.
- If all 4 sets reached 10 reps, the next target becomes **62.5 kg × 8 reps**.
- Actual values never change automatically after a set is logged. The next
  set's prefill follows the target but stays editable.
- A missed target has no punitive visual state.

Examples:

> **Next target**
> **60 kg × 9 reps**
> Reach 10 reps on all 4 sets, then try 62.5 kg.

> **Next target**
> **62.5 kg × 8 reps**
> You reached 10 reps on all 4 sets at 60 kg.

Manual progression: **Target set manually** / Last session: 60 kg × 8, 8, 7.

### Personal records `[C]`

Use **Personal best**, not "PR", in primary copy. A quiet neutral/accent text
row after a qualifying completed set: **Personal best · Estimated 1RM 80 kg**.

On Exercise detail, records are separate facts:

- **Heaviest load:** 65 kg × 3 · 12 Oct
- **Best estimated 1RM:** 80 kg · 24 Oct
- **Most reps at 60 kg:** 10 · 24 Oct

No gold colour, confetti, modal or progress bar.

Estimated 1RM: label it **Estimated 1RM** on first use with supporting text
**Estimated one-rep max**. Use one documented formula consistently (Epley).
Compare only completed working sets for the same exercise and load mode. Do
not show e1RM for bodyweight-only or assisted exercises where the entered load
does not represent total resistance. Warm-up sets do not set records.

### Exercise detail `[C]`

1. **Bench press**
2. **Chest · Barbell**
3. Next target card
4. Personal bests card
5. Trend card: metric control **Load · Reps · Est. 1RM**, range control **30d ·
   90d · 6mo · 1y · All**, one metric at a time, teal line and dots
6. **Recent sessions** textual list — **24 Oct · 60 kg × 10, 10, 9, 9 · Est.
   1RM 80 kg**

Metric definitions, shown as supporting text:

- **Load:** Heaviest working-set load in each session.
- **Reps:** Most working-set reps in each session; session details include the
  load.
- **Est. 1RM:** Highest estimated one-rep max from that session's working
  sets.

Chart states: no sets → **Complete a session to see this exercise's trend.**
One session → a single point plus **One session so far.** Metric unavailable
→ **Estimated 1RM isn't available for this load type.**

**Accessibility:** the chart has a concise accessible summary, and **View
chart data** exposes the same points as a table or list. Direction is written
with an arrow and a signed value — **↑ +2.5 kg since 30 Sep** — never conveyed
by teal/red alone. Decreases use neutral foreground, not destructive red.

---

## 9. Session history and detail `[C]`

### Sessions screen

H1 **Sessions**, subtitle **24 workouts**. Reverse-chronological, month
grouped: **Push** / **Today · 46 min · 5 exercises · 18 sets**. If a workout
is active, a separate **Workout in progress** card sits above finished
history. Empty state: **No workouts yet** / **Finished workouts will appear
here.** / **Start empty workout**.

### Session detail

1. Routine/workout name and local date
2. **46 min · 18 sets**
3. Actions: **Repeat workout** `[L]`, **Save as routine** `[L]`, **Delete
   workout**
4. Per-exercise cards: exercise name, personal-best text where applicable,
   table headers **Set · Load · Reps**, rows include set type where needed,
   row action **Edit Bench press set 2**
5. Optional workout note

**Repeat workout** creates a new active draft using the routine's exercises and
current next targets; it does not duplicate the old session in history.

Editing a past set recalculates records, targets and trends. Feedback
**Set updated.**

Delete confirmation: **Delete workout?** / **This workout and its sets will be
removed. Your routine is kept.** / **Delete workout**.

**Accessibility:** the session summary row may be one button with a unique name
containing routine and date. Tables keep their headers on small screens; at
narrow widths each set becomes a labelled list row rather than requiring
horizontal scrolling. Editing and deleting restore focus to the originating
control, or to the Sessions heading if that item no longer exists.

---

## 10. Global states: loading, errors, offline

**Loading.** Data is local, so most views render immediately without
artificial skeletons. During initial restoration, keep the shell stable and
show **Loading your data…** only if restoration is not immediate. During
active-workout recovery, show **Restoring workout…** rather than briefly
displaying Start workout. Charts may show a fixed-height **Loading trend…**
placeholder to prevent layout shift. Never show an indefinite spinner without
recovery text.

**Errors.** Corrupt or incompatible training data must not be silently
discarded. Preserve the original backup where possible and show **Some
training data couldn't be read. Your other entries are still available.**
with **Export backup** and **Retry**. Save failures stay visible until
resolved — a toast alone is insufficient. A deleted exercise or routine
referenced by old history is rendered from the session's preserved snapshot,
without blocking the detail view.

**Offline.** All routines, exercises, logging, history, targets and trends
remain available offline. No disruptive offline banner. Export/import language
must not imply cloud sync. Service-worker updates must not clear an active
draft; reload recovery returns to the same set and values.

---

## 11. Dark mode, responsiveness, motion

**Dark mode.** Use the existing token set; introduce no training-specific
palette. Current exercise/set uses an accent border plus explicit text;
completed sets use a check icon plus **Done**. Personal bests stay neutral or
accent-soft, never gold. Rest-complete state uses text and an icon, not a
colour flash. Teal chart lines must keep visible contrast against the dark
raised surface; grid and secondary labels use existing border/muted tokens.
Validate every new muted label, stepper state, disabled state and chart
annotation for AA in both themes. Focus rings use the existing light/dark
focus tokens.

**Responsive.** Preserve the existing centred `content-max` column on desktop;
do not turn Training into a multi-panel dashboard. Mobile stays a single
vertical flow. The logger's primary action is sticky and respects the bottom
safe area. When the numeric keyboard opens, keep the edited field visible; the
Complete set action must not cover it. At 360px the stepper rows fit without
horizontal scrolling. At 320px or increased text size, labels wrap above
controls and secondary actions stack; touch targets never shrink below 44px.
On short screens reduce decorative spacing before reducing control height.
Desktop sheets become centred dialogs, matching the existing app. Hover is
supplementary — every action remains visible and usable on touch.

**Motion.** Sheet and view transitions use the existing fast, subtle
durations. No animated overload bars, record celebrations, bouncing timers or
automatic scrolling after each set. `prefers-reduced-motion` removes
transitions, pulsing and non-essential scroll movement.

---

## 12. Copy deck and terminology

| Context | Copy |
| --- | --- |
| Main tab | **Training** |
| Training sections | **Today · Routines · Exercises · Sessions** |
| Start routine | **Start Push** |
| Empty start | **Start empty workout** |
| Resume | **Resume workout** |
| Current position | **Exercise 1 of 5**, **Set 2 of 4** |
| Main logging action | **Complete set** |
| Extra set | **Add set** |
| Extra movement | **Add exercise** |
| Reps field | **Reps** |
| Standard barbell field | **Total load (kg)** |
| Dumbbell field | **Load per dumbbell (kg)** |
| Bodyweight addition | **Added load (kg)** |
| Increment control | **2.5 kg steps** |
| Plate hint | **20 kg bar + 20 kg each side** |
| Save announcement | **Set 2 saved — 60 kg, 10 reps.** |
| Recovery | **Workout restored.** |
| Rest | **Rest 01:28**, **Pause rest**, **+30 s**, **Skip rest** |
| Rest expiry | **Rest complete** |
| Guidance | **Next target** |
| Record | **Personal best** |
| End action | **Finish workout** |
| Discard action | **Discard workout** |
| History | **Sessions**, **No workouts yet** |
| Custom exercise action | **Save exercise** |
| Routine action | **Save routine** |

### Terminology rules

- **Body weight** means the person's weigh-in; **load** means resistance used
  in an exercise. Never alternate between "load" and "weight" within Training.
- Always qualify load where ambiguity matters: **Total load**, **Load per
  dumbbell**, or **Added load**.
- A **set** is one completed group of repetitions; **reps** are the
  repetitions within it.
- Use **4 sets × 8–10 reps**, not the ambiguous "4 × 8–10", in explanatory
  text.
- **Complete set** records one set. **Finish workout** closes the whole
  session. **Save workout** is not interchangeable with either.
- **Skip rest** must never be shortened to **Skip**, which could read as
  skipping the exercise.
- **Repeat workout** starts a new draft; **Duplicate routine** copies a
  template. Keep them distinct.

