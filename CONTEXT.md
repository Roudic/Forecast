# CONTEXT.md — Rush Forecaster

Give this file to Cursor at the start of every session.

## What this is
A forecasting tool for Chick-fil-A Hueytown (#06123) team leaders. Leaders upload 15-minute sales CSVs, and the app tells them FOH/BOH counts, when each daypart rush hits and how long it lasts, line positions, break windows, and stock-up/reset times. It also builds shifts they can name and save. Users include older shift leaders who aren't comfortable with tech, so everything needs big tap targets, plain words, and no jargon in the UI.

## Stack
- Vite + React 18 + TypeScript (strict) + Tailwind 3
- framer-motion for animation (respects reduced motion via `<MotionConfig reducedMotion="user">`)
- Firebase: Firestore (with offline cache) + Anonymous Auth. A store join code is checked by the security rules.
- Deployed on Vercel. Env vars are `VITE_FIREBASE_*`, `VITE_STORE_ID`, and `VITE_STORE_NAME`.
- With no Firebase env vars, the app runs in **demo mode** (`localBackend` in `src/lib/backend.ts`, which uses localStorage).

## Design system
- Dark only. CFA red `#E51636`. FOH blue `#6FA9FF`, BOH red text `#FF5C77`, ok green `#3DC48D`, warn amber `#F2AA3C`.
- Fonts: Barlow Condensed (display, uppercase headings and big numbers) and Atkinson Hyperlegible (body).
- iPad-first, and it must work at 400px wide with no sideways scroll.
- Numbers use the `num` class (tabular figures).
- Tokens are in `tailwind.config.js`. Shared classes (`card`, `btn`, `field`, `tile`, `label`) are in `src/index.css`.

## Layout
```
src/lib/engine/     pure logic, no React; tested in engine.test.ts
  csv.ts            parse any 15-min export → Day[]
  forecast.ts       daysFor, forecastFrom (smart avg / busy day), backtest
  analyze.ts        per-daypart peaks, crew per 15, breaks, hourly, dayparts
  lineup.ts         station caps + fill order (edit to match the deployment chart)
  shifts.ts         Shift Builder sweep
  floor.ts          game plan, floor state, countdown, huddle + shift text
  settings.ts       DEFAULT_SETTINGS (Hueytown targets)
src/lib/backend.ts  Firestore + demo backends, join flow
src/lib/firebase.ts Firebase init
src/hooks/useStore.ts  access, live data subscriptions, clock
src/components/     TopBar, Scheduler, ShiftBuilder, Floor, KitchenTV, Panels (settings + data), JoinStore, Charts, ui
```

## Rules of the road
- Keep the engine pure. UI calls `analyze(forecastFrom(daysFor(days, filter), settings), settings)`.
- Settings live in Firestore at `stores/{id}/config/settings` and are shared by the whole store.
- Never use `alert`/`confirm`. Use `ConfirmButton` (two-tap) instead.
- Hueytown targets: labor 19%, SPLH $70 building spot, $75 goal.
- Station caps: Primary 3, Secondary 2, Breading 2.
- Run `npm test` and `npm run build` before pushing.

## Ideas parked for later
- Actuals: after a day, compare scheduled vs. actual SPLH per daypart.
- Import a schedule PDF from Nation and compare it to the Shift Builder.
- Catering calendar: add known catering orders on top of the forecast.
- Multi-store "Nation" layer: one login, a store switcher.
