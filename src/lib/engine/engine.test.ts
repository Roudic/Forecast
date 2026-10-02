import { describe, expect, it } from 'vitest';
import {
  analyze, backtest, daysFor, DEFAULT_SETTINGS, forecastFrom, makeSample, parseCSV, shiftsFor, buildPlan, floorState, huddleText,
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
