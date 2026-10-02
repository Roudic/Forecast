import type { Day, Slot } from './types';
import { dayNum, isoFor } from './format';

/* Reads any 15-minute sales export: a time column, a sales column, an optional date column,
   optional transactions. Handles "6:00 AM", "06:00", "11:45-12:00 PM", "$1,200.50", "(12.00)". */

function splitCSV(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type T = { h: number; m: number; ap: 'a' | 'p' | null };
function timesIn(str: string): T[] {
  const re = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?/gi;
  const res: T[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) res.push({ h: +m[1], m: +m[2], ap: m[3] ? (m[3].toLowerCase() as 'a' | 'p') : null });
  return res;
}
function to24(t: T, ap: 'a' | 'p' | null) {
  let h = t.h % 12;
  if (ap === 'p') h += 12;
  if (!ap) h = t.h;
  return h * 60 + t.m;
}
type Parsed = number | { raw: number; noap: true };
function parseTime(str: string): Parsed | null {
  const ts = timesIn(str);
  if (!ts.length) return null;
  const a = ts[0];
  if (a.ap) return to24(a, a.ap);
  const later = ts.find((x) => x.ap);
  if (later) {
    const end = to24(later, later.ap);
    let best = 0;
    let bd = 1e9;
    [to24(a, 'a'), to24(a, 'p')].forEach((o) => {
      let d = end - o;
      if (d <= 0) d += 1440;
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }
  // 24-hour clock, or a 12-hour clock with no AM/PM (1:00–5:59 is afternoon in a restaurant)
  return { raw: (a.h >= 1 && a.h <= 5 ? a.h + 12 : a.h) * 60 + a.m, noap: true };
}
type D = { key: string; wd: number | null; dn: number | null };
export function parseDate(str: string): D | null {
  let m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return mk(y, +m[1], +m[2]);
  }
  return null;
}
function mk(y: number, mo: number, d: number): D {
  return { key: isoFor(y, mo, d), wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), dn: dayNum(y, mo, d) };
}
function money2num(s: string | undefined): number {
  if (s == null) return NaN;
  const t = String(s).trim();
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const n = parseFloat(t.replace(/[^0-9.]/g, ''));
  return neg ? -n : n;
}

export class CsvError extends Error {}

export function parseCSV(text: string, fileName: string): Day[] {
  const name = fileName.replace(/\.(csv|txt)$/i, '');
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new CsvError(`${name}: the file looks empty.`);
  const rows = lines.map(splitCSV);
  const head = rows[0].map((h) => h.toLowerCase());
  const hasHeader = !timesIn(rows[0].join(' ')).length;
  const body = hasHeader ? rows.slice(1) : rows;
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  let ti = -1, di = -1, si = -1, xi = -1;
  if (hasHeader) {
    ti = find(/time|interval|period|hour|start|slot/);
    di = head.findIndex((h) => /date|business|day/.test(h) && !/daypart|part/.test(h));
    si = find(/net/);
    if (si < 0) si = find(/sales|gross|amount|revenue|total|\$/);
    xi = find(/trans|count|orders|checks|guests|\btc\b|tickets/);
    if (si === ti || si === di) si = -1;
  }
  const ncol = Math.max(...body.slice(0, 20).map((r) => r.length));
  if (ti < 0) {
    for (let c = 0; c < ncol; c++) if (body.slice(0, 10).some((r) => r[c] && timesIn(r[c]).length)) { ti = c; break; }
  }
  if (ti < 0) throw new CsvError(`${name}: couldn't find a time column. It needs times like 6:00 AM or 06:00.`);
  if (si < 0) {
    let best = -1, bs = -1;
    for (let c = 0; c < ncol; c++) {
      if (c === ti || c === di || c === xi) continue;
      let sum = 0, ok = 0;
      body.forEach((r) => {
        const v = money2num(r[c]);
        if (!isNaN(v) && !timesIn(r[c] || '').length && !/\//.test(r[c] || '')) { sum += v; ok++; }
      });
      if (ok > body.length * 0.6 && sum > bs) { bs = sum; best = c; }
    }
    si = best;
  }
  if (si < 0) throw new CsvError(`${name}: couldn't find a sales column. Name it "Sales" or "Net Sales".`);

  const fallback: D = parseDate(name) || { key: `undated-${name}`, wd: null, dn: null };
  type R = { d: D; t: Parsed; sales: number; trans: number | null };
  const out: R[] = [];
  body.forEach((r) => {
    const tstr = r[ti] || '';
    const t = parseTime(tstr);
    if (t == null) return;
    const sales = money2num(r[si]);
    if (isNaN(sales)) return;
    const d = parseDate(di >= 0 ? r[di] || '' : tstr) || parseDate(tstr) || fallback;
    const trans = xi >= 0 ? money2num(r[xi]) : NaN;
    out.push({ d, t, sales, trans: isNaN(trans) ? null : trans });
  });
  // times with no AM/PM: keep file order and roll into the afternoon when the clock goes backwards
  const byKey = new Map<string, R[]>();
  out.forEach((r) => { if (typeof r.t !== 'number') (byKey.get(r.d.key) || byKey.set(r.d.key, []).get(r.d.key)!).push(r); });
  byKey.forEach((list) => {
    let prev = -1, add = 0;
    list.forEach((r) => {
      let v = (r.t as { raw: number }).raw + add;
      if (prev >= 0 && v < prev - 60) { add += 720; v += 720; }
      r.t = v;
      prev = v;
    });
  });
  if (out.length < 4) throw new CsvError(`${name}: only ${out.length} usable rows. Is this the 15-minute sales export?`);

  const days = new Map<string, Day>();
  out.forEach((r) => {
    let day = days.get(r.d.key);
    if (!day) { day = { key: r.d.key, wd: r.d.wd, dn: r.d.dn, slots: [], source: name }; days.set(r.d.key, day); }
    const min = r.t as number;
    const s = day.slots.find((x) => x.min === min);
    if (s) { s.sales += r.sales; if (r.trans != null) s.trans = (s.trans || 0) + r.trans; }
    else day.slots.push({ min, sales: r.sales, trans: r.trans } as Slot);
  });
  days.forEach((d) => d.slots.sort((a, b) => a.min - b.min));
  return [...days.values()];
}
