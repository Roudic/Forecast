import type { Settings } from './types';

/** Hueytown defaults. Every value is editable in the app and saved to Firestore for the whole store. */
export const DEFAULT_SETTINGS: Settings = {
  method: 'smart',
  plan: 'typical',
  splh: 70, // building spot
  rushSplh: 90,
  boh: 45,
  minFoh: 3,
  minBoh: 3, // opening centerline
  wage: 14,
  adj: 0,
  sens: 1.35,
  win: 70,
  minShift: 4,
  maxShift: 8,
  bridge: 60,
  preOpen: 30,
  postClose: 30,
  laborTarget: 19,
  splhGoal: 75,
};

export function withDefaults(s: Partial<Settings> | null | undefined): Settings {
  const out = { ...DEFAULT_SETTINGS };
  if (!s) return out;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = s[k];
    if (v !== undefined && v !== null && !(typeof v === 'number' && isNaN(v))) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
