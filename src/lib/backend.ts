import {
  collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth, db, firebaseEnabled, STORE_ID } from './firebase';
import type { Day, Overrides, Positions, SavedPlan, Settings } from './engine';
import { positionsWithDefaults, withDefaults } from './engine';

/** Hand-edited counts, keyed by day filter ('all' or weekday number) then hour. */
export type OverrideMap = Record<string, Overrides>;

/*
 Firestore layout (all under stores/{STORE_ID}):
   members/{uid}        { name, code, joinedAt }      who can read/write this store
   config/settings      Settings                      one shared set of settings for every leader
   config/positions     Positions                     stations + seat order for FOH/BOH, breakfast and lunch/dinner
   config/overrides     { [day]: { [hour]: {foh, boh} } }   hand-edited counts per weekday
   days/{YYYY-MM-DD}    { key, wd, dn, source, uploadedAt, slots: [{m, s, t}] }   one doc per business day
   plans/{id}           SavedPlan                     shift plans with names on them
 storeSecrets/{STORE_ID} { joinCode }                 never readable from the app; rules check it on join
*/

export interface Backend {
  mode: 'firebase' | 'local';
  subscribeDays(cb: (days: Day[]) => void, onErr?: (e: Error) => void): () => void;
  subscribeSettings(cb: (s: Settings) => void): () => void;
  subscribePlans(cb: (p: SavedPlan[]) => void): () => void;
  subscribePositions(cb: (p: Positions) => void): () => void;
  subscribeOverrides(cb: (o: OverrideMap) => void): () => void;
  savePositions(p: Positions): Promise<void>;
  saveOverrides(o: OverrideMap): Promise<void>;
  saveDays(days: Day[]): Promise<void>;
  deleteDay(key: string): Promise<void>;
  clearDays(keys: string[]): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  savePlan(p: SavedPlan): Promise<void>;
  deletePlan(id: string): Promise<void>;
}

/* ---------- Firestore ---------- */
type DayDoc = { key: string; wd: number | null; dn: number | null; source?: string; slots: { m: number; s: number; t: number | null }[] };
const toDoc = (d: Day): DayDoc => ({
  key: d.key, wd: d.wd, dn: d.dn, source: d.source ?? '',
  slots: d.slots.map((x) => ({ m: x.min, s: Math.round(x.sales * 100) / 100, t: x.trans })),
});
const fromDoc = (d: DayDoc): Day => ({
  key: d.key, wd: d.wd, dn: d.dn, source: d.source, slots: (d.slots || []).map((x) => ({ min: x.m, sales: x.s, trans: x.t ?? null })),
});

function firestoreBackend(): Backend {
  const store = (...p: string[]) => [`stores/${STORE_ID}`, ...p].join('/');
  const fdb = db!;
  return {
    mode: 'firebase',
    subscribeDays(cb, onErr) {
      return onSnapshot(collection(fdb, store('days')), (snap) => cb(snap.docs.map((d) => fromDoc(d.data() as DayDoc))), (e) => onErr?.(e));
    },
    subscribeSettings(cb) {
      return onSnapshot(doc(fdb, store('config', 'settings')), (snap) => cb(withDefaults(snap.exists() ? (snap.data() as Partial<Settings>) : null)));
    },
    subscribePlans(cb) {
      return onSnapshot(collection(fdb, store('plans')), (snap) =>
        cb(snap.docs.map((d) => d.data() as SavedPlan).sort((a, b) => b.planDate.localeCompare(a.planDate) || b.createdAt - a.createdAt)));
    },
    async saveDays(days) {
      // Firestore batches cap at 500 writes
      for (let i = 0; i < days.length; i += 400) {
        const b = writeBatch(fdb);
        days.slice(i, i + 400).forEach((d) => b.set(doc(fdb, store('days', d.key)), { ...toDoc(d), uploadedAt: serverTimestamp(), uploadedBy: auth?.currentUser?.uid ?? null }));
        await b.commit();
      }
    },
    deleteDay: (key) => deleteDoc(doc(fdb, store('days', key))),
    async clearDays(keys) {
      for (let i = 0; i < keys.length; i += 400) {
        const b = writeBatch(fdb);
        keys.slice(i, i + 400).forEach((k) => b.delete(doc(fdb, store('days', k))));
        await b.commit();
      }
    },
    saveSettings: (s) => setDoc(doc(fdb, store('config', 'settings')), { ...s, updatedAt: serverTimestamp() }),
    subscribePositions(cb) {
      return onSnapshot(doc(fdb, store('config', 'positions')), (snap) => cb(positionsWithDefaults(snap.exists() ? (snap.data() as Partial<Positions>) : null)));
    },
    subscribeOverrides(cb) {
      return onSnapshot(doc(fdb, store('config', 'overrides')), (snap) => cb(snap.exists() ? ((snap.data().byDay ?? {}) as OverrideMap) : {}));
    },
    savePositions: (p) => setDoc(doc(fdb, store('config', 'positions')), { ...p, updatedAt: serverTimestamp() }),
    saveOverrides: (o) => setDoc(doc(fdb, store('config', 'overrides')), { byDay: o, updatedAt: serverTimestamp() }),
    savePlan: (p) => setDoc(doc(fdb, store('plans', p.id)), { ...p, createdBy: auth?.currentUser?.uid ?? null }),
    deletePlan: (id) => deleteDoc(doc(fdb, store('plans', id))),
  };
}

/* ---------- Demo mode: this browser only ---------- */
function localBackend(): Backend {
  const K = { days: 'rf.days', settings: 'rf.settings', plans: 'rf.plans', positions: 'rf.positions', overrides: 'rf.overrides' };
  const subs: Record<string, Set<(v: unknown) => void>> = { days: new Set(), settings: new Set(), plans: new Set(), positions: new Set(), overrides: new Set() };
  const read = <T,>(k: string, fb: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fb; } catch { return fb; } };
  const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
  const emit = (name: keyof typeof K, v: unknown) => { write(K[name], v); subs[name].forEach((f) => f(v)); };
  const sub = <T,>(name: keyof typeof K, fb: T, cb: (v: T) => void) => {
    const f = cb as (v: unknown) => void;
    subs[name].add(f);
    queueMicrotask(() => cb(read(K[name], fb)));
    return () => subs[name].delete(f);
  };
  return {
    mode: 'local',
    subscribeDays: (cb) => sub<Day[]>('days', [], cb),
    subscribeSettings: (cb) => sub<Settings>('settings', withDefaults(null), (v) => cb(withDefaults(v))),
    subscribePlans: (cb) => sub<SavedPlan[]>('plans', [], cb),
    async saveDays(days) {
      const cur = read<Day[]>(K.days, []);
      const keys = new Set(days.map((d) => d.key));
      emit('days', [...cur.filter((d) => !keys.has(d.key)), ...days]);
    },
    async deleteDay(key) { emit('days', read<Day[]>(K.days, []).filter((d) => d.key !== key)); },
    async clearDays(keys) { const k = new Set(keys); emit('days', read<Day[]>(K.days, []).filter((d) => !k.has(d.key))); },
    async saveSettings(s) { emit('settings', s); },
    subscribePositions: (cb) => sub<Positions | null>('positions', null, (v) => cb(positionsWithDefaults(v))),
    subscribeOverrides: (cb) => sub<OverrideMap>('overrides', {}, cb),
    async savePositions(p) { emit('positions', p); },
    async saveOverrides(o) { emit('overrides', o); },
    async savePlan(p) { emit('plans', [p, ...read<SavedPlan[]>(K.plans, []).filter((x) => x.id !== p.id)]); },
    async deletePlan(id) { emit('plans', read<SavedPlan[]>(K.plans, []).filter((x) => x.id !== id)); },
  };
}

export const backend: Backend = firebaseEnabled ? firestoreBackend() : localBackend();

/* ---------- Access: anonymous sign-in + store join code ---------- */
export type Access = { state: 'loading' } | { state: 'join'; error?: string } | { state: 'ready' } | { state: 'error'; error: string };

export function watchAccess(cb: (a: Access) => void): () => void {
  if (!firebaseEnabled || !auth || !db) { cb({ state: 'ready' }); return () => {}; }
  const fdb = db;
  const off = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      signInAnonymously(auth!).catch((e: Error) => cb({ state: 'error', error: `Couldn't sign in: ${e.message}. Check that Anonymous sign-in is turned on in Firebase.` }));
      return;
    }
    try {
      const m = await getDoc(doc(fdb, `stores/${STORE_ID}/members/${user.uid}`));
      cb(m.exists() ? { state: 'ready' } : { state: 'join' });
    } catch (e) {
      cb({ state: 'error', error: `Couldn't reach the database: ${(e as Error).message}` });
    }
  });
  return off;
}

export async function joinStore(code: string, name: string): Promise<void> {
  if (!auth?.currentUser || !db) return;
  try {
    await setDoc(doc(db, `stores/${STORE_ID}/members/${auth.currentUser.uid}`), { code: code.trim(), name: name.trim(), joinedAt: serverTimestamp() });
  } catch {
    throw new Error("That code didn't work. Check it with your director and try again.");
  }
}
