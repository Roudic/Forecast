import { useEffect, useMemo, useState } from 'react';
import { backend, type Access, type OverrideMap, watchAccess } from '../lib/backend';
import { DEFAULT_POSITIONS, DEFAULT_SETTINGS, makeSample, type Day, type Positions, type SavedPlan, type Settings } from '../lib/engine';

export function useAccess() {
  const [access, setAccess] = useState<Access>({ state: 'loading' });
  useEffect(() => watchAccess(setAccess), []);
  return [access, setAccess] as const;
}

/** Live data for the store. Falls back to marked sample data until real days are uploaded. */
export function useStoreData(enabled: boolean) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Positions>(DEFAULT_POSITIONS);
  const [overrides, setOverrides] = useState<OverrideMap>({});

  useEffect(() => {
    if (!enabled) return;
    const a = backend.subscribeDays(setDays, (e) => setError(e.message));
    const b = backend.subscribeSettings(setSettings);
    const c = backend.subscribePlans(setPlans);
    const d = backend.subscribePositions(setPositions);
    const e = backend.subscribeOverrides(setOverrides);
    return () => { a(); b(); c(); d(); e(); };
  }, [enabled]);

  const sample = useMemo(() => makeSample(), []);
  const isSample = !!days && days.length === 0;
  return { loading: days === null, days: isSample ? sample : days ?? [], realDays: days ?? [], isSample, settings, plans, error, positions, overrides };
}

/** Per-device preferences (mode, last day picked). Safe if storage is blocked. */
export function useDeviceState<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : init; } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV] as const;
}

/** Ticks every second. Returns the Date so countdowns can show seconds. */
export function useClock(active = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
