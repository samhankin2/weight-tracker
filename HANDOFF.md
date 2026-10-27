# Handoff — Weight Tracker

**Last updated:** 2026-10-27
**Live URL:** https://samhankin2.github.io/weight-tracker/
**Repo:** https://github.com/samhankin2/weight-tracker (public — required for free GitHub Pages)
**Local path:** `C:\Users\hanki\Development\weight-tracker`

---

## TL;DR

A mobile-first weight tracker. Vanilla TypeScript + Vite, no UI framework.
Chart.js is the only runtime dependency. All user data lives in `localStorage`.
Static site deployed to GitHub Pages via GitHub Actions.

**Current status:** deployed and working. Verified end-to-end against the live
URL (12/12 automated checks passing); the local smoke suite is at 14/14. The
user is now testing on a real phone and will report what feels wrong.

---

## What it does

| Area | Behaviour |
| --- | --- |
| Logging | FAB → bottom sheet. Number prefilled from the last weigh-in, auto-focused, big ±0.1 kg steppers (press-and-hold repeats). `745` → `74.5` auto-corrected. Values outside 20–400 kg rejected. |
| Chart | Teal = 7-day average, grey dots = raw weigh-ins, shaded bands = training phases. Range: 30d/90d/6mo/1y/All. |
| Phases | Named date ranges with colours (e.g. "Bulk"). Shade the chart so noisy stretches are legible. |
| Import a list | Paste `date weight` lines. Parses ISO, `5 Mar 2026`, `05/03/2026`, `5/3`, `Mar 5`. Live preview, conflict count, skipped-line reasons. Pasted values overwrite. |
| Metrics | 7-day avg, total change, weekly rate, streak, BMI, daily swing, goal progress. |
| Other | Dark mode, JSON export/import, offline (service worker), installable PWA. |

---

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # -> dist/
npm run preview
```

### Verification scripts

```bash
# Parser unit tests (52 assertions, pure logic)
npx tsx qa/parse-test.ts

# Serve the production build locally
node qa/serve.mjs dist 4173

# Smoke-test the built app (logs a weight, imports a list, checks the chart)
node qa/smoke.mjs http://localhost:4173

# Verify the DEPLOYED site
node qa/verify-deployed.mjs https://samhankin2.github.io/weight-tracker/
```

`qa/serve.mjs` is a dependency-free static server. The browser tests drive
Microsoft Edge via Puppeteer's `executablePath` — see `qa/verify-deployed.mjs`
for the exact path. Puppeteer is a devDependency; it skips the Chromium
download and uses the installed Edge.

`qa/smoke.mjs` makes 14 assertions and all 14 pass against the local build.

---

## Deploying

Push to `main`. `.github/workflows/deploy.yml` builds and publishes to Pages.

```bash
git add -A && git commit -m "..." && git push
```

`vite.config.ts` uses `base: './'`, so the build works under any sub-path.

**If Pages fails with "Get Pages site failed"** in the *Setup Pages* step: the
Pages site has not propagated yet. Wait a minute, then re-run the workflow
from the Actions tab. This happened on the first deploy and was transient.

**If the repo ever needs to be private:** GitHub's free plan does not serve
Pages from private repositories. Either keep it public, or use Netlify /
Cloudflare Pages (both free for private repos, and `dist/` deploys as-is).

### Creating a repo / using the GitHub API (no `gh` CLI installed)

Git Credential Manager holds the GitHub token. To call the API:

```powershell
$cred = "protocol=https`nhost=github.com`n`n" | git credential-manager get
$token = ($cred | Where-Object { $_ -like "password=*" }) -replace '^password=',''
$headers = @{
  Authorization = "Bearer $token"
  Accept = "application/vnd.github+json"
  "User-Agent" = "weight-tracker-setup"
}
```

Use it to create repos, enable Pages, or dispatch workflows. `gh` is **not**
installed. Delete the token from disk after use — never commit it.

---

## Architecture

```
src/
  main.ts          App shell: tabs, FAB, routing, focus preservation, scroll behaviour
  appStore.ts      State container + change notification (coalesced persist)
  store.ts         localStorage read/write, validation, schema migration
  types.ts         Domain types (WeightEntry, Phase, Profile, AppState)
  metrics.ts       Pure metric maths — averages, rates, streaks, BMI, goal progress
  format.ts        Date/number formatting
  pwa.ts           Service worker registration (production only)
  design/
    tokens.css     Colour, spacing, type, motion tokens (light + dark)
    ui.css         Component styles (sheets, tiles, controls, toasts)
  ui/
    dom.ts         `el()`, `clsx()`, `Icon()` helpers
    icons.ts       Inline SVG path data
    components.ts  Sheet, StatTile, SegmentedControl, BigNumberInput, Toast, confirm()
  chart/
    weightChart.ts Chart.js line chart + custom phase-shading plugin
    miniSparkline.ts, phaseLegend.ts
  views/
    dashboard.ts   Trend, metrics, goal, phases, recent
    history.ts     All entries grouped by month
    settings.ts    Profile, phases, import-a-list, data, reset
  sheets/
    logWeight.ts   The log sheet (the core interaction)
    phaseSheet.ts  Create/edit a phase
    importList.ts  Paste-a-list importer
  import/
    parseList.ts   Date/weight parsing + merge logic (pure, unit-tested)
```

### Key contracts

- **`store.ts` is the only thing that touches `localStorage`.** Key:
  `weight-tracker:v1`. Schema version in `types.ts` (`SCHEMA_VERSION`).
- **`metrics.ts` is pure** — no DOM, no storage. All date maths lives here
  (`buildDailySeries`, `computeOverallStats`, `daysBetween`, `addDays`).
  Use it rather than re-implementing date logic.
- **All weights are stored in kilograms.** Unit is fixed to kg.
- **Dates are local-calendar `YYYY-MM-DD` strings**, never `Date` objects.
  Mixing them up causes off-by-one-day bugs.
- **`el()` never sets `innerHTML`** — everything is built from nodes.

---

## Things that will bite you

1. **Never use PowerShell `Set-Content` to patch source files.** It re-encodes
   UTF-8 and strips `{` characters, which corrupted `src/views/dashboard.ts`
   badly enough to require a full rewrite. Use the `edit` tool, or write the
   whole file. If a file suddenly fails to parse, check for mangled quotes
   before assuming logic bugs.

2. **Focus restoration only works for elements with an explicit
   `data-focus-key`.** The class-based fallback was removed because several
   controls share the same class (all three Settings inputs are
   `.field-input`) and a class-derived selector resolved to the wrong
   element — it silently redirected the user's typing into another field and
   stored garbage like `8275180`. If you add a control that must survive a
   re-render, give it a `data-focus-key`.

3. **The app re-renders the whole view on every store change.** That is why
   focus preservation exists. Anything that mutates state during a render
   risks a loop.

4. **Chart.js measures the parent element**, not the canvas. `.chart-frame`
   must keep an explicit height (240px). The canvas must be appended to the
   frame — it was once forgotten, and the chart silently never rendered.

5. **`segments`/`focusKey`** — the chart-range control needs `focusKey:
   'chart-window'` for keyboard focus to survive its re-render.

6. **`verbatimModuleSyntax` and `noUnusedLocals` are on.** Use `import type`
   for type-only imports. An unused import fails the build.

7. **Service worker caching is aggressive enough that a stale build can
   linger on a device.** Bump the cache name in `public/sw.js` if you ship
   a change that breaks. Version is `weight-tracker-shell-v1`.

---

## Accessibility commitments

Do not regress these — they were verified and are deliberate:

- Every interactive element has an accessible name; icon-only buttons are
  labelled.
- Touch targets ≥ 44px (primary controls 48–64px).
- Visible focus rings; focus is trapped in dialogs and restored on close.
- `role="dialog"` + `aria-modal` on sheets; Escape always closes them.
- Light and dark themes both meet WCAG AA for text contrast.
- `prefers-reduced-motion` is respected.
- **Colour never carries meaning alone** — direction is shown with an arrow
  and a sign. Weight loss is deliberately *not* red; red is reserved for
  destructive actions.
- Duplicate accessible names across buttons are avoided (e.g. "Record first
  weight" vs "Log weight").

---

## Visual language

Calm, quiet instrument. Not a gamified tracker.

- Palette: warm off-white/green. `--color-bg` `#f3f5f1`, `--color-accent`
  `#146c5a`, dark mode `#101613` / `#7bd8bb`.
- Cards: 1px border + soft shadow, 16px radius.
- Numbers use tabular figures.
- Type scale lives in `tokens.css` (`--text-number` etc.).

---

## Open items

- [x] Fix the two stale count assertions in `qa/smoke.mjs` (done 2026-10-27).
- [ ] Await user feedback from real-phone testing, then prioritise.
- [ ] `qa/verify-import.mjs` and `qa/focus-probe.mjs` were ad-hoc debugging
      scripts — either promote them to a proper suite or delete them.
- [ ] Consider adding unit tests for `metrics.ts` (currently only the parser
      is covered by tests).

---

## Useful references

- Chart.js v4 docs: https://www.chartjs.org/docs/latest/
- GitHub Pages + Actions: `actions/configure-pages@v5`,
  `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`
- Repo secrets: none. The token lives in Git Credential Manager only.
