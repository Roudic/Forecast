import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyze, CsvError, daysFor, forecastFrom, nowMinutes, parseCSV, type Day, type DayFilter } from './lib/engine';
import { backend } from './lib/backend';
import { useAccess, useClock, useDeviceState, useStoreData } from './hooks/useStore';
import { TopBar, dayOptions, Mark, type Mode } from './components/TopBar';
import { Scheduler } from './components/Scheduler';
import { Floor } from './components/Floor';
import { KitchenTV } from './components/KitchenTV';
import { DataPanel, SettingsPanel } from './components/Panels';
import { JoinStore } from './components/JoinStore';
import { ToastHost, useToast } from './components/ui';
import { PositionsEditor } from './components/PositionsEditor';
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
  const { loading, days, realDays, isSample, settings, plans, error, positions, overrides } = useStoreData(true);
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
  const an = useMemo(() => analyze(forecastFrom(ds, settings), settings, { positions, overrides: overridesFor(overrides, f) }), [ds, settings, positions, overrides, f]);
  const canSave = !isSample || backend.mode === 'local';
  const cfg = useMemo(() => ({ positions, overrides, canSave }), [positions, overrides, canSave]);

  const liveMin = nowMinutes(clock);
  const useLive = live && !!an && !(isSample && (liveMin < an.open || liveMin >= an.close));
  const now = useLive ? liveMin : manual;

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
          <Scheduler an={an} ds={ds} days={days} filter={f} setFilter={setFilter} settings={settings} plans={plans} canSave={!isSample || backend.mode === 'local'} />
        ) : (
          <Floor an={an} filter={f} now={now} clock={useLive ? clock : null} live={live}
            setLive={(v) => { if (!v) setManual(now); setLive(v); }} setManual={setManual} onTV={() => setTv(true)} />
        )}
      </main>
      <div className="grid gap-[18px]">
        <PositionsEditor />
        <SettingsPanel settings={settings} canSave={canSave} />
        <DataPanel days={realDays} isSample={isSample} />
      </div>
    </div>
    </StoreCtx.Provider>
  );
}
