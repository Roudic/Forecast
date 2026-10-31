# Rush Forecaster

Hueytown #06123 forecasting tool for team leaders. Upload 15-minute sales CSVs and get:

- **Look Ahead** (the scheduler): FOH/BOH counts for every 15 minutes, a peak for every daypart, an hour-by-hour table, and a **Shift Builder** that turns the counts into real shifts you can put names on and save.
- **Today · Live** (on the floor): a live status (steady / rush coming / in the rush), a countdown, FOH/BOH counts, a game plan with stock-up, lineup lock, and reset times, plus break windows and a copyable shift huddle.
- **Kitchen TV**: a full-screen board for the kitchen TV with a big countdown that ticks every second.

Every iPad and the kitchen TV share one Firebase database, so uploads, settings, and saved plans show up everywhere.

Stack: Vite + React + TypeScript + Tailwind, with Firebase (Firestore + Anonymous Auth). It deploys to Vercel.

---

## Run it locally (2 minutes)

```bash
npm install
npm run dev
```

With no Firebase keys, the app runs in **Demo mode**. It uses sample data, and anything you upload is saved only in that browser. That's enough to click through everything.

```bash
npm test         # forecast engine tests
npm run build    # typecheck + production build
```

---

## Set up Firebase (one time, about 10 minutes)

1. **Create the project.** Go to [console.firebase.google.com](https://console.firebase.google.com), choose **Add project**, and name it `rush-forecaster`. Analytics is optional.
2. **Add a web app.** Open Project settings, go to **Your apps**, then click **Web** (`</>`). Register it and copy the config values.
3. **Turn on sign-in.** Go to Build → **Authentication** → Get started → Sign-in method → **Anonymous** → Enable.
4. **Create the database.** Go to Build → **Firestore Database** → Create database. Choose **Production mode** and a US location (e.g. `us-central1` / `nam5`).
5. **Publish the security rules.** Open Firestore → **Rules**, paste in the whole of `firestore.rules`, and click Publish.
   You can use the CLI instead: `npm i -g firebase-tools`, `firebase login`, copy `.firebaserc.example` to `.firebaserc` with your project id, then run `firebase deploy --only firestore:rules`.
6. **Set the store code.** Leaders type this code once per device. In Firestore → Data:
   - Start collection: `storeSecrets`
   - Document ID: `06123`
   - Field: `joinCode` (string) = pick a code, e.g. `HUEY-6123`
   The app can never read this document. The rules only check it when a device joins.
7. **Add your keys.** Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values from step 2.

Run `npm run dev`. You'll get the **store code** screen. Enter the code and you're in.

### Removing a device
In Firestore → Data → `stores/06123/members`, delete that device's document. It will have to enter the code again. To lock everyone out, change `joinCode`. Existing devices stay joined until you delete their member docs.

---

## Deploy to Vercel

1. Push this folder to a GitHub repo (its own repo, e.g. `rush-forecaster`).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo. The framework preset is **Vite**, and the defaults are fine.
3. Under **Environment Variables**, add every line from `.env.local` (all the `VITE_FIREBASE_*` keys plus `VITE_STORE_ID` and `VITE_STORE_NAME`).
4. Click Deploy.
5. Back in Firebase → Authentication → **Settings → Authorized domains**, add your Vercel domain (e.g. `rush-forecaster.vercel.app`).

On each iPad, open the site in Safari, then Share → **Add to Home Screen**, so it opens full screen like an app.

---

## Database layout

```
storeSecrets/{storeId}          { joinCode }                     never readable from the app
stores/{storeId}/
  members/{uid}                 { name, code, joinedAt }          devices allowed in this store
  config/settings               SPLH, BOH %, shift rules, …       shared by every leader
  config/overrides              hand-edited counts by hour         per weekday
  days/{YYYY-MM-DD}             { key, wd, dn, source, slots[] }  one doc per business day
  plans/{YYYY-MM-DD}            { name, shifts[{…, who}] }        saved shift plans with names
```

Each day is one document with up to 96 slots (`{m: minute, s: sales, t: transactions}`). A year of data is about 360 small docs, well inside the free tier.

Want more stores? Deploy the same repo again with a different `VITE_STORE_ID`, and add a `storeSecrets/{newId}` doc. Each store's data stays separate.

---

## How the forecast works

The default method is **Auto blend**. Six forecasting methods each make a forecast, and the app grades every one of them on your own store's days before deciding how much to trust it.

| Method | What it does |
|---|---|
| Trimmed average | Same weekday. Drops each 15-min slot's best and worst day, and recent weeks count more. |
| Median | Middle value per slot, so one-off spikes and dead days don't move it. |
| Recent trend | Exponential smoothing that leans on the last week or two. |
| Last week | What the same weekday did last week. The baseline everything has to beat. |
| Shape × trend | Learns the curve of the day separately from the day's total, and projects the total with damped Holt trend. |
| Store-wide trend | Projects the whole store's trend with weekday factors, then applies this weekday's curve. |

How the blend is picked:
1. **Odd days are left out.** That means partial exports (missing hours) and one-off days far from normal (robust z-score > 3.5, catering blowouts, storms). The app lists them.
2. **Rolling-origin backtest.** For each of the last 5 days of that weekday, it hides the day, forecasts it from the days before it, and measures the error per 15 min and on the day total.
3. **Inverse-error weights.** Methods within 25% of the best one get weight ∝ 1/error⁴. The rest get 0.
4. **The forecast.** It's the weighted blend for the next occurrence of that weekday. The normal range comes from your actual days (20th–80th percentile). Busy-day planning uses the top of the range.
5. **Live pace (On the Floor).** Enter sales so far today. The rest of the day is scaled by how far ahead or behind you are, and the app trusts that pace more as the day goes on (about half after 15% of the day's sales, up to 85%).

On a stress test (8 weeks with growth, events and a partial export), the blend cut the day-total error from 16.7% to 11.6% and the per-15 error from 19.0% to 15.5% against the old single average. `src/lib/engine/accuracy.test.ts` re-runs this on every `npm test`.

Crew = smoothed sales per hour ÷ SPLH (rush SPLH in big rushes), split by BOH %, floored at the minimums. Leaders can hand-edit any hour. Every daypart gets its own peak, and the rush window is every 15 within 70% of that peak.

All of it lives in `src/lib/engine/`. These are pure TypeScript files with tests.
