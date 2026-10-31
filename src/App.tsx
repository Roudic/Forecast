import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyze, buildForecast, CsvError, daysFor, isoFor, nowMinutes, paceAdjust, parseCSV, type Day, type DayFilter } from './lib/engine';
import { backend } from './lib/backend';
import { useAccess, useClock, useDeviceState, useStoreData } from './hooks/useStore';
import { TopBar, dayOptions, Mark, type Mode } from './components/TopBar';
import { Scheduler } from './components/Scheduler';
import { Floor } from './components/Floor';
import { KitchenTV } from './components/KitchenTV';
import { DataPanel, SettingsPanel } from './components/Panels';
import { JoinStore } from './components/JoinStore';
import { ToastHost, useToast } from './components/ui';
import { overridesFor, StoreCtx } from './hooks/storeContext';

export default function App() {
  const [access, setAccess] = useAccess();
  return (
    <ToastHost>
      {access.state === 'loading' && <Splash text="Connecting to the store…" />}
      {access.state === 'error' && <Splash text={access.error} error />}
      {access.state === 'join' && <JoinStore error={access.error} onJoined={() => setAccess({ state: 'ready' })} />}
      {access.state === 'ready' && <Main />}
    </ToastHost>
  );
}

function Splash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <Mark />
        <p className={error ? 'rounded-xl border border-red bg-red-soft px-4 py-3 font-bold' : 'text-muted'}>{text}</p>
      </div>
    </div>
  );
}

function Main() {
  const toast = useToast();
  const { loading, days, realDays, isSample, settings, plans, error, overrides } = useStoreData(true);
  const [mode, setMode] = useDeviceState<Mode>('rf.mode', 'sched');
  const [filter, setFilter] = useState<DayFilter | null>(null);
  const [live, setLive] = useState(true);
  const [manual, setManual] = useState(10 * 60 + 35);
  const [tv, setTv] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const clock = useClock(mode === 'floor');

  const options = useMemo(() => dayOptions(days), [days]);
  // default to today's weekday when the data has it
  useEffect(() => {
    if (filter !== null && options.some((o) => o.v === filter)) return;
    const today = new Date().getDay();
    setFilter(options.some((o) => o.v === today) ? today : options[0].v);
  }, [options, filter]);
  const f: DayFilter = filter ?? 'all';

  const ds = useMemo(() => daysFor(days, f), [days, f]);
  const fc = useMemo(() => buildForecast(days, f, settings), [days, f, settings]);
  const baseAn = useMemo(() => analyze(fc.rows, settings, { overrides: overridesFor(overrides, f) }), [fc, settings, overrides, f]);
  const canSave = !isSample || backend.mode === 'local';
  const cfg = useMemo(() => ({ overrides, canSave }), [overrides, canSave]);

  const liveMin = nowMinutes(clock);
  const useLive = live && !!baseAn && !(isSample && (liveMin < baseAn.open || liveMin >= baseAn.close));
  const now = useLive ? liveMin : manual;

  // live pace: sales so far today, entered on the floor; only for today's weekday, only on this device
  const todayIso = isoFor(clock.getFullYear(), clock.getMonth() + 1, clock.getDate());
  const [paceIn, setPaceIn] = useDeviceState<{ date: string; amount: number }>('rf.pace', { date: '', amount: 0 });
  const paceAmount = paceIn.date === todayIso ? paceIn.amount : 0;
  const paceOk = mode === 'floor' && paceAmount > 0 && (f === 'all' || f === clock.getDay());
  const paced = useMemo(() => (paceOk ? paceAdjust(fc.rows, now, paceAmount) : null), [paceOk, fc, now, paceAmount]);
  const an = useMemo(() => (paced ? analyze(paced.rows, settings, { overrides: overridesFor(overrides, f) }) : baseAn), [paced, baseAn, settings, overrides, f]);

  const onFiles = useCallback(async (files: File[]) => {
    setUploading(true);
    const bad: string[] = [];
    let parsed: Day[] = [];
    for (const file of files) {
      try { parsed = parsed.concat(parseCSV(await file.text(), file.name)); }
      catch (e) { bad.push(e instanceof CsvError ? e.message : `${file.name}: ${(e as Error).message}`); }
    }
    setErrs(bad);
    if (parsed.length) {
      try {
        await backend.saveDays(parsed);
        const keys = new Set([...realDays.map((d) => d.key), ...parsed.map((d) => d.key)]);
        toast(`Added ${parsed.length} day${parsed.length > 1 ? 's' : ''} · ${keys.size} saved`);
        setFilter(null);
      } catch (e) { setErrs((x) => [...x, `Couldn't save to the database: ${(e as Error).message}`]); }
    }
    setUploading(false);
  }, [realDays, toast]);

  const exitTV = useCallback(() => setTv(false), []);

  if (loading) return <Splash text="Loading sales data…" />;

  if (tv && mode === 'floor' && an)
    return <StoreCtx.Provider value={cfg}><KitchenTV an={an} filter={f} now={now} clock={useLive ? clock : null} onExit={exitTV} /></StoreCtx.Provider>;

  return (
    <StoreCtx.Provider value={cfg}>
    <div className="mx-auto max-w-[1200px] px-4 pb-14">
      <TopBar mode={mode} setMode={setMode} filter={f} setFilter={setFilter} options={options} isSample={isSample}
        dayCount={realDays.length} onFiles={onFiles} uploading={uploading} />
      {(errs.length > 0 || error) && (
        <div className="mt-3.5 grid gap-2">
          {error && <div className="rounded-xl border border-red bg-red-soft px-4 py-3 font-bold">Database: {error}</div>}
          {errs.map((m) => <div key={m} className="rounded-xl border border-red bg-red-soft px-4 py-3 font-bold">{m}</div>)}
        </div>
      )}
      <main className="py-[22px]">
        {!an ? (
          <div className="rounded-xl border border-red bg-red-soft px-4 py-3 font-bold">No sales for this day in your data. Pick another day above.</div>
        ) : mode === 'sched' ? (
          <Scheduler an={an} report={fc.report} ds={ds} days={days} filter={f} setFilter={setFilter} settings={settings} plans={plans} canSave={!isSample || backend.mode === 'local'} />
        ) : (
          <Floor an={an} filter={f} now={now} clock={useLive ? clock : null} live={live}
            setLive={(v) => { if (!v) setManual(now); setLive(v); }} setManual={setManual} onTV={() => setTv(true)}
            pace={paced?.pace ?? null} paceAmount={paceAmount} paceAllowed={f === 'all' || f === clock.getDay()}
            setPace={(amount) => setPaceIn({ date: todayIso, amount })} />
        )}
      </main>
      <div className="grid gap-[18px]">
        <SettingsPanel settings={settings} canSave={canSave} />
        <DataPanel days={realDays} isSample={isSample} />
      </div>
    </div>
    </StoreCtx.Provider>
  );
}
