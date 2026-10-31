import { expect, it } from 'vitest';
import { makeSample, DEFAULT_SETTINGS, daysFor, forecastFrom, smartForecast, type Day } from './index';

// realistic stress test: 8 weeks, growth trend, noisy weather days, a promo day, partial export
function makeHard(): Day[] {
  let seed = 42; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const g = (t: number, c: number, a: number, sd: number) => a * Math.exp(-((t - c) ** 2) / (2 * sd * sd));
  const out: Day[] = [];
  for (let k = 0; k < 56; k++) {
    const dt = new Date(2026, 7, 3 + k); const wd = dt.getDay(); if (wd === 0) continue;
    const growth = 1 + 0.008 * k; const wf = [0, .9, .92, .95, 1, 1.18, 1.1][wd];
    const dayNoise = 0.9 + R() * 0.2; const special = k === 30 ? 1.5 : k === 22 ? 0.55 : 1;
    const lunchShift = (R() - 0.5) * 20;
    const slots = [];
    for (let m = 360; m < 1320; m += 15) {
      if (k === 40 && m > 900) break; // partial export
      const t = m + 7.5;
      const s = (60 + g(t, 465, 220, 45) + g(t, 735 + lunchShift, 560, 52) + g(t, 1065, 300, 55)) * growth * wf * dayNoise * special * (0.8 + R() * 0.4);
      slots.push({ min: m, sales: s, trans: Math.round(s / 11) });
    }
    out.push({ key: dt.toISOString().slice(0, 10), wd, dn: Math.round(dt.getTime() / 864e5), slots });
  }
  return out;
}

function score(days: Day[], label: string) {
  const S = DEFAULT_SETTINGS; let oldS = 0, oldD = 0, newS = 0, newD = 0, n = 0;
  for (const wd of [1, 2, 3, 4, 5, 6]) {
    const ds = daysFor(days, wd);
    for (let k = Math.max(3, ds.length - 4); k < ds.length; k++) {
      const train = ds.slice(0, k), target = ds[k];
      const act = new Map(target.slots.map((x) => [x.min, x.sales])); const A = [...act.values()].reduce((a, b) => a + b, 0);
      if (target.slots.length < 50) continue; // don't grade against the partial day
      const ev = (rows: { min: number; sales: number }[]) => {
        let e = 0, P = 0; rows.forEach((r) => { const a = act.get(r.min) ?? 0; e += Math.abs(r.sales - a); P += r.sales; });
        return [e / A, Math.abs(P - A) / A];
      };
      const o = ev(forecastFrom(train, { ...S, method: 'smart' }));
      const trainAll = days.filter((d) => (d.dn ?? 0) < (target.dn ?? 0));
      const nw = ev(smartForecast(trainAll, wd, S).rows);
      oldS += o[0]; oldD += o[1]; newS += nw[0]; newD += nw[1]; n++;
    }
  }
  console.log(`${label}: ${n} hidden days | per-15 error old ${(oldS / n * 100).toFixed(1)}% -> new ${(newS / n * 100).toFixed(1)}% | day-total error old ${(oldD / n * 100).toFixed(1)}% -> new ${(newD / n * 100).toFixed(1)}%`);
  return { oldS: oldS / n, newS: newS / n, oldD: oldD / n, newD: newD / n };
}
it('blend beats the single smart average on hidden days', () => {
  const a = score(makeSample(), 'Sample (4 wks, flat)');
  const b = score(makeHard(), 'Stress (8 wks, growth, events, partial day)');
  expect(a.newS).toBeLessThanOrEqual(a.oldS * 1.02);
  expect(b.newS).toBeLessThan(b.oldS);
  expect(b.newD).toBeLessThan(b.oldD);
  const r = smartForecast(makeHard(), 5, DEFAULT_SETTINGS).report;
  console.log('Friday weights', r.models.map((m) => `${m.id}:${(m.weight * 100).toFixed(0)}% err ${m.slotErr == null ? '-' : (m.slotErr * 100).toFixed(1)}`).join(' | '), 'trend', r.trendPct?.toFixed(1));
  const skipped = smartForecast(makeHard(), 'all', DEFAULT_SETTINGS).report.skipped;
  expect(skipped.some((x) => /partial/.test(x.why))).toBe(true);
  expect(skipped.some((x) => /below normal/.test(x.why))).toBe(true);
});
