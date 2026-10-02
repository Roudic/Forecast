import { createContext, useContext } from 'react';
import type { Overrides } from '../lib/engine';
import type { OverrideMap } from '../lib/backend';

/** Store-wide config every screen reads: hand-edited counts. */
export const StoreCtx = createContext<{ overrides: OverrideMap; canSave: boolean }>({ overrides: {}, canSave: true });
export const useStoreCfg = () => useContext(StoreCtx);
export const overridesFor = (o: OverrideMap, f: 'all' | number): Overrides => o[String(f)] ?? {};
