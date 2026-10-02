/** One 15-minute bucket of sales. `min` = minutes after midnight (6:00 AM = 360). */
export type Slot = { min: number; sales: number; trans: number | null };

/** One business day of 15-minute sales. `key` is an ISO date (2026-09-22) and the Firestore doc id. */
export type Day = {
  key: string;
  wd: number | null; // 0 = Sunday … 6 = Saturday (null when the file had no date)
  dn: number | null; // day number since epoch, for "how many weeks ago"
  slots: Slot[];
  source?: string;
};

export type DayFilter = 'all' | number;

export type FcRow = { min: number; sales: number; avg: number; low: number; high: number; trans: number | null };

export type Level = 'big' | 'medium' | 'light';

export type Row = FcRow & { foh: number; boh: number; crew: number; level: Level | null; rush: boolean };

export type Peak = {
  none: false;
  dp: string;
  i0: number;
  i1: number;
  pk: number;
  start: number;
  end: number;
  peakMin: number;
  peakSales: number;
  total: number;
  level: Level;
  ratio: number;
  name: string;
  peakFoh: number;
  peakBoh: number;
};

export type NoPeak = {
  none: true;
  dp: string;
  from: number;
  to: number;
  peakMin: number | null;
  peakSales: number | null;
  why: string;
};

export type BreakWindow = { start: number; end: number; avg: number; send: number; dp: string };

export type Hour = {
  h: number; sales: number; low: number; high: number; foh: number; boh: number;
  rush: boolean; trans: number; hasT: boolean; dF: number; dB: number;
};

export type Daypart = {
  name: string; sales: number; foh: number; boh: number; hrs: number; from: number; to: number;
  peak: Peak | NoPeak | null;
};

export type Analysis = {
  L: Row[];
  step: number;
  total: number;
  mean: number;
  rushes: Peak[];
  peaks: (Peak | NoPeak)[];
  breaks: BreakWindow[];
  bestBreak: BreakWindow | null;
  hourly: Hour[];
  laborHrs: number;
  dayparts: Daypart[];
  open: number;
  close: number;
  peakFoh: number;
  peakBoh: number;
  hasTrans: boolean;
  low: number;
  high: number;
};

export type Settings = {
  method: 'smart' | 'straight';
  plan: 'typical' | 'busy';
  splh: number;
  rushSplh: number;
  boh: number;
  minFoh: number;
  minBoh: number;
  wage: number;
  adj: number;
  sens: number;
  win: number;
  minShift: number;
  maxShift: number;
  bridge: number;
  preOpen: number;
  postClose: number;
  laborTarget: number;
  splhGoal: number;
};

export type Side = 'foh' | 'boh';
export type Shift = { start: number; end: number; hrs: number; tag: string; side: Side };

export type SavedShift = Shift & { who: string };
export type SavedPlan = {
  id: string;
  name: string;
  planDate: string; // ISO date the plan is for
  weekday: number | null;
  forecastTotal: number;
  shifts: SavedShift[];
  createdAt: number;
  createdBy?: string;
};
