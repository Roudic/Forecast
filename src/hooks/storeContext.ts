import { createContext, useContext } from 'react';
import { DEFAULT_POSITIONS, type Overrides, type Positions } from '../lib/engine';
import type { OverrideMap } from '../lib/backend';

/** Store-wide config every screen reads: line positions and hand-edited counts. */
export const StoreCtx = createContext<{ positions: Positions; overrides: OverrideMap; canSave: boolean }>({
  positions: DEFAULT_POSITIONS, overrides: {}, canSave: true,
});
export const useStoreCfg = () => useContext(StoreCtx);
export const overridesFor = (o: OverrideMap, f: 'all' | number): Overrides => o[String(f)] ?? {};
