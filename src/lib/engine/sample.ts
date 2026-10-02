import type { Day } from './types';
import { dayNum, isoFor } from './format';

/** Four weeks of made-up Mon–Sat sales so the app opens in a working state. Clearly marked "Sample" in the UI. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeSample(): Day[] {
  const R = rng(6123);
  const P: Record<number, [number, number, number, number]> = {
    1: [0.9, 0.9, 0.85, 735], 2: [0.9, 0.95, 0.9, 735], 3: [0.95, 1, 0.95, 735],
    4: [1, 1, 1, 735], 5: [1.05, 1.15, 1.25, 740], 6: [1.3, 1.1, 1.05, 760],
  };
  const g = (t: number, c: number, a: number, sd: number) => a * Math.exp(-((t - c) ** 2) / (2 * sd * sd));
  const days: Day[] = [];
  for (let k = 0; k < 27; k++) {
    const dt = new Date(2026, 7, 31 + k);
    const wd = dt.getDay();
    if (wd === 0) continue;
    const y = dt.getFullYear(), mo = dt.getMonth() + 1, d = dt.getDate();
    const key = isoFor(y, mo, d);
    const [bf, lu, di, lc] = P[wd];
    const day = 0.95 + R() * 0.1;
    const spike = key === '2026-09-17' ? 1.6 : key === '2026-09-09' ? 0.7 : 1; // catering Thursday, storm Wednesday
    const slots = [];
    for (let m = 360; m < 1320; m += 15) {
      const t = m + 7.5;
      let s = 55 + g(t, 465, 230 * bf, 45) + g(t, lc, 560 * lu * (t > 650 && t < 840 ? spike : 1), 52) + g(t, 1065, 300 * di, 55) + g(t, 900, 25, 60);
      if (m < 390) s *= 0.7;
      if (m >= 1260) s *= 0.75;
      s *= day * (0.92 + R() * 0.16) * (spike === 0.7 ? 0.85 : 1);
      slots.push({ min: m, sales: Math.round(s * 100) / 100, trans: Math.round(s / 11.5) });
    }
    days.push({ key, wd, dn: dayNum(y, mo, d), slots, source: 'Sample' });
  }
  return days;
}
