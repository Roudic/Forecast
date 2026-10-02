import type { Day, DayFilter, FcRow, Settings } from './types';

export function daysFor(days: Day[], f: DayFilter): Day[] {
  return days
    .filter((d) => f === 'all' || d.wd === f)
    .filter((d) => d.slots.some((s) => s.sales > 0))
    .sort((a, b) => (a.dn ?? 0) - (b.dn ?? 0));
}

function pct(arr: number[], p: number) {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

type Opts = Partial<Pick<Settings, 'method' | 'plan' | 'adj'>>;

/**
 * Builds one forecast day from every matching day in the data.
 * Smart average: for each 15-minute slot, drop that slot's best and worst day (4+ days), and weight
 * recent weeks heavier (each week back counts 85% of the one after it).
 * Busy day: staff to the 80th percentile instead of the average.
 */
export function forecastFrom(ds: Day[], s: Settings, o: Opts = {}): FcRow[] {
  if (!ds.length) return [];
  const method = o.method ?? s.method, plan = o.plan ?? s.plan, adj = o.adj ?? s.adj;
  const maps = ds.map((d) => ({ d, m: new Map(d.slots.map((x) => [x.min, x])) }));
  const mins = [...new Set(ds.flatMap((d) => d.slots.map((x) => x.min)))].sort((a, b) => a - b);
  const latest = Math.max(...ds.map((d) => d.dn ?? -Infinity));
  const wt = (d: Day) =>
    method === 'smart' && d.dn != null && isFinite(latest) ? Math.pow(0.85, Math.floor((latest - d.dn) / 7)) : 1;
  const f = 1 + (+adj || 0) / 100;
  return mins.map((min) => {
    let vals = maps.map(({ d, m }) => {
      const x = m.get(min);
      return { v: x ? x.sales : 0, t: x ? x.trans : null, w: wt(d) };
    });
    const raw = vals.map((x) => x.v);
    if (method === 'smart' && vals.length >= 4) vals = [...vals].sort((a, b) => a.v - b.v).slice(1, -1);
    const W = vals.reduce((a, x) => a + x.w, 0) || 1;
    const avg = vals.reduce((a, x) => a + x.v * x.w, 0) / W;
    const tv = vals.filter((x) => x.t != null);
    const trans = tv.length ? tv.reduce((a, x) => a + (x.t as number) * x.w, 0) / (tv.reduce((a, x) => a + x.w, 0) || 1) : null;
    const low = pct(raw, 0.2), high = pct(raw, 0.8);
    const base = plan === 'busy' ? Math.max(avg, high) : avg;
    return {
      min, sales: base * f, avg: avg * f, low: low * f, high: high * f,
      trans: trans != null ? trans * f * (plan === 'busy' && avg > 0 ? base / avg : 1) : null,
    };
  });
}

export type Backtest =
  | { multi: false; key: string; wd: number | null; actual: number; pred: number; dayErr: number; slotErr: number }
  | { multi: number; dayErr: number; slotErr: number };

/** Hide the latest matching day, forecast it from the ones before, and score the result. */
function backtestOne(days: Day[], f: DayFilter, s: Settings): Extract<Backtest, { multi: false }> | null {
  const ds = daysFor(days, f);
  if (ds.length < 3) return null;
  const last = ds[ds.length - 1];
  const fc = forecastFrom(ds.slice(0, -1), s, { plan: 'typical', adj: 0 });
  const am = new Map(last.slots.map((x) => [x.min, x.sales]));
  let err = 0, act = 0, pred = 0;
  fc.forEach((r) => { const a = am.get(r.min) || 0; err += Math.abs(r.sales - a); act += a; pred += r.sales; });
  last.slots.forEach((x) => { if (!fc.some((r) => r.min === x.min)) { err += x.sales; act += x.sales; } });
  if (act <= 0) return null;
  return { multi: false, key: last.key, wd: last.wd, actual: act, pred, dayErr: Math.abs(pred - act) / act, slotErr: err / act };
}
export function backtest(days: Day[], f: DayFilter, s: Settings): Backtest | null {
  if (f !== 'all') return backtestOne(days, f, s);
  const wds = [...new Set(days.map((d) => d.wd).filter((v): v is number => v != null))];
  const bt = wds.map((w) => backtestOne(days, w, s)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!bt.length) return null;
  return {
    multi: bt.length,
    dayErr: bt.reduce((a, b) => a + b.dayErr, 0) / bt.length,
    slotErr: bt.reduce((a, b) => a + b.slotErr, 0) / bt.length,
  };
}
