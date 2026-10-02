export const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 750 → "12:30 PM" */
export function fmt(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
/** 750 → "12:30p", 720 → "12p" */
export function fmtShort(min: number): string {
  return fmt(min).replace(':00', '').replace(' AM', 'a').replace(' PM', 'p');
}
export function dur(m: number): string {
  const v = Math.max(0, Math.round(m));
  const h = Math.floor(v / 60);
  const r = v % 60;
  return h ? `${h} hr${r ? ` ${r} min` : ''}` : `${r} min`;
}
export const money = (v: number) => '$' + Math.round(v).toLocaleString('en-US');
export function prettyDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${MON[+m[2] - 1]} ${+m[3]}` : iso;
}
export function isoFor(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export const dayNum = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
export function weekdayOfIso(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : null;
}
/** Next calendar date (local) that falls on weekday `wd`, today included. */
export function nextDateFor(wd: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
  return isoFor(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
