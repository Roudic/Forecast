import type { Analysis, BreakWindow, Daypart, FcRow, Hour, Level, NoPeak, Overrides, Peak, Row, Settings } from './types';

export type AnalyzeOpts = { overrides?: Overrides | null };

export const DAYPARTS: [string, number, number][] = [
  ['Breakfast', 0, 630],
  ['Lunch', 630, 840],
  ['Afternoon', 840, 990],
  ['Dinner', 990, 1440],
];
export const daypartOf = (m: number) => (m < 630 ? 'Breakfast' : m < 840 ? 'Lunch' : m < 990 ? 'Afternoon' : 'Dinner');

/**
 * Turns a forecast into staffing:
 * 1. Every daypart gets its own peak 15 (not just the day's biggest).
 * 2. The rush window grows out from that peak across every 15 within `win`% of it.
 * 3. Rush strength is rated against the whole day: big / medium / light.
 * 4. Crew per 15 = smoothed sales rate ÷ SPLH (rush SPLH for big rushes), split FOH/BOH.
 */
export function analyze(fc: FcRow[], s: Settings, o: AnalyzeOpts = {}): Analysis | null {
  const ov = o.overrides ?? {};
  const a = fc.findIndex((r) => r.sales > 0);
  let b = fc.length - 1;
  while (b >= 0 && !(fc[b].sales > 0)) b--;
  if (a < 0) return null;
  const B = fc.slice(a, b + 1);
  const diffs = new Map<number, number>();
  for (let i = 1; i < B.length; i++) { const d = B[i].min - B[i - 1].min; diffs.set(d, (diffs.get(d) || 0) + 1); }
  const step = [...diffs.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 15;
  const total = B.reduce((acc, r) => acc + r.sales, 0);
  const mean = total / B.length;

  // ---- peaks per daypart
  const frac = (s.win || 70) / 100;
  const found: (Omit<Peak, 'peakFoh' | 'peakBoh'> | NoPeak)[] = [];
  DAYPARTS.forEach(([name, from, to], di) => {
    const idx: number[] = [];
    B.forEach((r, i) => { if (r.min >= from && r.min < to) idx.push(i); });
    if (idx.length < 2) {
      if (idx.length) found.push({ none: true, dp: name, from, to, peakMin: null, peakSales: null, why: 'Too short to read' });
      return;
    }
    const lo = idx[0], hi = idx[idx.length - 1];
    let top = lo;
    idx.forEach((i) => { if (B[i].sales > B[top].sales) top = i; });
    // a top 15 sitting on the daypart edge while sales keep climbing next door is the ramp into the next rush
    const cands = idx.filter((i) =>
      B[i].sales > 0 &&
      !(i === hi && B[i + 1] && B[i + 1].sales > B[i].sales) &&
      !(i === lo && B[i - 1] && B[i - 1].sales > B[i].sales) &&
      (!B[i - 1] || i === lo || B[i].sales >= B[i - 1].sales) &&
      (!B[i + 1] || i === hi || B[i].sales >= B[i + 1].sales));
    if (!cands.length) {
      const climbing = B[hi + 1] && B[hi + 1].sales > B[hi].sales;
      found.push({
        none: true, dp: name, from: B[lo].min, to: B[hi].min + step, peakMin: B[top].min, peakSales: B[top].sales,
        why: climbing ? `Sales just climb into ${DAYPARTS[di + 1]?.[0].toLowerCase() ?? 'the next daypart'}` : 'Sales just taper off from the last rush',
      });
      return;
    }
    let pk = cands[0];
    cands.forEach((i) => { if (B[i].sales > B[pk].sales) pk = i; });
    const lim = B[pk].sales * frac;
    const ok = (i: number) => i >= lo && i <= hi && B[i].sales >= lim;
    let i0 = pk, i1 = pk;
    for (;;) { if (ok(i0 - 1)) i0--; else if (ok(i0 - 2)) i0 -= 2; else break; }
    for (;;) { if (ok(i1 + 1)) i1++; else if (ok(i1 + 2)) i1 += 2; else break; }
    if (i0 === i1) {
      const l = i0 - 1 >= lo ? B[i0 - 1].sales : -1, r = i1 + 1 <= hi ? B[i1 + 1].sales : -1;
      if (r >= l && r >= 0) i1++; else if (l >= 0) i0--;
    }
    let tot = 0;
    for (let i = i0; i <= i1; i++) tot += B[i].sales;
    const ratio = B[pk].sales / mean;
    const level: Level = ratio >= s.sens ? 'big' : ratio >= 1.1 ? 'medium' : 'light';
    found.push({
      none: false, dp: name, i0, i1, pk, start: B[i0].min, end: B[i1].min + step, peakMin: B[pk].min,
      peakSales: B[pk].sales, total: tot, level, ratio, name: level === 'light' ? `${name} bump` : `${name} rush`,
    });
  });
  const rushRaw = found.filter((p): p is Omit<Peak, 'peakFoh' | 'peakBoh'> => !p.none);
  const lvl = B.map((_, i) => rushRaw.find((r) => i >= r.i0 && i <= r.i1)?.level ?? null);

  // ---- crew per 15
  const L: Row[] = B.map((r, i) => {
    const p = B[i - 1] ? B[i - 1].sales : r.sales, n = B[i + 1] ? B[i + 1].sales : r.sales;
    const rate = ((p + 2 * r.sales + n) / 4) * (60 / step);
    const splh = lvl[i] === 'big' ? s.rushSplh : lvl[i] === 'medium' ? (s.splh + s.rushSplh) / 2 : s.splh;
    const tot = Math.max(s.minFoh + s.minBoh, Math.ceil(rate / splh));
    const boh = Math.max(s.minBoh, Math.round((tot * s.boh) / 100));
    const foh = Math.max(s.minFoh, tot - boh);
    // hand edits for this hour win over the forecast
    const e = ov[String(Math.floor(r.min / 60))];
    const F = e?.foh != null ? Math.max(0, Math.round(e.foh)) : foh;
    const Bo = e?.boh != null ? Math.max(0, Math.round(e.boh)) : boh;
    return { ...r, foh: F, boh: Bo, crew: F + Bo, autoFoh: foh, autoBoh: boh, edited: F !== foh || Bo !== boh, level: lvl[i], rush: !!lvl[i] };
  });
  const rushes: Peak[] = rushRaw.map((r) => {
    let mx = r.i0;
    for (let i = r.i0; i <= r.i1; i++) if (L[i].crew > L[mx].crew) mx = i;
    return { ...r, peakFoh: L[mx].foh, peakBoh: L[mx].boh };
  });
  const peaks = found.map((p) => (p.none ? p : rushes.find((r) => r.dp === p.dp)!));

  // ---- break windows: slow 15s, clear of real rushes (45 min before, 15 after)
  const blocked = (m: number) => rushes.some((r) => r.level !== 'light' && m >= r.start - 45 && m < r.end + 15);
  const okB = L.map((r) => !blocked(r.min) && r.sales <= mean * 0.95 && r.min >= L[0].min + 60 && r.min < L[L.length - 1].min - 30);
  const raw: { i0: number; i1: number }[] = [];
  let cur: { i0: number; i1: number } | null = null;
  L.forEach((_, i) => {
    if (!okB[i]) return;
    if (cur && cur.i1 === i - 1) cur.i1 = i;
    else { cur = { i0: i, i1: i }; raw.push(cur); }
  });
  const breaks: BreakWindow[] = raw.filter((x) => x.i1 - x.i0 >= 1).map((x) => {
    let sl = 0, c = 0;
    for (let i = x.i0; i <= x.i1; i++) { sl += L[i].sales; c += L[i].crew; }
    const n = x.i1 - x.i0 + 1;
    return { start: L[x.i0].min, end: L[x.i1].min + step, avg: sl / n, send: Math.max(1, Math.round((c / n) * 0.2)), dp: daypartOf(L[x.i0].min) };
  });
  const bestBreak = [...breaks].sort((x, y) => (y.end - y.start) / y.avg - (x.end - x.start) / x.avg)[0] || null;

  // ---- hourly + dayparts
  const H = new Map<number, Hour>();
  L.forEach((r) => {
    const h = Math.floor(r.min / 60);
    const o = H.get(h) || { h, sales: 0, low: 0, high: 0, foh: 0, boh: 0, rush: false, trans: 0, hasT: false, dF: 0, dB: 0, autoFoh: 0, autoBoh: 0, edited: false };
    o.autoFoh = Math.max(o.autoFoh, r.autoFoh); o.autoBoh = Math.max(o.autoBoh, r.autoBoh); o.edited = o.edited || r.edited;
    o.sales += r.sales; o.low += r.low; o.high += r.high;
    o.foh = Math.max(o.foh, r.foh); o.boh = Math.max(o.boh, r.boh); o.rush = o.rush || r.rush;
    if (r.trans != null) { o.trans += r.trans; o.hasT = true; }
    H.set(h, o);
  });
  const hourly = [...H.values()].sort((x, y) => x.h - y.h);
  hourly.forEach((o, i) => { const p = hourly[i - 1]; o.dF = p ? o.foh - p.foh : 0; o.dB = p ? o.boh - p.boh : 0; });
  const laborHrs = L.reduce((x, r) => x + (r.crew * step) / 60, 0);
  const dps = new Map<string, Daypart>();
  L.forEach((r) => {
    const d = daypartOf(r.min);
    const o = dps.get(d) || { name: d, sales: 0, foh: 0, boh: 0, hrs: 0, from: r.min, to: r.min, peak: null };
    o.sales += r.sales; o.foh = Math.max(o.foh, r.foh); o.boh = Math.max(o.boh, r.boh);
    o.hrs += (r.crew * step) / 60; o.to = r.min + step;
    dps.set(d, o);
  });
  dps.forEach((d) => (d.peak = peaks.find((p) => p.dp === d.name) || null));

  return {
    L, step, total, mean, rushes, peaks, breaks, bestBreak, hourly, laborHrs,
    dayparts: DAYPARTS.map(([k]) => dps.get(k)).filter((x): x is Daypart => !!x),
    open: L[0].min, close: L[L.length - 1].min + step,
    peakFoh: Math.max(...L.map((r) => r.foh)), peakBoh: Math.max(...L.map((r) => r.boh)),
    hasTrans: L.some((r) => r.trans != null),
    low: L.reduce((x, r) => x + r.low, 0), high: L.reduce((x, r) => x + r.high, 0),
  };
}
