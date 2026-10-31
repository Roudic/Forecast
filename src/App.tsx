import { useCallback, useMemo, useState } from 'react';
import { addDays, analyze, applyWhatIf, buildForecast, NO_WHATIF, type WhatIf, CsvError, daysFor, isoOf, longDate, nowMinutes, paceAdjust, parseCSV, WD, weekdayOfIso, type Day, type DayFilter } from './lib/engine';
import { backend } from './lib/backend';
import { useAccess, useClock, useDeviceState, useStoreData } from './hooks/useStore';
import { TopBar, Mark, type Mode } from './components/TopBar';
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
  const [mode, setMode] = useDeviceState<Mode>('rf.tab', 'live');
  const [live, setLive] = useState(true);
  const [manual, setManual] = useState(10 * 60 + 35);
  const [tv, setTv] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const clock = useClock(mode === 'live');
  const todayIso = isoOf(clock);

  // which weekdays the data actually has (closed Sundays won't)
  const haveWd = useMemo(() => new Set(days.map((d) => d.wd).filter((w): w is number => w != null)), [days]);
  // Look Ahead date: defaults to the next open day after today
  const [aheadPick, setAheadPick] = useState<string | null>(null);
  const firstOpen = useMemo(() => {
    for (let i = 1; i <= 7; i++) { const iso = addDays(todayIso, i); if (haveWd.has(weekdayOfIso(iso)!)) return iso; }
    return addDays(todayIso, 1);
  }, [todayIso, haveWd]);
  const aheadDate = aheadPick && aheadPick > todayIso ? aheadPick : firstOpen;

  // Live always means today. Look Ahead means the picked date. Both forecast from that date's weekday.
  const targetIso = mode === 'live' ? todayIso : aheadDate;
  const targetWd = weekdayOfIso(targetIso)!;
  const noHistory = haveWd.size > 0 && !haveWd.has(targetWd);
  const f: DayFilter = haveWd.size === 0 ? 'all' : targetWd;

  const ds = useMemo(() => daysFor(days, f), [days, f]);
  const fc = useMemo(() => buildForecast(days, f, settings), [days, f, settings]);
  // what-if (Look Ahead only), saved per date on this device
  const [whatIfs, setWhatIfs] = useDeviceState<Record<string, WhatIf>>('rf.whatif', {});
  const whatIf = mode === 'ahead' ? whatIfs[aheadDate] ?? NO_WHATIF : NO_WHATIF;
  const setWhatIf = useCallback((w: WhatIf) => setWhatIfs((all) => {
    const next = Object.fromEntries(Object.entries(all).filter(([k]) => k >= todayIso)); // drop past dates
    if (!w.pct && !w.adds.length) delete next[aheadDate]; else next[aheadDate] = w;
    return next;
  }), [aheadDate, todayIso, setWhatIfs]);
  const rows = useMemo(() => applyWhatIf(fc.rows, whatIf), [fc, whatIf]);
  const baseTotal = useMemo(() => fc.rows.reduce((a, r) => a + r.sales, 0), [fc]);
  const baseAn = useMemo(() => (noHistory ? null : analyze(rows, settings, { overrides: overridesFor(overrides, f) })), [rows, settings, overrides, f, noHistory]);
  const canSave = !isSample || backend.mode === 'local';
  const cfg = useMemo(() => ({ overrides, canSave }), [overrides, canSave]);

  const liveMin = nowMinutes(clock);
  const useLive = live && !!baseAn && !(isSample && (liveMin < baseAn.open || liveMin >= baseAn.close));
  const now = useLive ? liveMin : manual;

  // live pace: sales so far today, entered on the Live tab, only on this device
  const [paceIn, setPaceIn] = useDeviceState<{ date: string; amount: number }>('rf.pace', { date: '', amount: 0 });
  const paceAmount = paceIn.date === todayIso ? paceIn.amount : 0;
  const paceOk = mode === 'live' && paceAmount > 0 && !noHistory;
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
      } catch (e) { setErrs((x) => [...x, `Couldn't save to the database: ${(e as Error).message}`]); }
    }
    setUploading(false);
  }, [realDays, toast]);

  const exitTV = useCallback(() => setTv(false), []);

  if (loading) return <Splash text="Loading sales data…" />;

  if (tv && mode === 'live' && an)
    return <StoreCtx.Provider value={cfg}><KitchenTV an={an} filter={f} now={now} clock={useLive ? clock : null} onExit={exitTV} /></StoreCtx.Provider>;

  return (
    <StoreCtx.Provider value={cfg}>
    <div className="mx-auto max-w-[1200px] px-4 pb-14">
      <TopBar mode={mode} setMode={(m) => { setMode(m); window.scrollTo({ top: 0 }); }} isSample={isSample}
        dayCount={realDays.length} onFiles={onFiles} uploading={uploading} />
      {(errs.length > 0 || error) && (
        <div className="mt-3.5 grid gap-2">
          {error && <div className="rounded-xl border border-red bg-red-soft px-4 py-3 font-bold">Database: {error}</div>}
          {errs.map((m) => <div key={m} className="rounded-xl border border-red bg-red-soft px-4 py-3 font-bold">{m}</div>)}
        </div>
      )}
      <main className="py-[22px]">
        {!an ? (
          <div className="card grid gap-3">
            <span className="label">{mode === 'live' ? 'Today · Live' : 'Look Ahead'} · {longDate(targetIso)}</span>
            <h2 className="font-display text-4xl font-extrabold uppercase">{targetWd === 0 ? 'Closed Sunday' : `No ${WD[targetWd]}s in your data yet`}</h2>
            <p className="text-muted">{targetWd === 0 ? 'Enjoy the day off.' : `Upload a few ${WD[targetWd]} 15-minute exports and this day gets a forecast.`}</p>
            {mode === 'live' && <button type="button" className="btn btn-primary w-fit" onClick={() => setMode('ahead')}>Look ahead to {longDate(firstOpen)}</button>}
          </div>
        ) : mode === 'ahead' ? (
          <Scheduler whatIf={whatIf} setWhatIf={setWhatIf} baseTotal={baseTotal} an={an} report={fc.report} ds={ds} days={days} filter={f} date={aheadDate} todayIso={todayIso} setDate={setAheadPick} settings={settings} plans={plans} canSave={canSave} />
        ) : (
          <>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-sm font-bold uppercase tracking-[0.08em] text-ok"><span className="h-2 w-2 animate-pulse rounded-full bg-ok" />Live</span>
            <h2 className="font-display text-[clamp(30px,5vw,44px)] font-extrabold uppercase leading-none">Today · {longDate(todayIso)}</h2>
            <button type="button" className="ml-auto text-sm font-bold text-muted underline-offset-4 hover:underline" onClick={() => setMode('ahead')}>Need tomorrow? Look Ahead →</button>
          </div>
          <Floor an={an} filter={f} now={now} clock={useLive ? clock : null} live={live}
            setLive={(v) => { if (!v) setManual(now); setLive(v); }} setManual={setManual} onTV={() => setTv(true)}
            pace={paced?.pace ?? null} paceAmount={paceAmount} paceAllowed
            setPace={(amount) => setPaceIn({ date: todayIso, amount })} />
          </>
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
