import { useMemo, useState } from 'react';
import { backend } from '../lib/backend';
import { overridesFor, useStoreCfg } from '../hooks/storeContext';
import { motion } from 'framer-motion';
import {
  analyze, backtest, daysFor, dur, fmt, fmtShort, forecastFrom, LEVEL_LABEL, money, prettyDate, WD,
  type Analysis, type Day, type DayFilter, type Hour, type SavedPlan, type Settings,
} from '../lib/engine';
import { Card, ConfirmButton, CountUp, Kpi, Rise, tone, useToast } from './ui';
import { CrewChart, Legend, SalesChart, Spark } from './Charts';
import { ShiftBuilder } from './ShiftBuilder';

type Props = { an: Analysis; ds: Day[]; days: Day[]; filter: DayFilter; setFilter: (f: DayFilter) => void; settings: Settings; plans: SavedPlan[]; canSave: boolean };

export function Scheduler({ an, ds, days, filter, setFilter, settings: s, plans, canSave }: Props) {
  const splh = an.total / an.laborHrs, lab = (an.laborHrs * s.wage * 100) / an.total;
  const bt = useMemo(() => backtest(days, filter, s), [days, filter, s]);
  const label = filter === 'all' ? 'All-days' : WD[filter];
  const basis = ds.length
    ? `Built from ${ds.length} ${filter === 'all' ? 'days' : WD[filter] + (ds.length > 1 ? 's' : '')}${ds[0].dn != null ? ` (${prettyDate(ds[0].key)} – ${prettyDate(ds[ds.length - 1].key)})` : ''} · ${s.method === 'smart' ? 'smart average' : 'straight average'} · planning for a ${s.plan} day${s.adj ? ` · ${s.adj > 0 ? '+' : ''}${s.adj}% adjustment` : ''}`
    : '';

  return (
    <div className="grid gap-[18px]">
      <Rise className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3.5">
        <div className="min-w-0">
          <h2 className="font-display text-[clamp(38px,6vw,60px)] font-extrabold uppercase leading-[.95]">
            <span className="text-red">{label}</span> forecast
          </h2>
          <p className="mt-2 max-w-[68ch] text-muted">{basis}</p>
        </div>
        <Accuracy bt={bt} />
      </Rise>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,175px),1fr))] gap-3">
        <Kpi label="Forecast sales" sub={`Normal range ${money(an.low)}–${money(an.high)}`} delay={1}><CountUp value={an.total} format={money} /></Kpi>
        <Kpi label="Peak crew" sub="FOH / BOH at the busiest 15" delay={1.5}>
          <span className="text-foh"><CountUp value={an.peakFoh} /></span> / <span className="text-red-text"><CountUp value={an.peakBoh} /></span>
        </Kpi>
        <Kpi label="Labor hours" sub={`${fmt(an.open)} – ${fmt(an.close)}`} delay={2}><CountUp value={an.laborHrs} format={(v) => v.toFixed(1)} /></Kpi>
        <Kpi label="Projected SPLH" sub={`Goal $${s.splhGoal} · building $${s.splh}`} tone={tone(splh, s.splhGoal, s.splh)} delay={2.5}>
          <CountUp value={splh} format={(v) => '$' + Math.round(v)} />
        </Kpi>
        <Kpi label="Est. labor %" sub={`Target ${s.laborTarget}% at $${s.wage.toFixed(2)}/hr`} tone={tone(lab, s.laborTarget, s.laborTarget + 2, false)} delay={3}>
          <CountUp value={lab} format={(v) => v.toFixed(1) + '%'} />
        </Kpi>
      </div>

      <PeakCards an={an} />
      <WeekStrip days={days} filter={filter} setFilter={setFilter} s={s} />

      <Card title="Sales by 15 minutes" sub="Shaded band = normal range across your days. Every daypart's peak is marked." delay={4}>
        <SalesChart an={an} />
        <Legend items={[['#E51636', 'Rush window'], ['#F2AA3C', 'Light bump'], ['#76696F', 'Normal'], ['rgba(246,240,242,.07)', 'Normal range', true], ['#33260F', 'Stock-up / reset', true], ['#112B22', 'Break window', true]]} />
      </Card>

      <ShiftBuilder an={an} s={s} filter={filter} plans={plans} canSave={canSave} />

      <Card title="Crew needed" sub="Headcount on the clock for each 15 minutes" delay={5}>
        <CrewChart an={an} />
        <Legend items={[['#6FA9FF', 'FOH'], ['#E51636', 'BOH']]} />
      </Card>

      <HourTable an={an} filter={filter} />
    </div>
  );
}

function Accuracy({ bt }: { bt: ReturnType<typeof backtest> }) {
  if (!bt)
    return (
      <div className="tile grid min-w-[min(100%,250px)] gap-1">
        <span className="label">Accuracy check</span>
        <span className="text-sm text-muted">Load 3 or more of the same weekday and the tool tests itself against the latest one.</span>
      </div>
    );
  const pct = 100 - bt.dayErr * 100;
  const one = 'key' in bt ? bt : null;
  return (
    <div className="tile grid min-w-[min(100%,250px)] max-w-[420px] gap-1">
      <span className="label">{one ? `Accuracy check · ${prettyDate(one.key)}` : `Accuracy check · ${bt.multi} weekdays`}</span>
      <span className={`font-display text-[32px] font-bold leading-none ${bt.dayErr <= 0.06 ? 'text-ok' : bt.dayErr <= 0.12 ? 'text-warn' : 'text-red-text'}`}>{pct.toFixed(0)}% on the day</span>
      <div className="h-2 overflow-hidden rounded-full bg-panel3">
        <motion.i className="block h-full rounded-full bg-gradient-to-r from-ok to-[#7EE0B5]" initial={{ width: 0 }} animate={{ width: `${Math.max(4, pct)}%` }} transition={{ duration: 1, delay: 0.2 }} />
      </div>
      <span className="text-sm text-muted">
        {one ? `Forecast ${money(one.pred)} from earlier ${one.wd != null ? WD[one.wd] + 's' : 'days'}, actual came in at ${money(one.actual)}.` : "Each weekday's latest day, forecast from the ones before it."}{' '}
        15-min slots ran within {(bt.slotErr * 100).toFixed(0)}%.
      </span>
    </div>
  );
}

const lvlTop = { big: 'border-t-red', medium: 'border-t-red-text', light: 'border-t-warn' } as const;
const lvlPill = { big: 'bg-red-soft text-red-text', medium: 'bg-red-soft text-red-text', light: 'bg-warn-soft text-warn' } as const;

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-2 border-t border-line pt-1.5 text-[15px]"><span>{k}</span><b className="num">{children}</b></div>;
}

export function PeakCards({ an }: { an: Analysis }) {
  return (
    <Card title="Peaks by daypart" sub="Every daypart gets its own peak, not just the biggest one of the day" delay={3}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-3">
        {an.dayparts.map((d, i) => {
          const p = d.peak;
          return (
            <Rise key={d.name} delay={i + 2} className={`grid content-start gap-1 rounded-2xl border border-line border-t-4 bg-panel2 px-4 py-3.5 ${p && !p.none ? lvlTop[p.level] : 'border-t-faint opacity-75'}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[22px] font-bold uppercase tracking-[0.03em]">{d.name}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.08em] ${p && !p.none ? lvlPill[p.level] : 'bg-panel3 text-muted'}`}>{p && !p.none ? LEVEL_LABEL[p.level] : 'Ramp'}</span>
              </div>
              {p && !p.none ? (
                <>
                  <span className="label">Peak 15</span>
                  <span className="font-display text-[46px] font-bold leading-none num">{fmt(p.peakMin)}</span>
                  <div className="mb-1.5 text-[15px] text-muted num"><b className="text-fg">{fmt(p.start)} – {fmt(p.end)}</b> · {dur(p.end - p.start)}</div>
                  <Row k="Peak sales / 15">{money(p.peakSales)}</Row>
                  <Row k="Crew at peak"><span className="text-foh">{p.peakFoh} FOH</span> · <span className="text-red-text">{p.peakBoh} BOH</span></Row>
                  <Row k="On position by">{fmt(p.start - 15)}</Row>
                </>
              ) : (
                <>
                  {p?.peakMin != null && <><span className="label">Busiest 15</span><span className="font-display text-[46px] font-bold leading-none num">{fmt(p.peakMin)}</span></>}
                  <div className="text-[15px] text-muted num">{fmt(d.from)} – {fmt(d.to)}</div>
                  <p className="mb-1.5 text-sm text-muted">{p ? p.why : 'No sales in this daypart'}, so there's no separate rush. Staff to the hourly counts.</p>
                </>
              )}
              <Row k="Daypart sales">{money(d.sales)}</Row>
              <Row k="Labor hrs">{d.hrs.toFixed(1)}</Row>
            </Rise>
          );
        })}
      </div>
    </Card>
  );
}

function WeekStrip({ days, filter, setFilter, s }: { days: Day[]; filter: DayFilter; setFilter: (f: DayFilter) => void; s: Settings }) {
  const { positions, overrides } = useStoreCfg();
  const res = useMemo(() => {
    const wds = [...new Set(days.map((d) => d.wd).filter((v): v is number => v != null))].sort((a, b) => a - b);
    return wds.map((w) => { const ds = daysFor(days, w); const an = analyze(forecastFrom(ds, s), s, { positions, overrides: overridesFor(overrides, w) }); return an && { w, an, n: ds.length }; })
      .filter((x): x is { w: number; an: Analysis; n: number } => !!x);
  }, [days, s, positions, overrides]);
  if (res.length < 2) return null;
  const mx = Math.max(...res.map((r) => Math.max(...r.an.L.map((x) => x.sales))));
  return (
    <Card title="Your week" sub="Tap a day to plan it. Every day in your data feeds its weekday." delay={3.5}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-2.5">
        {res.map(({ w, an, n }) => {
          const on = filter === w;
          return (
            <motion.button key={w} type="button" whileHover={{ y: -2 }} onClick={() => { setFilter(w); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              aria-current={on} className={`grid gap-1 rounded-2xl border p-3 text-left transition-colors ${on ? 'border-red bg-gradient-to-b from-red-soft to-panel2 shadow-[0_6px_18px_rgba(229,22,54,.18)]' : 'border-line bg-panel2 hover:border-faint'}`}>
              <span className="flex justify-between font-display text-xl font-bold uppercase tracking-[0.04em]">{WD[w].slice(0, 3)}<span className="font-body text-xs font-normal normal-case tracking-normal text-muted">{n} day{n > 1 ? 's' : ''}</span></span>
              <span className="font-display text-[28px] font-bold leading-none num">{money(an.total)}</span>
              <span className="text-[13px] text-muted num"><span className="text-foh">{an.peakFoh}</span> FOH · <span className="text-red-text">{an.peakBoh}</span> BOH peak</span>
              <Spark an={an} max={mx} />
              <span className="text-[13px] text-muted num">{an.laborHrs.toFixed(0)} labor hrs · ${Math.round(an.total / an.laborHrs)} SPLH</span>
              <span className="flex flex-wrap gap-1">
                {an.rushes.map((p) => (
                  <span key={p.dp} className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold num ${p.level === 'light' ? 'bg-warn-soft text-warn' : 'bg-red-soft text-red-text'}`}>{p.dp[0]} {fmtShort(p.peakMin)}</span>
                ))}
              </span>
            </motion.button>
          );
        })}
      </div>
    </Card>
  );
}

function Move({ o }: { o: Hour }) {
  const pill = (d: number, side: string) => d ? <span key={side} className={`mr-1 inline-block rounded-full px-2 py-0.5 text-[13px] font-bold ${d > 0 ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>{d > 0 ? '+' : '−'}{Math.abs(d)} {side}</span> : null;
  return o.dF || o.dB ? <>{pill(o.dF, 'FOH')}{pill(o.dB, 'BOH')}</> : <span className="text-sm text-muted">hold</span>;
}

function HourTable({ an, filter }: { an: Analysis; filter: DayFilter }) {
  const { overrides, canSave } = useStoreCfg();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const mine = overridesFor(overrides, filter);
  const editedHours = Object.keys(mine).length;
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

  const cell = (o: Hour, side: 'foh' | 'boh') => {
    const v = o[side], auto = side === 'foh' ? o.autoFoh : o.autoBoh, changed = v !== auto;
    const c = side === 'foh' ? 'text-foh' : 'text-red-text';
    if (!editing) return <span className={`font-bold ${c}`}>{v}{changed && <span className="ml-1 text-xs text-warn" title={`Forecast said ${auto}`}>✎</span>}</span>;
    return (
      <span className="inline-flex items-center gap-1">
        <Step label={`One less ${side.toUpperCase()} at ${fmt(o.h * 60)}`} onClick={() => setCount(o.h, side, v - 1, auto)} disabled={v <= 0}>−</Step>
        <span className={`w-8 text-center font-display text-xl font-bold ${c} ${changed ? 'underline decoration-warn decoration-2 underline-offset-4' : ''}`}>{v}</span>
        <Step label={`One more ${side.toUpperCase()} at ${fmt(o.h * 60)}`} onClick={() => setCount(o.h, side, v + 1, auto)}>+</Step>
        {changed && <span className="ml-1 text-xs text-muted">was {auto}</span>}
      </span>
    );
  };

  return (
    <Card title="Hour by hour" sub="Build the schedule to these counts. Moves show who comes in or gets cut at the top of the hour." delay={7}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <button type="button" className={`btn ${editing ? 'btn-primary' : ''}`} disabled={!canSave} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done editing' : 'Edit counts'}
        </button>
        {editedHours > 0 && (
          <>
            <span className="rounded-full bg-warn-soft px-3 py-1.5 text-sm font-bold text-warn">{editedHours} hour{editedHours > 1 ? 's' : ''} hand-edited</span>
            <ConfirmButton onConfirm={resetAll} confirmText="Tap again to undo all edits">Reset to forecast</ConfirmButton>
          </>
        )}
        <span className="text-sm text-muted">
          {editing ? `Tap − or + to move people. Edits save for ${filter === 'all' ? 'the all-days view' : WD[filter] + 's'} and change the shifts, labor, and floor plan.` : 'Know your store better than the math? Edit the counts hour by hour.'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse num ${editing ? 'min-w-[760px]' : 'min-w-[600px]'}`}>
          <thead>
            <tr className="text-xs uppercase tracking-[0.08em] text-muted">
              {['Hour', 'Sales', 'Range', ...(an.hasTrans ? ['Trans'] : []), 'FOH', 'BOH', 'Total', 'Moves'].map((h, i, a) => (
                <th key={h} className={`border-b border-line px-2.5 py-2.5 font-bold ${i === 0 || i === a.length - 1 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {an.hourly.map((o) => (
              <tr key={o.h} className={`transition-colors hover:bg-panel2 ${o.edited ? 'bg-warn-soft/40' : ''}`}>
                <td className="whitespace-nowrap border-b border-line px-2.5 py-2.5" style={o.rush ? { boxShadow: 'inset 4px 0 0 #E51636' } : undefined}>
                  {fmt(o.h * 60)}{o.rush && <span className="text-sm text-muted"> · rush</span>}
                </td>
                <td className="border-b border-line px-2.5 text-right">{money(o.sales)}</td>
                <td className="border-b border-line px-2.5 text-right text-[13px] text-faint">{money(o.low)}–{money(o.high)}</td>
                {an.hasTrans && <td className="border-b border-line px-2.5 text-right">{o.hasT ? Math.round(o.trans) : '–'}</td>}
                <td className="whitespace-nowrap border-b border-line px-2.5 text-right">{cell(o, 'foh')}</td>
                <td className="whitespace-nowrap border-b border-line px-2.5 text-right">{cell(o, 'boh')}</td>
                <td className="border-b border-line px-2.5 text-right">{o.foh + o.boh}</td>
                <td className="whitespace-nowrap border-b border-line px-2.5"><Move o={o} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Step({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel3 text-lg font-bold transition hover:border-muted active:scale-95 disabled:opacity-30">{children}</button>
  );
}
