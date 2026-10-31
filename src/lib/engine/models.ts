import type { Day, DayFilter, FcRow, Settings } from './types';

/*
 Multi-model forecasting.

 Every model forecasts one target day as a sales number for each 15-minute slot.
 We score every model the honest way: hide a real day, forecast it from only the days before it,
 compare, repeat for the last few weeks ("rolling-origin backtest"). Models that were more accurate
 on YOUR store's history get more say in the final blend ("inverse-error ensemble").

 Models
   avg       trimmed, recency-weighted average of the same weekday (drops each slot's best + worst day)
   median    middle value per slot; shrugs off one-off spikes
   recent    exponential smoothing per slot; leans hard on the last 1–2 weeks
   last      same weekday last week (seasonal naive), the baseline everything should beat
   shape     intraday shape × weekday day-total trend (damped Holt). Gets the curve and the level separately
   store     intraday shape × store-wide trend with weekday factors, so Friday's level learns from every day
*/

export type ModelId = 'avg' | 'median' | 'recent' | 'last' | 'shape' | 'store';
export const MODELS: { id: ModelId; label: string; desc: string }[] = [
  { id: 'avg', label: 'Trimmed average', desc: "Same weekday, drops each 15-min slot's best and worst day, recent weeks count more" },
  { id: 'median', label: 'Median', desc: 'Middle value for each 15-min slot. Ignores one-off spikes and dead days' },
  { id: 'recent', label: 'Recent trend', desc: 'Exponential smoothing. Leans on the last week or two' },
  { id: 'last', label: 'Last week', desc: 'Exactly what the same weekday did last week. The baseline to beat' },
  { id: 'shape', label: 'Shape × trend', desc: 'Learns the curve of the day, then projects whether this weekday is growing or slipping' },
  { id: 'store', label: 'Store-wide trend', desc: "Projects the whole store's trend with weekday factors, then applies this weekday's curve" },
];

type Hist = { X: number[][]; T: (number | null)[][]; dn: (number | null)[]; key: string[] };
type Ctx = { hist: Hist; targetDn: number | null; all: Day[]; wd: number | null; mins: number[] };
type Model = (c: Ctx) => number[];

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const pct = (arr: number[], p: number) => { const a = [...arr].sort((x, y) => x - y); if (!a.length) return 0; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };

function grid(days: Day[], mins: number[]): Hist {
  return {
    X: days.map((d) => { const m = new Map(d.slots.map((s) => [s.min, s.sales])); return mins.map((k) => m.get(k) ?? 0); }),
    T: days.map((d) => { const m = new Map(d.slots.map((s) => [s.min, s.trans])); return mins.map((k) => m.get(k) ?? null); }),
    dn: days.map((d) => d.dn), key: days.map((d) => d.key),
  };
}
const weeksBack = (dn: number | null, ref: number | null) => (dn != null && ref != null ? Math.max(0, Math.round((ref - dn) / 7)) : 0);

/** Damped Holt's linear trend. Returns the h-step-ahead level. */
function holt(y: number[], h = 1, alpha = 0.5, beta = 0.2, phi = 0.8): { level: number; slope: number } {
  if (!y.length) return { level: 0, slope: 0 };
  if (y.length === 1) return { level: y[0], slope: 0 };
  let L = y[0], B = y[1] - y[0];
  for (let i = 1; i < y.length; i++) {
    const prevL = L;
    L = alpha * y[i] + (1 - alpha) * (L + phi * B);
    B = beta * (L - prevL) + (1 - beta) * phi * B;
  }
  let damp = 0;
  for (let k = 1; k <= h; k++) damp += Math.pow(phi, k);
  return { level: Math.max(0, L + damp * B), slope: B };
}

/** Average intraday shape (each slot as a share of the day), trimmed, lightly smoothed, sums to 1. */
function shapeOf(X: number[][], dn: (number | null)[], ref: number | null): number[] {
  const rows = X.map((r) => { const t = sum(r); return t > 0 ? r.map((v) => v / t) : null; }).filter((r): r is number[] => !!r);
  if (!rows.length) return X[0]?.map(() => 0) ?? [];
  const w = X.map((_, i) => Math.pow(0.85, weeksBack(dn[i], ref))).filter((_, i) => sum(X[i]) > 0);
  const m = rows[0].length;
  const raw = Array.from({ length: m }, (_, j) => {
    let vals = rows.map((r, i) => ({ v: r[j], w: w[i] }));
    if (vals.length >= 4) vals = vals.sort((a, b) => a.v - b.v).slice(1, -1);
    const W = sum(vals.map((x) => x.w)) || 1;
    return sum(vals.map((x) => x.v * x.w)) / W;
  });
  const sm = raw.map((v, j) => 0.15 * (raw[j - 1] ?? v) + 0.7 * v + 0.15 * (raw[j + 1] ?? v));
  const t = sum(sm) || 1;
  return sm.map((v) => v / t);
}

const M: Record<ModelId, Model> = {
  avg: ({ hist: { X, dn }, targetDn }) => {
    const ref = targetDn ?? Math.max(...dn.map((d) => d ?? -Infinity));
    return X[0].map((_, j) => {
      let vals = X.map((r, i) => ({ v: r[j], w: Math.pow(0.85, weeksBack(dn[i], ref)) }));
      if (vals.length >= 4) vals = vals.sort((a, b) => a.v - b.v).slice(1, -1);
      const W = sum(vals.map((x) => x.w)) || 1;
      return sum(vals.map((x) => x.v * x.w)) / W;
    });
  },
  median: ({ hist: { X } }) => X[0].map((_, j) => median(X.map((r) => r[j]))),
  recent: ({ hist: { X } }) => {
    const a = 0.4;
    let s = [...X[0]];
    for (let i = 1; i < X.length; i++) s = s.map((v, j) => a * X[i][j] + (1 - a) * v);
    return s;
  },
  last: ({ hist: { X } }) => [...X[X.length - 1]],
  shape: ({ hist: { X, dn }, targetDn }) => {
    const ref = targetDn ?? (dn[dn.length - 1] != null ? (dn[dn.length - 1] as number) + 7 : null);
    const shape = shapeOf(X, dn, ref);
    const totals = X.map(sum);
    const h = Math.max(1, weeksBack(dn[dn.length - 1], ref));
    const level = totals.length >= 3 ? holt(totals, h).level : sum(totals) / totals.length;
    return shape.map((s) => s * level);
  },
  store: ({ hist: { X, dn }, targetDn, all, wd }) => {
    // store-wide daily totals before the target date, with a factor for each weekday
    const prior = all.filter((d) => d.dn != null && (targetDn == null || (d.dn as number) < targetDn)).sort((a, b) => (a.dn as number) - (b.dn as number));
    const fallback = M.shape({ hist: { X, dn, T: [], key: [] }, targetDn, all, wd, mins: [] });
    if (prior.length < 10 || wd == null) return fallback;
    const tot = prior.map((d) => sum(d.slots.map((s) => s.sales)));
    const byWd = new Map<number, number[]>();
    prior.forEach((d, i) => { if (d.wd != null) byWd.set(d.wd, [...(byWd.get(d.wd) || []), tot[i]]); });
    const overall = median(tot) || 1;
    const factor = new Map([...byWd.entries()].map(([k, v]) => [k, median(v) / overall]));
    if (!factor.get(wd)) return fallback;
    const deseason = prior.map((d, i) => tot[i] / (factor.get(d.wd as number) || 1));
    const lastDn = prior[prior.length - 1].dn as number;
    const ref = targetDn ?? lastDn + 1;
    // steps ahead in operating days (≈ days ahead × share of days open)
    const openShare = prior.length / Math.max(1, lastDn - (prior[0].dn as number) + 1);
    const h = Math.max(1, Math.round((ref - lastDn) * openShare));
    const level = holt(deseason, h, 0.3, 0.1, 0.9).level * (factor.get(wd) as number);
    return shapeOf(X, dn, ref).map((s) => s * level);
  },
};

/* ---------------- outliers + partial days ---------------- */
export type Skipped = { key: string; total: number; why: string };

/** Flags days that would poison the average: partial exports and one-off blowouts or dead days. */
export function findOutliers(days: Day[]): Skipped[] {
  if (days.length < 4) return [];
  const tot = days.map((d) => sum(d.slots.map((s) => s.sales)));
  const cnt = days.map((d) => d.slots.filter((s) => s.sales > 0).length);
  const medT = median(tot), medC = median(cnt);
  const mad = median(tot.map((t) => Math.abs(t - medT))) || medT * 0.05;
  const out: Skipped[] = [];
  days.forEach((d, i) => {
    if (cnt[i] < medC * 0.6) out.push({ key: d.key, total: tot[i], why: 'Looks like a partial day (missing hours)' });
    else {
      const z = (0.6745 * (tot[i] - medT)) / mad;
      const r = tot[i] / (medT || 1);
      if (Math.abs(z) > 3.5 && (r > 1.35 || r < 0.7))
        out.push({ key: d.key, total: tot[i], why: r > 1 ? `${Math.round((r - 1) * 100)}% above normal (catering or event?)` : `${Math.round((1 - r) * 100)}% below normal (weather or closure?)` });
    }
  });
  return out;
}

/* ---------------- backtest + ensemble ---------------- */
export type ModelScore = { id: ModelId; label: string; desc: string; slotErr: number | null; dayErr: number | null; bias: number | null; weight: number };
export type ForecastReport = {
  method: 'auto' | 'smart' | 'straight';
  models: ModelScore[];
  folds: number;
  slotErr: number | null; // blended forecast, share of sales off per 15-min slot
  dayErr: number | null; // blended forecast, share off on the day total
  skipped: Skipped[];
  used: number;
  trendPct: number | null; // weekly change in this weekday's level
  best: ModelId | null;
};
export type Forecast = { rows: FcRow[]; report: ForecastReport };

const MIN_TRAIN = 2;
const MAX_FOLDS = 5;

function predictAll(train: Day[], mins: number[], targetDn: number | null, all: Day[], wd: number | null) {
  const hist = grid(train, mins);
  const ctx: Ctx = { hist, targetDn, all, wd, mins };
  const out = {} as Record<ModelId, number[]>;
  for (const m of MODELS) out[m.id] = M[m.id](ctx);
  return out;
}

function errs(pred: number[], act: number[]) {
  const A = sum(act);
  if (A <= 0) return null;
  return { slot: sum(pred.map((p, j) => Math.abs(p - act[j]))) / A, day: Math.abs(sum(pred) - A) / A, bias: (sum(pred) - A) / A };
}

/** Forecast for one weekday (or any group of days) with the full model set. */
function forecastGroup(group: Day[], all: Day[], wd: number | null, s: Settings): Forecast {
  const sorted = [...group].sort((a, b) => (a.dn ?? 0) - (b.dn ?? 0));
  const skipped = findOutliers(sorted);
  const skip = new Set(skipped.map((x) => x.key));
  const clean = sorted.filter((d) => !skip.has(d.key));
  const allClean = all.filter((d) => !skip.has(d.key));
  const mins = [...new Set(clean.flatMap((d) => d.slots.map((x) => x.min)))].sort((a, b) => a - b);

  // rolling-origin backtest over the last few days
  const score: Record<ModelId, { s: number; d: number; b: number; n: number }> = Object.fromEntries(MODELS.map((m) => [m.id, { s: 0, d: 0, b: 0, n: 0 }])) as never;
  const foldPreds: { p: Record<ModelId, number[]>; act: number[] }[] = [];
  const first = Math.max(MIN_TRAIN, clean.length - MAX_FOLDS);
  for (let k = first; k < clean.length; k++) {
    const target = clean[k];
    const p = predictAll(clean.slice(0, k), mins, target.dn, allClean, wd);
    const am = new Map(target.slots.map((x) => [x.min, x.sales]));
    const act = mins.map((m) => am.get(m) ?? 0);
    foldPreds.push({ p, act });
    for (const m of MODELS) { const e = errs(p[m.id], act); if (e) { const sc = score[m.id]; sc.s += e.slot; sc.d += e.day; sc.b += e.bias; sc.n++; } }
  }
  const folds = foldPreds.length;

  // weights: inverse 4th-power slot error, only models within 25% of the best (tuned on backtests)
  let weights = Object.fromEntries(MODELS.map((m) => [m.id, 0])) as Record<ModelId, number>;
  const mean = (id: ModelId) => (score[id].n ? score[id].s / score[id].n : Infinity);
  const best = folds ? MODELS.map((m) => m.id).sort((a, b) => mean(a) - mean(b))[0] : null;
  if (s.method === 'auto' && folds >= 1 && best) {
    const bestErr = mean(best);
    for (const m of MODELS) { const e = mean(m.id); if (isFinite(e) && e <= bestErr * 1.25) weights[m.id] = 1 / Math.max(1e-4, e) ** 4; }
  } else if (s.method === 'auto') weights.avg = 1;
  else weights.avg = 1; // smart/straight are handled by the caller
  const W = sum(Object.values(weights)) || 1;
  weights = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / W])) as Record<ModelId, number>;
  const blend = (p: Record<ModelId, number[]>) => mins.map((_, j) => sum(MODELS.map((m) => weights[m.id] * p[m.id][j])));

  // blended accuracy on the same folds
  let bs = 0, bd = 0, bn = 0;
  foldPreds.forEach(({ p, act }) => { const e = errs(blend(p), act); if (e) { bs += e.slot; bd += e.day; bn++; } });

  // the real forecast: next occurrence after the newest day
  const lastDn = clean.length ? clean[clean.length - 1].dn : null;
  const targetDn = lastDn != null ? lastDn + (wd != null ? 7 : 1) : null;
  const p = clean.length ? predictAll(clean, mins, targetDn, allClean, wd) : ({} as Record<ModelId, number[]>);
  const point = clean.length ? blend(p) : [];

  // ranges + transactions from the actual days
  const hist = grid(clean, mins);
  const f = 1 + (+s.adj || 0) / 100;
  const rows: FcRow[] = mins.map((min, j) => {
    const col = hist.X.map((r) => r[j]);
    const low = pct(col, 0.2), high = pct(col, 0.8);
    const avg = point[j] ?? 0;
    const base = s.plan === 'busy' ? Math.max(avg, high) : avg;
    const tv = hist.T.map((r) => r[j]).filter((x): x is number => x != null);
    const meanSales = sum(col) / (col.length || 1);
    const trans = tv.length && meanSales > 0 ? (sum(tv) / tv.length) * (base / meanSales) : null;
    return { min, sales: base * f, avg: avg * f, low: low * f, high: high * f, trans: trans != null ? trans * f : null };
  });

  const totals = clean.map((d) => sum(d.slots.map((x) => x.sales)));
  const tr = totals.length >= 3 ? holt(totals) : null;
  const trendPct = tr && tr.level > 0 ? (tr.slope / tr.level) * 100 : null;

  return {
    rows,
    report: {
      method: s.method,
      models: MODELS.map((m) => ({
        ...m,
        slotErr: score[m.id].n ? score[m.id].s / score[m.id].n : null,
        dayErr: score[m.id].n ? score[m.id].d / score[m.id].n : null,
        bias: score[m.id].n ? score[m.id].b / score[m.id].n : null,
        weight: weights[m.id],
      })),
      folds, slotErr: bn ? bs / bn : null, dayErr: bn ? bd / bn : null,
      skipped, used: clean.length, trendPct, best,
    },
  };
}

/**
 * The forecast the app shows.
 * - A weekday: full model set on that weekday.
 * - All days: each weekday forecast on its own, then averaged by how often it appears.
 */
export function smartForecast(days: Day[], filter: DayFilter, s: Settings): Forecast {
  const valid = days.filter((d) => d.slots.some((x) => x.sales > 0));
  if (filter !== 'all') return forecastGroup(valid.filter((d) => d.wd === filter), valid, filter, s);
  const wds = [...new Set(valid.map((d) => d.wd).filter((w): w is number => w != null))];
  if (!wds.length) return forecastGroup(valid, valid, null, s);
  const parts = wds.map((w) => ({ n: valid.filter((d) => d.wd === w).length, f: forecastGroup(valid.filter((d) => d.wd === w), valid, w, s) }));
  const N = sum(parts.map((p) => p.n));
  const mins = [...new Set(parts.flatMap((p) => p.f.rows.map((r) => r.min)))].sort((a, b) => a - b);
  const rows: FcRow[] = mins.map((min) => {
    const acc = { sales: 0, avg: 0, low: 0, high: 0, trans: 0, hasT: false };
    parts.forEach(({ n, f }) => {
      const r = f.rows.find((x) => x.min === min); if (!r) return;
      const w = n / N;
      acc.sales += r.sales * w; acc.avg += r.avg * w; acc.low += r.low * w; acc.high += r.high * w;
      if (r.trans != null) { acc.trans += r.trans * w; acc.hasT = true; }
    });
    return { min, sales: acc.sales, avg: acc.avg, low: acc.low, high: acc.high, trans: acc.hasT ? acc.trans : null };
  });
  const wavg = (g: (r: ForecastReport) => number | null) => {
    const v = parts.map((p) => ({ v: g(p.f.report), n: p.n })).filter((x) => x.v != null) as { v: number; n: number }[];
    const n = sum(v.map((x) => x.n)); return n ? sum(v.map((x) => x.v * x.n)) / n : null;
  };
  return {
    rows,
    report: {
      method: s.method,
      models: MODELS.map((m) => ({
        ...m,
        slotErr: wavg((r) => r.models.find((x) => x.id === m.id)!.slotErr),
        dayErr: wavg((r) => r.models.find((x) => x.id === m.id)!.dayErr),
        bias: wavg((r) => r.models.find((x) => x.id === m.id)!.bias),
        weight: wavg((r) => r.models.find((x) => x.id === m.id)!.weight) ?? 0,
      })),
      folds: sum(parts.map((p) => p.f.report.folds)),
      slotErr: wavg((r) => r.slotErr), dayErr: wavg((r) => r.dayErr),
      skipped: parts.flatMap((p) => p.f.report.skipped).sort((a, b) => a.key.localeCompare(b.key)),
      used: sum(parts.map((p) => p.f.report.used)), trendPct: wavg((r) => r.trendPct), best: null,
    },
  };
}

/* ---------------- live pace ---------------- */
export type Pace = { ratio: number; applied: number; expectedSoFar: number; actualSoFar: number; confidence: number };

/**
 * Same-day correction. Compares sales so far to what the forecast expected by now, then nudges the
 * rest of the day. Early in the day the nudge is small (a slow 7 AM says little about lunch);
 * it gets stronger as more of the day is in.
 */
export function paceAdjust(rows: FcRow[], nowMin: number, actualSoFar: number): { rows: FcRow[]; pace: Pace } | null {
  const expected = sum(rows.filter((r) => r.min + 15 <= nowMin).map((r) => r.sales)) + sum(rows.filter((r) => r.min < nowMin && r.min + 15 > nowMin).map((r) => (r.sales * (nowMin - r.min)) / 15));
  const day = sum(rows.map((r) => r.sales));
  if (expected <= 0 || actualSoFar <= 0 || day <= 0) return null;
  const ratio = Math.min(2.5, Math.max(0.4, actualSoFar / expected));
  const share = expected / day;
  const confidence = Math.min(0.85, share / (share + 0.15)); // ~50% sure after 15% of the day, ~75% after 45%
  const applied = 1 + (ratio - 1) * confidence;
  return {
    rows: rows.map((r) => (r.min + 15 <= nowMin ? r : { ...r, sales: r.sales * applied, avg: r.avg * applied, high: r.high * applied, low: r.low * applied, trans: r.trans != null ? r.trans * applied : null })),
    pace: { ratio, applied, expectedSoFar: expected, actualSoFar, confidence },
  };
}
