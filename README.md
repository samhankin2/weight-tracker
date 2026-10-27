# Weight

A simple, private weight tracker that works offline. Mobile-first.

- **Log a weight in a couple of taps.** Big number, big steppers, prefilled from your last weigh-in.
- **A 7-day average** so daily noise doesn't fool you.
- **Training phases** (Bulk, Cut, Maintenance) shade the chart so noisy stretches are obvious.
- **All data stays on your device** — `localStorage`, no account, no server, no tracking.
- **Works offline** and installs to your home screen.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # serve the production build locally
```

## Deploy to GitHub Pages (free)

The repo already contains a GitHub Actions workflow at
`.github/workflows/deploy.yml` that builds and publishes `dist/` to Pages.

1. **Create the repo** (a *public* repo is required for free Pages).

   ```bash
   git remote add origin https://github.com/<you>/weight-tracker.git
   git push -u origin main
   ```

2. **Enable Pages** in the repo:
   *Settings* -> *Pages* -> *Build and deployment* -> *Source*: **GitHub Actions**.

3. The first push runs the workflow. Your app is live at:

   ```
   https://<you>.github.io/weight-tracker/
   ```

4. To trigger a redeploy later, push any commit to `main`, or run the
   workflow manually from the *Actions* tab.

`vite.config.ts` uses `base: './'`, so the build works under any project
sub-path without further configuration.

### Other free hosts

`dist/` is a plain static folder and works as-is on:

| Host | How |
| --- | --- |
| Netlify | Drag `dist/` onto the dashboard, or connect the repo (build `npm run build`, publish `dist`). |
| Cloudflare Pages | Connect the repo; build `npm run build`, output `dist`. |
| Vercel | Import the repo; framework preset "Vite". |
| GitHub Pages | As above. |

---

## Using it

### Logging a weight

Tap the **+** button. The sheet opens with the number already focused and
prefilled from your most recent weigh-in, so a daily entry is usually just a
small adjustment:

- Type a value, or use the **−/+** steppers (0.1 kg, press and hold to repeat).
- **Save** commits it. **Enter** does the same.
- Changing the date moves an existing weigh-in rather than duplicating it.
- Typing `745` when you meant `74.5` is detected and corrected.

### Reading the chart

- **Teal line** — the 7-day average. This is the line that matters; it ignores
  day-to-day swings.
- **Grey dots** — your individual weigh-ins.
- **Shaded bands** — training phases. Add one from *Phases -> New*, name it
  (e.g. "Bulk"), pick a colour and a start date. Leave it ongoing or give it
  an end date.
- **Range selector** — 30d / 90d / 6mo / 1y / All.

### Metrics

| Metric | What it means |
| --- | --- |
| 7-day average | Smoothed current weight. |
| Total change | Difference since your first entry. |
| Weekly rate | Average pace of change per week. |
| Streak | Consecutive days logged, and your best run. |
| BMI | Shown once you set a height in Settings. |
| Daily swing | Average day-to-day movement — a measure of noise. |
| Goal progress | Percentage from your start weight to your goal. |

### Phases

Phases exist because a bulk or cut phase looks alarming on a raw chart. Mark
one and the chart shades it, so you can tell "the line went up" from "the line
went up *and I was deliberately bulking*".

### Your data

Everything lives in `localStorage` under the key `weight-tracker:v1`.

- **Export** downloads a JSON backup.
- **Import** restores one (it replaces the current data).
- **Delete all data** wipes the device.

Clearing your browser data will erase your entries, so export a backup if that
matters to you.

---

## Project layout

```
src/
  main.ts            App shell: tabs, FAB, routing, focus handling
  appStore.ts        State container + change notification
  store.ts           localStorage read/write, validation, migrations
  types.ts           Domain types
  metrics.ts         Pure metric maths (averages, rates, streaks, BMI)
  format.ts          Date and number formatting
  pwa.ts             Service worker registration
  design/
    tokens.css       Colour, spacing, type and motion tokens (light + dark)
    ui.css           Component styles
  ui/
    dom.ts           Tiny DOM helpers
    icons.ts         Inline SVG icon paths
    components.ts    Sheet, stat tile, segmented control, big number input, toast
  chart/
    weightChart.ts   Chart.js line chart with phase shading
    miniSparkline.ts Inline SVG sparkline
    phaseLegend.ts   Phase list with edit/delete
  views/
    dashboard.ts     Trend, metrics, phases, recent
    history.ts       All weigh-ins grouped by month
    settings.ts      Profile, phases, data, reset
  sheets/
    logWeight.ts     The log-weight sheet
    phaseSheet.ts    Create/edit a phase
```

Stack: Vite + TypeScript, no UI framework. Chart.js is the only runtime
dependency.

---

## Accessibility

- Every control has an accessible name; icon-only buttons are labelled.
- Touch targets are at least 44 px, with primary controls at 48–64 px.
- Visible focus rings everywhere; focus is trapped in dialogs and restored on
  close.
- Light and dark themes both meet WCAG AA for text contrast.
- `prefers-reduced-motion` is respected.
- Colour never carries meaning alone — direction is also shown with an arrow
  and a sign.

## Privacy

No network requests, no analytics, no cookies. The service worker caches the
app shell locally so it opens offline. Your weigh-ins never leave the device.
