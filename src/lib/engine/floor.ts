import type { Analysis, Peak, Shift } from './types';
import { dur, fmt, money, WD } from './format';
import { lineup } from './lineup';

export type PlanEvent = { t: number; k: 'stock' | 'ready' | 'rush' | 'reset' | 'break' | 'cut' | 'add'; w: string; d: string; list?: string[] };

const STOCK = {
  am: {
    boh: ['Biscuits baked ahead to the rush number', 'Filets and nuggets pulled and breaded for breakfast', 'Hash browns and eggs stocked at the board', 'Boards stocked: buns, biscuits, cheese, wrappers, boxes'],
    foh: ['Coffee brewed, iced coffee stocked', 'Cups, lids, bags, ice full'],
  },
  pm: {
    boh: ['Breading table stocked: breader, milk wash, pans', 'Filets, nuggets, strips pulled and thawed for the rush', 'Fry oil filtered, vats at temp', 'Boards stocked: buns, pickles, cheese, wrappers, boxes'],
    foh: ['Sauces, napkins, straws, cutlery stocked', 'Cups, lids, bags, ice full, lemonade and tea made'],
  },
};
const RESET = ['Clean and sanitize boards and the breading table', 'Restock everything that ran low', 'Check holding times; waste what is expired and log it', 'FOH restock: drinks, sauces, bags, napkins'];
export const LEVEL_LABEL = { big: 'Big rush', medium: 'Rush', light: 'Light bump' } as const;

export function buildPlan(an: Analysis): PlanEvent[] {
  const ev: PlanEvent[] = [];
  an.rushes.forEach((r) => {
    if (r.level === 'light') {
      ev.push({ t: r.start, k: 'add', w: `${r.name}: peak at ${fmt(r.peakMin)}`, d: `Small push ${fmt(r.start)}–${fmt(r.end)} (~${money(r.peakSales)} per 15 at the top). Keep breaks moving, just hold the line at ${r.peakFoh} FOH / ${r.peakBoh} BOH.` });
      return;
    }
    const k = r.peakMin < 630 ? 'am' : 'pm';
    ev.push({ t: Math.max(an.open, r.start - 45), k: 'stock', w: `Stock up for the ${r.name.toLowerCase()}`, d: 'Everything full before the line gets long.', list: [...STOCK[k].boh, ...STOCK[k].foh] });
    ev.push({ t: Math.max(an.open, r.start - 15), k: 'ready', w: `Lineup locked: ${r.peakFoh} FOH / ${r.peakBoh} BOH`, d: 'All breaks back. Everyone on position. No new breaks until the rush is over.' });
    ev.push({ t: r.start, k: 'rush', w: `${r.name} starts`, d: `${LEVEL_LABEL[r.level]}. Runs about ${dur(r.end - r.start)} to ${fmt(r.end)}. Peak at ${fmt(r.peakMin)} (~${money(r.peakSales)} per 15 min). About ${money(r.total)} through the rush.` });
    ev.push({ t: r.end, k: 'reset', w: `Reset after the ${r.name.toLowerCase()}`, d: '30 minutes to clean and restock.', list: RESET });
  });
  an.breaks.forEach((b) => ev.push({ t: b.start, k: 'break', w: `Break window ${fmt(b.start)} – ${fmt(b.end)}`, d: `Send ${b.send} at a time. Longest breaks first.${an.bestBreak === b ? ' Best window of the day.' : ''}` }));
  an.hourly.forEach((o) => {
    const near = an.rushes.some((r) => o.h * 60 > r.start - 60 && o.h * 60 < r.end);
    if (near) return;
    if (o.dF < 0 || o.dB < 0)
      ev.push({ t: o.h * 60, k: 'cut', w: `Crew drops to ${o.foh} FOH / ${o.boh} BOH`, d: `Cut or send on break: ${[o.dF < 0 ? -o.dF + ' FOH' : '', o.dB < 0 ? -o.dB + ' BOH' : ''].filter(Boolean).join(', ')}.` });
    else if (o.dF > 0 || o.dB > 0)
      ev.push({ t: o.h * 60, k: 'add', w: `Crew goes up to ${o.foh} FOH / ${o.boh} BOH`, d: `Bring in ${[o.dF > 0 ? o.dF + ' FOH' : '', o.dB > 0 ? o.dB + ' BOH' : ''].filter(Boolean).join(', ')}.` });
  });
  const ord = ['stock', 'ready', 'rush', 'reset', 'break', 'cut', 'add'];
  return ev.sort((a, b) => a.t - b.t || ord.indexOf(a.k) - ord.indexOf(b.k));
}

export type FloorState = ReturnType<typeof floorState>;
export function floorState(an: Analysis, now: number) {
  const { L, step } = an;
  const ci = L.findIndex((r) => now >= r.min && now < r.min + step);
  const cur = an.rushes.find((r) => now >= r.start && now < r.end);
  const next = an.rushes.find((r) => r.start > now);
  const target: Peak | undefined = cur || next;
  const nextPeak = an.rushes.find((r) => r.peakMin >= now);
  const nowRow = ci >= 0 ? L[ci] : now < an.open ? L[0] : L[L.length - 1];
  const brNow = an.breaks.find((b) => now >= b.start && now < b.end);
  const brNext = an.breaks.find((b) => b.start > now);
  let cls: 'steady' | 'coming' | 'inrush' | 'closed', tag: string, head: string, sub: string;
  if (now < an.open) {
    cls = 'steady'; tag = 'Before open'; head = `Doors at ${fmt(an.open)}`;
    sub = next ? `First rush: ${next.name.toLowerCase()} at ${fmt(next.start)}, about ${dur(next.end - next.start)}.` : 'No rush forecast today.';
  } else if (now >= an.close) {
    cls = 'closed'; tag = 'Closed'; head = 'Day is done'; sub = 'Turn off the live clock and pick a time to walk the day.';
  } else if (cur && cur.level === 'light') {
    cls = 'coming'; tag = 'Light bump'; head = `${cur.name}: peak at ${fmt(cur.peakMin)}`;
    sub = `Small push until ${fmt(cur.end)}. Hold ${cur.peakFoh} FOH / ${cur.peakBoh} BOH on the line and keep breaks moving.`;
  } else if (cur) {
    cls = 'inrush'; tag = 'In the rush'; head = `${cur.name}: ${dur(cur.end - now)} left`;
    sub = `Peak at ${fmt(cur.peakMin)}. Hold positions. No breaks until ${fmt(cur.end)}, then reset.`;
  } else if (next && next.level !== 'light' && next.start - now <= 45) {
    cls = 'coming'; tag = 'Rush coming'; head = `${next.name} in ${dur(next.start - now)}`;
    sub = `Starts ${fmt(next.start)} and runs about ${dur(next.end - next.start)} to ${fmt(next.end)}. Finish stock-up and pull breaks back now.`;
  } else if (next) {
    cls = 'steady'; tag = 'Steady'; head = `Next: ${next.name.toLowerCase()} at ${fmt(next.start)}`;
    sub = `${dur(next.start - now)} away. Runs about ${dur(next.end - next.start)}. ${brNow ? 'Good time for breaks.' : 'Use the quiet time to stock and clean.'}`;
  } else {
    cls = 'steady'; tag = 'Winding down'; head = 'No more rushes today'; sub = 'Run the closing plan. Cut to minimums as the counts drop.';
  }
  return { ci, cur, next, target, nextPeak, nowRow, brNow, brNext, cls, tag, head, sub };
}

/** What the countdown counts to: end of the current rush, start of the next one, or the next peak. */
export function countdownTarget(st: FloorState, now: number): { t: number; label: string } | null {
  if (st.cur) return { t: st.cur.end, label: `${st.cur.name} ends in` };
  if (st.nextPeak && st.nextPeak.start > now) return { t: st.nextPeak.start, label: `${st.nextPeak.name} in` };
  if (st.nextPeak) return { t: st.nextPeak.peakMin, label: `${st.nextPeak.dp} peak in` };
  return null;
}

export function lineupFor(st: FloorState) {
  const t = st.target;
  return t ? lineup(t.peakFoh, t.peakBoh, t.peakMin) : lineup(st.nowRow.foh, st.nowRow.boh, st.nowRow.min);
}

export function huddleText(an: Analysis, now: number, dayLabel: string) {
  const st = floorState(an, now), t = st.target, lu = lineupFor(st);
  const list = (d: { counts: Record<string, number> }) => Object.entries(d.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ');
  const out = [`HUEYTOWN HUDDLE · ${dayLabel} ${fmt(now)}`, `${st.tag.toUpperCase()}: ${st.head}`, st.sub, '', `On the clock now: ${st.nowRow.foh} FOH / ${st.nowRow.boh} BOH`];
  if (t) out.push(
    `${t.name}: ${fmt(t.start)}–${fmt(t.end)} (${dur(t.end - t.start)}), peak ${fmt(t.peakMin)}`,
    `Crew for the peak: ${t.peakFoh} FOH / ${t.peakBoh} BOH. On position by ${fmt(t.start - 15)}.`,
    `Stock-up starts ${fmt(Math.max(an.open, t.start - 45))}. Reset at ${fmt(t.end)}.`);
  out.push('', 'PEAKS TODAY', ...an.peaks.map((p) => p.none
    ? `${p.dp}: busiest 15 at ${p.peakMin != null ? fmt(p.peakMin) : '—'} (${p.why.toLowerCase()})`
    : `${p.dp}: peak ${fmt(p.peakMin)} · window ${fmt(p.start)}–${fmt(p.end)} · ${p.peakFoh} FOH / ${p.peakBoh} BOH${now >= p.end ? ' (done)' : ''}`));
  out.push('', `BOH: ${list(lu.boh)}`, `FOH: ${list(lu.foh)}`);
  if (st.brNow) out.push(`Breaks: send now until ${fmt(st.brNow.end)}, ${st.brNow.send} at a time.`);
  else if (st.brNext) out.push(`Breaks: next window ${fmt(st.brNext.start)}–${fmt(st.brNext.end)}.`);
  return out.join('\n');
}

export function shiftText(an: Analysis, shifts: (Shift & { who?: string })[], title: string) {
  const line = (sh: Shift & { who?: string }) => `${sh.tag.padEnd(6)} ${fmt(sh.start)} – ${fmt(sh.end)} (${sh.hrs}h)  ${sh.who?.trim() || '____________'}`;
  const F = shifts.filter((x) => x.side === 'foh'), B = shifts.filter((x) => x.side === 'boh');
  return [
    `HUEYTOWN SHIFT PLAN · ${title}`,
    `Forecast ${money(an.total)} · ${an.rushes.map((p) => `${p.dp} peak ${fmt(p.peakMin)}`).join(' · ')}`,
    '', `FOH (${F.length})`, ...F.map(line), '', `BOH (${B.length})`, ...B.map(line),
  ].join('\n');
}

export const dayLabel = (f: 'all' | number) => (f === 'all' ? 'Average day' : WD[f]);
