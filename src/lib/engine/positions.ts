/*
 Line positions, editable in the app.
 Each board is an ordered list of SEATS. Seat 1 is the first person you put on the line, seat 2 the second, and so on.
 A station can appear more than once (Primary three times = up to 3 people on Primary).
 With 6 BOH on the clock, the first 6 seats are filled.
*/

export type Side = 'foh' | 'boh';
export type Board = 'am' | 'day';
export type Positions = {
  amCutoff: number; // minutes after midnight when the breakfast board switches to lunch/dinner (630 = 10:30 AM)
  stations: Record<Side, string[]>;
  seats: Record<Side, Record<Board, string[]>>;
};

/** Turns "station + max people + fill order" into a seat list (used to build the defaults). */
function seatsFrom(order: string[], cap: Record<string, number>): string[] {
  const c: Record<string, number> = {};
  const out: string[] = [];
  order.forEach((k) => { if (!(k in c)) c[k] = 0; });
  for (const k of order) if (c[k] < cap[k]) { c[k]++; out.push(k); }
  for (let guard = 0; guard < 10; guard++) {
    let moved = false;
    for (const k of Object.keys(c)) if (c[k] < cap[k]) { c[k]++; out.push(k); moved = true; }
    if (!moved) break;
  }
  return out;
}

const BOH_CAP = { Primary: 3, Secondary: 2, Breading: 2, Machines: 2, Fries: 2, Prep: 2, Biscuits: 2, 'Hash/Egg': 1 };
const FOH_CAP = { 'DT Bagger': 2, 'Face-to-Face (DT)': 3, 'Front Counter': 2, Drinks: 2, 'DT Payment': 1, Runner: 3, Expo: 1, 'Dining Room': 1 };

export const DEFAULT_POSITIONS: Positions = {
  amCutoff: 630,
  stations: {
    boh: ['Primary', 'Secondary', 'Breading', 'Machines', 'Fries', 'Prep', 'Biscuits', 'Hash/Egg'],
    foh: ['DT Bagger', 'Face-to-Face (DT)', 'Front Counter', 'Drinks', 'DT Payment', 'Runner', 'Expo', 'Dining Room'],
  },
  seats: {
    boh: {
      am: seatsFrom(['Primary', 'Breading', 'Biscuits', 'Hash/Egg', 'Secondary', 'Machines', 'Primary', 'Biscuits', 'Prep', 'Breading', 'Secondary', 'Primary', 'Machines', 'Prep'], BOH_CAP),
      day: seatsFrom(['Primary', 'Breading', 'Fries', 'Machines', 'Secondary', 'Primary', 'Prep', 'Breading', 'Secondary', 'Fries', 'Primary', 'Machines', 'Prep'], BOH_CAP),
    },
    foh: {
      am: seatsFrom(['DT Bagger', 'Face-to-Face (DT)', 'Front Counter', 'Drinks', 'DT Payment', 'Runner', 'Face-to-Face (DT)', 'Expo', 'Dining Room', 'DT Bagger', 'Drinks', 'Runner', 'Front Counter', 'Face-to-Face (DT)', 'Runner'], FOH_CAP),
      day: seatsFrom(['DT Bagger', 'Face-to-Face (DT)', 'Front Counter', 'Drinks', 'DT Payment', 'Runner', 'Face-to-Face (DT)', 'Expo', 'Dining Room', 'DT Bagger', 'Drinks', 'Runner', 'Front Counter', 'Face-to-Face (DT)', 'Runner'], FOH_CAP),
    },
  },
};

/** Fills any gaps in a saved config with defaults so an old or partial save never breaks the app. */
export function positionsWithDefaults(p: Partial<Positions> | null | undefined): Positions {
  const d = DEFAULT_POSITIONS;
  if (!p) return structuredClone(d);
  const side = (s: Side) => ({
    am: Array.isArray(p.seats?.[s]?.am) ? p.seats![s].am.filter(Boolean) : [...d.seats[s].am],
    day: Array.isArray(p.seats?.[s]?.day) ? p.seats![s].day.filter(Boolean) : [...d.seats[s].day],
  });
  const seats = { boh: side('boh'), foh: side('foh') };
  const stations = (s: Side) => {
    const base = Array.isArray(p.stations?.[s]) ? p.stations![s].filter(Boolean) : [...d.stations[s]];
    [...seats[s].am, ...seats[s].day].forEach((x) => { if (!base.includes(x)) base.push(x); });
    return base;
  };
  return {
    amCutoff: typeof p.amCutoff === 'number' ? p.amCutoff : d.amCutoff,
    stations: { boh: stations('boh'), foh: stations('foh') },
    seats,
  };
}

/** Most people a side can put on the line (the longer of its two boards). */
export const maxSeats = (p: Positions, s: Side) => Math.max(p.seats[s].am.length, p.seats[s].day.length);

export type Deploy = { counts: Record<string, number>; extra: number; cap: Record<string, number> };

/** Fill the first `n` seats of a board. Every station on the board is listed, even at 0. */
export function deploy(n: number, seats: string[]): Deploy {
  const counts: Record<string, number> = {};
  const cap: Record<string, number> = {};
  seats.forEach((s) => { counts[s] = 0; cap[s] = (cap[s] || 0) + 1; });
  seats.slice(0, Math.max(0, n)).forEach((s) => counts[s]++);
  return { counts, extra: Math.max(0, n - seats.length), cap };
}

export function lineup(foh: number, boh: number, min: number, p: Positions = DEFAULT_POSITIONS) {
  const am = min < p.amCutoff;
  const b: Board = am ? 'am' : 'day';
  return { boh: deploy(boh, p.seats.boh[b]), foh: deploy(foh, p.seats.foh[b]), am };
}
