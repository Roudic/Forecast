import { describe, expect, it } from 'vitest';
import {
  applyWhatIf, momentAt, paceAdjust, smartForecast, buildForecast, analyze, backtest, daysFor, DEFAULT_SETTINGS, forecastFrom, makeSample, parseCSV, shiftsFor, buildPlan, floorState, huddleText,
} from './index';

const S = DEFAULT_SETTINGS;

describe('csv', () => {
  it('reads dates, money, and 12-hour times', () => {
    const days = parseCSV('Date,Time,Net Sales,Transactions\n9/22/2026,11:45 AM,"$1,200.50",9\n9/22/2026,12:00 PM,300,12\n9/22/2026,12:15 PM,140.75,15\n9/29/2026,12:00 PM,500,1\n9/29/2026,12:15 PM,500,1', 'x.csv');
    expect(days.map((d) => d.key)).toEqual(['2026-09-22', '2026-09-29']);
    expect(days[0].wd).toBe(2);
    expect(days[0].slots[0]).toEqual({ min: 705, sales: 1200.5, trans: 9 });
  });
  it('reads interval ranges and times with no AM/PM', () => {
    const [d] = parseCSV('Interval,Sales\n11:45-12:00 PM,10\n12:00-12:15 PM,20\n1:00,5\n13:15,6', 'Day.csv');
    expect(d.slots.map((s) => s.min)).toEqual([705, 720, 780, 795]);
  });
  it('explains a file with no sales column', () => {
    expect(() => parseCSV('Time,Name\n6:00 AM,a\n6:15 AM,b\n6:30 AM,c\n6:45 AM,d', 'bad.csv')).toThrow(/sales column/);
  });
});

describe('forecast + peaks', () => {
  const days = makeSample();
  it('finds a peak in every rush daypart on a Friday', () => {
    const an = analyze(forecastFrom(daysFor(days, 5), S), S)!;
    const names = an.rushes.map((r) => r.dp);
    expect(names).toEqual(expect.arrayContaining(['Breakfast', 'Lunch', 'Dinner']));
    const lunch = an.rushes.find((r) => r.dp === 'Lunch')!;
    expect(lunch.peakMin).toBeGreaterThanOrEqual(705);
    expect(lunch.peakMin).toBeLessThanOrEqual(780);
  });
  it('backtests within 15% on the day', () => {
    const bt = backtest(days, 'all', S)!;
    expect(bt.dayErr).toBeLessThan(0.15);
  });
  it('builds shifts that respect min and max length and cover the peak', () => {
    const an = analyze(forecastFrom(daysFor(days, 5), S), S)!;
    for (const side of ['foh', 'boh'] as const) {
      const sh = shiftsFor(an, side, S);
      sh.forEach((x) => { expect(x.hrs).toBeGreaterThanOrEqual(S.minShift); expect(x.hrs).toBeLessThanOrEqual(S.maxShift); });
      const peakRow = an.L.reduce((a, r) => (r[side] > a[side] ? r : a));
      const on = sh.filter((x) => x.start <= peakRow.min && x.end > peakRow.min).length;
      expect(on).toBeGreaterThanOrEqual(peakRow[side]);
    }
  });
  it('builds a floor plan and huddle', () => {
    const an = analyze(forecastFrom(daysFor(days, 3), S), S)!;
    expect(buildPlan(an).length).toBeGreaterThan(5);
    expect(floorState(an, 700).tag).toBeTruthy();
    expect(huddleText(an, 700, 'Wednesday')).toMatch(/PEAKS TODAY/);
  });
});

describe('hand edits', () => {
  const days = makeSample();
  it('applies hour edits to the counts', () => {
    const fc = forecastFrom(daysFor(days, 5), S);
    const base = analyze(fc, S)!;
    const edited = analyze(fc, S, { overrides: { '12': { foh: 20, boh: 2 } } })!;
    const row = edited.L.find((r) => r.min === 720)!;
    expect(row.foh).toBe(20);
    expect(row.boh).toBe(2);
    expect(row.edited).toBe(true);
    expect(edited.hourly.find((h) => h.h === 12)!.autoFoh).toBe(base.hourly.find((h) => h.h === 12)!.foh);
  });
});

describe('multi-model forecast', () => {
  const days = makeSample();
  it('grades every model and blends by accuracy', () => {
    const { rows, report } = smartForecast(days, 5, S);
    expect(rows.length).toBeGreaterThan(40);
    expect(report.folds).toBeGreaterThan(0);
    const w = report.models.reduce((a, m) => a + m.weight, 0);
    expect(w).toBeCloseTo(1, 5);
    expect(report.models.filter((m) => m.weight > 0).length).toBeGreaterThan(0);
  });
  it('falls back to the single average when asked', () => {
    const f = buildForecast(days, 5, { ...S, method: 'smart' });
    expect(f.report.method).toBe('smart');
    expect(f.rows.length).toBeGreaterThan(40);
  });
  it('raises the rest of the day when running hot, leaves the past alone', () => {
    const { rows } = smartForecast(days, 5, S);
    const now = 12 * 60;
    const expected = rows.filter((r) => r.min + 15 <= now).reduce((a, r) => a + r.sales, 0);
    const p = paceAdjust(rows, now, expected * 1.2)!;
    expect(p.pace.ratio).toBeCloseTo(1.2, 2);
    expect(p.pace.applied).toBeGreaterThan(1.05);
    expect(p.pace.applied).toBeLessThan(1.2);
    expect(p.rows.find((r) => r.min === 600)!.sales).toBeCloseTo(rows.find((r) => r.min === 600)!.sales, 5);
    expect(p.rows.find((r) => r.min === 780)!.sales).toBeGreaterThan(rows.find((r) => r.min === 780)!.sales);
  });
});

describe('pinpoint', () => {
  const days = makeSample();
  it('describes any 15 in plain words', () => {
    const an = analyze(smartForecast(days, 5, S).rows, S)!;
    const lunch = an.rushes.find((r) => r.dp === 'Lunch')!;
    expect(momentAt(an, lunch.peakMin).kind).toBe('peak');
    expect(momentAt(an, lunch.start - 30).kind).toBe('stock');
    expect(momentAt(an, lunch.start - 10).kind).toBe('lock');
    expect(momentAt(an, lunch.end).kind).toBe('reset');
    const m = momentAt(an, lunch.peakMin);
    expect(m.foh + m.boh).toBeGreaterThan(5);
    expect(m.doneShare).toBeGreaterThan(0);
    expect(m.doneShare).toBeLessThan(1);
  });
});

describe('what-if', () => {
  it('scales the day and puts catering in the 30 min before pickup', () => {
    const { rows } = smartForecast(makeSample(), 5, S);
    const tot = (r: { sales: number }[]) => r.reduce((a, x) => a + x.sales, 0);
    const up = applyWhatIf(rows, { pct: 10, adds: [] });
    expect(tot(up) / tot(rows)).toBeCloseTo(1.1, 5);
    const cat = applyWhatIf(rows, { pct: 0, adds: [{ min: 690, amount: 800 }] });
    expect(tot(cat) - tot(rows)).toBeCloseTo(800, 5);
    expect(cat.find((r) => r.min === 660)!.sales - rows.find((r) => r.min === 660)!.sales).toBeCloseTo(400, 5);
    expect(cat.find((r) => r.min === 690)!.sales).toBeCloseTo(rows.find((r) => r.min === 690)!.sales, 5);
    expect(applyWhatIf(rows, { pct: 0, adds: [] })).toBe(rows);
  });
});
