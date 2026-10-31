import { backend } from '../lib/backend';
import type { DayFilter } from '../lib/engine';
import { useToast } from '../components/ui';
import { overridesFor, useStoreCfg } from './storeContext';

/** Hand-edit FOH/BOH for an hour. Saved for that weekday, shared with the store. */
export function useHourEdit(filter: DayFilter) {
  const { overrides, canSave } = useStoreCfg();
  const toast = useToast();
  const mine = overridesFor(overrides, filter);
  const fk = String(filter);
  const setCount = (h: number, side: 'foh' | 'boh', value: number, auto: number) => {
    const cur = { ...(mine[String(h)] ?? {}) };
    if (value === auto) delete cur[side]; else cur[side] = Math.max(0, value);
    const day = { ...mine };
    if (cur.foh == null && cur.boh == null) delete day[String(h)]; else day[String(h)] = cur;
    const next = { ...overrides, [fk]: day };
    if (!Object.keys(day).length) delete next[fk];
    backend.saveOverrides(next).catch((e: Error) => toast(`Couldn't save: ${e.message}`));
  };
  const resetAll = () => {
    const next = { ...overrides };
    delete next[fk];
    backend.saveOverrides(next).then(() => toast('Back to the forecast counts')).catch((e: Error) => toast(`Couldn't save: ${e.message}`));
  };
  return { mine, setCount, resetAll, canSave, editedHours: Object.keys(mine).length };
}
