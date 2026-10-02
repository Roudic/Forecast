# Rush Forecaster

Hueytown #06123 forecasting tool for team leaders. Upload 15-minute sales CSVs and get:

- **Scheduler**: FOH/BOH counts for every 15 minutes, a peak for every daypart, an hour-by-hour table, and a **Shift Builder** that turns the counts into real shifts you can put names on and save.
- **On the Floor**: a live status (steady / rush coming / in the rush), a countdown, line positions, a game plan with stock-up, lineup lock, and reset times, plus break windows and a copyable shift huddle.
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
  days/{YYYY-MM-DD}             { key, wd, dn, source, slots[] }  one doc per business day
  plans/{YYYY-MM-DD}            { name, shifts[{…, who}] }        saved shift plans with names
```

Each day is one document with up to 96 slots (`{m: minute, s: sales, t: transactions}`). A year of data is about 360 small docs, well inside the free tier.

Want more stores? Deploy the same repo again with a different `VITE_STORE_ID`, and add a `storeSecrets/{newId}` doc. Each store's data stays separate.

---

## How the forecast works

| Step | What it does |
|---|---|
| Weekday matching | Fridays forecast from Fridays. "All days" averages everything. |
| Smart average | For each 15-minute slot it drops that slot's best and worst day (with 4+ days), and recent weeks count more (each week back counts 85%). |
| Busy day | Staffs to the 80th percentile instead of the average. |
| Peaks per daypart | Breakfast (to 10:30), Lunch (to 2:00), Afternoon (to 4:30), and Dinner each get their own peak 15. The rush window is every 15 within 70% of that peak. |
| Rush strength | Big rush = peak ≥ 1.35× the day's average, staffed at Rush SPLH. Rush = in between. Light bump = staffed at normal SPLH and doesn't block breaks. |
| Crew | Smoothed sales per hour ÷ SPLH, split by BOH %, floored at the minimums, capped at station limits. |
| Shift Builder | Sweeps the day, adds a shift when the curve needs one, and cuts the longest-worked person once they've hit the shortest shift. It holds crew through dips shorter than 60 min and caps everyone at the longest shift. |
| Accuracy check | Hides the latest day of each weekday, forecasts it from the earlier ones, and scores the result. |

All of it lives in `src/lib/engine/`. Those are pure TypeScript files with tests in `engine.test.ts`.
