import type { Analysis, Settings, Shift, Side } from './types';

/**
 * Sweeps the day left to right and turns the crew curve into shifts:
 * - start a shift the moment the curve needs one more person
 * - when the need drops, send home whoever has worked longest, but only once they've hit the
 *   shortest-shift length, and not if the need comes back within `bridge` minutes
 * - nobody works past the longest-shift length
 * Openers come in `preOpen` minutes before the first sale; closers stay `postClose` after the last.
 */
export function shiftsFor(an: Analysis, side: Side, s: Settings): Shift[] {
  const { L } = an;
  const open = an.open - s.preOpen, close = an.close + s.postClose;
  const minL = s.minShift * 60, maxL = s.maxShift * 60, bridge = s.bridge || 0;
  const need = L.map((r) => r[side]);
  const done: { start: number; end: number }[] = [];
  let act: { start: number; end?: number }[] = [];
  L.forEach((r, i) => {
    const t = i === 0 ? open : r.min;
    act = act.filter((sh) => {
      if (t - sh.start >= maxL) { done.push({ start: sh.start, end: sh.start + maxL }); return false; }
      return true;
    });
    let hold = need[i];
    for (let j = i; j < L.length && L[j].min < r.min + bridge; j++) hold = Math.max(hold, need[j]);
    if (act.length > hold) {
      act.sort((x, y) => x.start - y.start);
      let extra = act.length - hold;
      act = act.filter((sh) => {
        if (extra > 0 && t - sh.start >= minL) { done.push({ start: sh.start, end: t }); extra--; return false; }
        return true;
      });
    }
    while (act.length < need[i]) act.push({ start: t });
  });
  act.forEach((sh) => done.push({ start: sh.start, end: close }));
  done.forEach((sh) => {
    if (sh.end - sh.start < minL) sh.start = Math.max(open, sh.end - minL);
    if (sh.end - sh.start < minL) sh.end = Math.min(close, sh.start + minL);
  });
  return done
    .map((sh) => ({
      ...sh,
      side,
      hrs: (sh.end - sh.start) / 60,
      tag: sh.start <= an.open ? 'Open'
        : sh.end >= an.close ? 'Close'
        : sh.start < 600 ? 'AM'
        : sh.start < 720 && sh.end <= 930 ? 'Lunch'
        : sh.start < 840 ? 'Mid' : 'Dinner',
    }))
    .sort((x, y) => x.start - y.start || y.end - x.end);
}

export function shiftSummary(an: Analysis, F: Shift[], B: Shift[], s: Settings) {
  const hrs = [...F, ...B].reduce((a, x) => a + x.hrs, 0);
  return { hrs, splh: an.total / hrs, labor: (hrs * s.wage * 100) / an.total, overCurve: hrs - an.laborHrs };
}
