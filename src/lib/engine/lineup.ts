/* Station caps and fill order. Hueytown: Primary up to 3, Secondary up to 2, Breading up to 2.
   Breakfast swaps Fries for Biscuits + Hash/Egg. Edit these lists to match your deployment chart. */

export const BOH_CAP: Record<string, number> = {
  Primary: 3, Secondary: 2, Breading: 2, Machines: 2, Fries: 2, Prep: 2, Biscuits: 2, 'Hash/Egg': 1,
};
const BOH_ORDER_AM = ['Primary', 'Breading', 'Biscuits', 'Hash/Egg', 'Secondary', 'Machines', 'Primary', 'Biscuits', 'Prep', 'Breading', 'Secondary', 'Primary', 'Machines', 'Prep'];
const BOH_ORDER = ['Primary', 'Breading', 'Fries', 'Machines', 'Secondary', 'Primary', 'Prep', 'Breading', 'Secondary', 'Fries', 'Primary', 'Machines', 'Prep'];

export const FOH_CAP: Record<string, number> = {
  'DT Bagger': 2, 'Face-to-Face (DT)': 3, 'Front Counter': 2, Drinks: 2, 'DT Payment': 1, Runner: 3, Expo: 1, 'Dining Room': 1,
};
const FOH_ORDER = ['DT Bagger', 'Face-to-Face (DT)', 'Front Counter', 'Drinks', 'DT Payment', 'Runner', 'Face-to-Face (DT)', 'Expo', 'Dining Room', 'DT Bagger', 'Drinks', 'Runner', 'Front Counter', 'Face-to-Face (DT)', 'Runner'];

export type Deploy = { counts: Record<string, number>; extra: number; cap: Record<string, number> };

function deployOrdered(n: number, order: string[], cap: Record<string, number>): Deploy {
  const c: Record<string, number> = {};
  order.forEach((k) => { if (!(k in c)) c[k] = 0; });
  let left = n;
  for (const k of order) { if (left <= 0) break; if (c[k] < cap[k]) { c[k]++; left--; } }
  let guard = 0;
  while (left > 0 && guard++ < 10) {
    let moved = false;
    for (const k of Object.keys(c)) { if (left <= 0) break; if (c[k] < cap[k]) { c[k]++; left--; moved = true; } }
    if (!moved) break;
  }
  return { counts: c, extra: left, cap };
}

export function lineup(foh: number, boh: number, min: number) {
  const am = min < 630;
  return { boh: deployOrdered(boh, am ? BOH_ORDER_AM : BOH_ORDER, BOH_CAP), foh: deployOrdered(foh, FOH_ORDER, FOH_CAP), am };
}
