import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  fmt, fmtShort, money, nextDateFor, prettyDate, shiftsFor, shiftSummary, shiftText, WD, weekdayOfIso,
  type Analysis, type DayFilter, type SavedPlan, type SavedShift, type Settings, type Shift,
} from '../lib/engine';
import { backend } from '../lib/backend';
import { Card, ConfirmButton, tone, useCopy, useToast } from './ui';

const TAG = {
  Open: 'bg-foh-soft text-foh', AM: 'bg-foh-soft text-foh', Lunch: 'bg-red-soft text-red-text',
  Mid: 'bg-panel3 text-muted', Dinner: 'bg-warn-soft text-warn', Close: 'bg-ok-soft text-ok',
} as Record<string, string>;

const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function ShiftBuilder({ an, s, filter, plans, canSave }: { an: Analysis; s: Settings; filter: DayFilter; plans: SavedPlan[]; canSave: boolean }) {
  const toast = useToast();
  const { copy, box } = useCopy();
  const built = useMemo<Shift[]>(() => [...shiftsFor(an, 'foh', s), ...shiftsFor(an, 'boh', s)], [an, s]);
  const [planDate, setPlanDate] = useState(() => (filter === 'all' ? isoToday() : nextDateFor(filter)));
  const [loaded, setLoaded] = useState<SavedPlan | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPlanDate(filter === 'all' ? isoToday() : nextDateFor(filter)); setLoaded(null); setNames({}); }, [filter]);

  const shifts: (Shift & { who?: string })[] = loaded ? loaded.shifts : built;
  const keyOf = (sh: Shift, i: number) => `${sh.side}-${i}`;
  const F = shifts.filter((x) => x.side === 'foh'), B = shifts.filter((x) => x.side === 'boh');
  const sum = shiftSummary(an, F, B, s);
  const span: [number, number] = [an.open - s.preOpen, an.close + s.postClose];
  const pc = (m: number) => ((m - span[0]) / (span[1] - span[0])) * 100;
  const ticks: number[] = [];
  for (let m = Math.ceil(span[0] / 120) * 120; m <= span[1]; m += 120) ticks.push(m);
  const withNames = (): SavedShift[] => {
    const idx = { foh: 0, boh: 0 };
    return shifts.map((sh) => { const k = keyOf(sh, idx[sh.side]++); return { start: sh.start, end: sh.end, hrs: sh.hrs, tag: sh.tag, side: sh.side, who: names[k] ?? sh.who ?? '' }; });
  };
  const forThisDate = plans.find((p) => p.planDate === planDate);

  const save = async () => {
    setSaving(true);
    try {
      const plan: SavedPlan = {
        id: planDate, name: `${WD[weekdayOfIso(planDate) ?? 0]} ${prettyDate(planDate)}`, planDate,
        weekday: weekdayOfIso(planDate), forecastTotal: Math.round(an.total), shifts: withNames(), createdAt: Date.now(),
      };
      await backend.savePlan(plan);
      setLoaded(plan);
      toast(`Saved plan for ${plan.name}`);
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`);
    } finally { setSaving(false); }
  };
  const open = (p: SavedPlan) => { setLoaded(p); setPlanDate(p.planDate); setNames({}); window.scrollTo({ top: (document.getElementById('shift-builder')?.offsetTop ?? 0) - 90, behavior: 'smooth' }); };

  const col = (arr: (Shift & { who?: string })[], side: 'foh' | 'boh') => {
    const hrs = arr.reduce((a, x) => a + x.hrs, 0);
    return (
      <div className="min-w-0">
        <h3 className={`mb-1.5 text-xl uppercase tracking-[0.04em] ${side === 'foh' ? 'text-foh' : 'text-red-text'}`}>{side.toUpperCase()} · {arr.length} shifts · {hrs.toFixed(1)} hrs</h3>
        <div className="relative ml-[78px] mr-0 h-[18px] text-[11px] text-muted md:mr-[290px]">
          {ticks.map((m) => <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap num" style={{ left: `${pc(m)}%` }}>{fmtShort(m)}</span>)}
        </div>
        {arr.map((sh, i) => {
          const k = keyOf(sh, i);
          return (
            <div key={k} className="grid grid-cols-[70px_1fr] items-center gap-x-2 gap-y-1 py-[3px] md:grid-cols-[70px_1fr_120px_160px]">
              <span className={`rounded-md py-[3px] text-center text-[11px] font-bold uppercase tracking-[0.06em] ${TAG[sh.tag] ?? ''}`}>{sh.tag}</span>
              <div className="relative h-[22px] overflow-hidden rounded-[7px] bg-panel2">
                {ticks.map((m) => <b key={m} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pc(m)}%` }} />)}
                <motion.i className={`absolute inset-y-[3px] rounded-[5px] ${side === 'foh' ? 'bg-gradient-to-r from-foh to-[#9CC4FF]' : 'bg-gradient-to-r from-red to-red-text'}`}
                  style={{ left: `${pc(sh.start)}%`, width: `${pc(sh.end) - pc(sh.start)}%`, originX: 0 }}
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: 0.15 + i * 0.035, ease: [0.2, 0.8, 0.2, 1] }} />
              </div>
              <span className="col-start-2 whitespace-nowrap text-[13px] text-muted num md:col-start-auto">{fmtShort(sh.start)}–{fmtShort(sh.end)} · {+sh.hrs.toFixed(2)}h</span>
              <input aria-label={`Name for ${side.toUpperCase()} ${sh.tag} ${fmt(sh.start)}`} placeholder="Name" value={names[k] ?? sh.who ?? ''}
                onChange={(e) => setNames((n) => ({ ...n, [k]: e.target.value }))}
                className="col-start-2 min-h-9 rounded-lg border border-line bg-panel2 px-2.5 text-sm md:col-start-auto" />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="shift-builder">
      <Card title="Shift builder" sub={`The crew curve turned into real shifts. ${s.minShift}–${s.maxShift} hr shifts, openers in ${s.preOpen} min early, closers stay ${s.postClose} min.`} delay={5.5}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="label">Plan for</span>
            <input type="date" id="plan-date" value={planDate} onChange={(e) => { setPlanDate(e.target.value); setLoaded(null); }} className="field !w-auto" />
          </label>
          {loaded
            ? <span className="rounded-full bg-ok-soft px-3 py-1.5 text-sm font-bold text-ok">Editing saved plan · {loaded.name}</span>
            : forThisDate && <button type="button" className="btn btn-sm" onClick={() => open(forThisDate)}>Open the saved plan for {prettyDate(planDate)}</button>}
          {loaded && <button type="button" className="btn btn-sm" onClick={() => { setLoaded(null); setNames({}); }}>Rebuild from forecast</button>}
        </div>

        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,175px),1fr))] gap-3">
          <Stat label="Shifts to fill" v={<><span className="text-foh">{F.length}</span> / <span className="text-red-text">{B.length}</span></>} sub="FOH / BOH" />
          <Stat label="Scheduled hours" v={sum.hrs.toFixed(1)} sub={`${sum.overCurve >= 0 ? '+' : ''}${sum.overCurve.toFixed(1)} over the exact curve`} />
          <Stat label="Scheduled SPLH" v={'$' + Math.round(sum.splh)} t={tone(sum.splh, s.splhGoal, s.splh)} sub="What this schedule actually runs" />
          <Stat label="Scheduled labor %" v={sum.labor.toFixed(1) + '%'} t={tone(sum.labor, s.laborTarget, s.laborTarget + 2, false)} sub={`Target ${s.laborTarget}%`} />
        </div>

        <div className="grid gap-6">{col(F, 'foh')}{col(B, 'boh')}</div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !canSave}>{saving ? 'Saving…' : forThisDate && !loaded ? 'Replace saved plan' : 'Save plan'}</button>
          <button type="button" className="btn" onClick={() => copy(shiftText(an, withNames(), `${WD[weekdayOfIso(planDate) ?? 0]} ${prettyDate(planDate)}`), 'Shift list copied')}>Copy shift list</button>
          <span className="text-sm text-muted">{canSave ? 'Saved plans show up on every iPad in the store.' : 'Upload your own sales data to save plans.'}</span>
        </div>
        {box}

        {plans.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xl uppercase tracking-[0.04em]">Saved plans</h3>
            <div className="grid gap-2">
              {plans.slice(0, 12).map((p) => {
                const filled = p.shifts.filter((x) => x.who.trim()).length;
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <b className="font-display text-xl">{p.name}</b>
                      <span className="ml-2 text-sm text-muted num">{p.shifts.length} shifts · {filled}/{p.shifts.length} named · forecast {money(p.forecastTotal)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-sm" onClick={() => open(p)}>Open</button>
                      <ConfirmButton className="btn btn-sm" confirmText="Tap to delete" onConfirm={() => backend.deletePlan(p.id).then(() => toast('Plan deleted'))}>Delete</ConfirmButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, v, sub, t }: { label: string; v: React.ReactNode; sub: string; t?: 'good' | 'meh' | 'bad' }) {
  const c = t === 'good' ? 'text-ok' : t === 'meh' ? 'text-warn' : t === 'bad' ? 'text-red-text' : '';
  return (
    <div className="tile flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={`font-display text-[34px] font-bold leading-[1.05] num ${c}`}>{v}</span>
      <span className="text-sm text-muted">{sub}</span>
    </div>
  );
}
