import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, prettyDate, WD, type Day, type Settings } from '../lib/engine';
import { backend } from '../lib/backend';
import { ConfirmButton, useToast } from './ui';

type F = { k: keyof Settings; label: string; hint: string; min?: number; max?: number; step?: number; opts?: [string, string][] };
const GROUPS: { title: string; fields: F[] }[] = [
  { title: 'Forecast', fields: [
    { k: 'method', label: 'Averaging', hint: "Smart drops each slot's best and worst day and leans on recent weeks", opts: [['smart', 'Smart average (recommended)'], ['straight', 'Straight average']] },
    { k: 'plan', label: 'Plan for', hint: 'Busy day staffs to a better-than-usual day (80th percentile)', opts: [['typical', 'Typical day'], ['busy', 'Busy day']] },
    { k: 'adj', label: 'Sales adjustment (%)', hint: '+10 for a promo day, −15 for bad weather', step: 1 },
  ] },
  { title: 'Rushes', fields: [
    { k: 'win', label: 'Rush window (%)', hint: "15s within this % of a daypart's peak count as its rush", min: 40, max: 95, step: 5 },
    { k: 'sens', label: 'Big rush level', hint: '1.35 = peak runs 35% above the day average. Big rushes staff at Rush SPLH.', min: 1.05, max: 3, step: 0.05 },
  ] },
  { title: 'Staffing', fields: [
    { k: 'splh', label: 'SPLH target', hint: 'Sales per labor hour for normal periods', min: 20, step: 1 },
    { k: 'rushSplh', label: 'Rush SPLH', hint: 'How hard the crew runs during a big rush', min: 20, step: 1 },
    { k: 'splhGoal', label: 'SPLH goal', hint: 'Turns the SPLH number green', min: 20, step: 1 },
    { k: 'boh', label: 'BOH share of crew (%)', hint: 'The rest goes to FOH', min: 20, max: 70, step: 1 },
    { k: 'minFoh', label: 'Minimum FOH', hint: 'Never schedule below this', min: 1, step: 1 },
    { k: 'minBoh', label: 'Minimum BOH', hint: 'Opening centerline is 3', min: 1, step: 1 },
    { k: 'wage', label: 'Average wage ($/hr)', hint: 'Used for the labor % estimate', min: 7, step: 0.25 },
    { k: 'laborTarget', label: 'Labor % target', hint: 'Turns the labor number green', min: 5, max: 40, step: 0.5 },
  ] },
  { title: 'Shift builder', fields: [
    { k: 'minShift', label: 'Shortest shift (hrs)', hint: "Won't schedule anything shorter", min: 2, max: 8, step: 0.5 },
    { k: 'maxShift', label: 'Longest shift (hrs)', hint: 'Longer coverage splits into two shifts', min: 4, max: 12, step: 0.5 },
    { k: 'bridge', label: 'Keep crew through dips (min)', hint: 'If the need comes back within this long, nobody gets cut', min: 0, max: 180, step: 15 },
    { k: 'preOpen', label: 'Openers in early (min)', hint: 'Before the first sale', min: 0, max: 120, step: 15 },
    { k: 'postClose', label: 'Closers stay (min)', hint: 'After the last sale, for close-down', min: 0, max: 120, step: 15 },
  ] },
];

export function SettingsPanel({ settings, canSave }: { settings: Settings; canSave: boolean }) {
  const toast = useToast();
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const commit = (next: Settings) => { setDraft(next); backend.saveSettings(next).catch((e: Error) => toast(`Couldn't save settings: ${e.message}`)); };

  return (
    <details className="card !py-1.5">
      <summary className="min-h-12 cursor-pointer py-3 font-display text-[22px] font-bold uppercase tracking-[0.05em]">Forecast settings</summary>
      <p className="text-sm text-muted">{backend.mode === 'firebase' ? 'Shared by every leader in the store. A change here changes everyone\'s forecast.' : 'Demo mode: settings stay on this device.'}</p>
      {GROUPS.map((g) => (
        <div key={g.title} className="mt-4">
          <h3 className="mb-2 text-lg uppercase tracking-[0.05em] text-muted">{g.title}</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-3.5">
            {g.fields.map((f) => (
              <label key={f.k} htmlFor={`s-${f.k}`} className="grid content-start gap-1 text-[15px] font-bold">
                {f.label}
                <span className="text-[13px] font-normal text-muted">{f.hint}</span>
                {f.opts ? (
                  <select id={`s-${f.k}`} className="field" disabled={!canSave} value={String(draft[f.k])} onChange={(e) => commit({ ...draft, [f.k]: e.target.value })}>
                    {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input id={`s-${f.k}`} className="field" type="number" disabled={!canSave} min={f.min} max={f.max} step={f.step} value={String(draft[f.k])}
                    onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value === '' ? ('' as unknown as number) : +e.target.value })}
                    onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) commit({ ...draft, [f.k]: v }); else setDraft(settings); }} />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2.5 py-4">
        <ConfirmButton onConfirm={() => { commit({ ...DEFAULT_SETTINGS }); toast('Settings reset'); }} confirmText="Tap again to reset for everyone">Reset to defaults</ConfirmButton>
      </div>
      {!canSave && <p className="pb-4 text-sm text-muted">Upload your own sales data first. Settings save once the store has real data.</p>}
    </details>
  );
}

export function DataPanel({ days, isSample }: { days: Day[]; isSample: boolean }) {
  const toast = useToast();
  const groups = useMemo(() => {
    const m = new Map<string, Day[]>();
    [...days].sort((a, b) => b.key.localeCompare(a.key)).forEach((d) => {
      const g = d.wd != null ? WD[d.wd] : 'No date';
      m.set(g, [...(m.get(g) || []), d]);
    });
    return [...m.entries()].sort((a, b) => WD.indexOf(a[0]) - WD.indexOf(b[0]));
  }, [days]);
  const total = (d: Day) => d.slots.reduce((a, s) => a + s.sales, 0);

  return (
    <details className="card !py-1.5">
      <summary className="min-h-12 cursor-pointer py-3 font-display text-[22px] font-bold uppercase tracking-[0.05em]">
        Sales data <span className="font-body text-sm font-normal normal-case tracking-normal text-muted">· {isSample ? 'sample only' : `${days.length} days saved`}</span>
      </summary>
      {isSample ? (
        <p className="pb-4 text-muted">Nothing uploaded yet. You're looking at 4 weeks of sample data. Upload your 15-minute sales exports and they'll be saved here for the whole store.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Every day here feeds the forecast for its weekday. Delete a day that doesn't belong, like a holiday, a closure, or a one-off catering blowout.</p>
          <div className="mt-3 grid gap-4">
            {groups.map(([g, list]) => (
              <div key={g}>
                <h3 className="mb-1.5 text-lg uppercase tracking-[0.05em]">{g} <span className="font-body text-sm normal-case tracking-normal text-muted">· {list.length}</span></h3>
                <div className="flex flex-wrap gap-2">
                  {list.map((d) => (
                    <span key={d.key} className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel2 py-1 pl-3 pr-1 text-sm">
                      <b>{prettyDate(d.key)}</b><span className="text-muted num">${Math.round(total(d)).toLocaleString()}</span>
                      <ConfirmButton className="btn btn-sm !min-h-8 !px-2" confirmText="Delete?" onConfirm={() => backend.deleteDay(d.key).then(() => toast(`Deleted ${prettyDate(d.key)}`))}>✕</ConfirmButton>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="py-4">
            <ConfirmButton onConfirm={() => backend.clearDays(days.map((d) => d.key)).then(() => toast('All sales data cleared'))} confirmText="Tap again to delete every day">Clear all sales data</ConfirmButton>
          </div>
        </>
      )}
      <details className="pb-4">
        <summary className="label cursor-pointer py-1.5">What CSV works?</summary>
        <p className="text-sm text-muted">Any export with a time column and a sales column, plus a date column so days sort by weekday. Upload one big file or a stack of daily files. A re-uploaded day replaces the old copy. Four or more of the same weekday gives the best counts.</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-panel2 p-3 text-sm text-muted">{`Date,Time,Net Sales,Transactions
9/22/2026,6:00 AM,84.50,9
9/22/2026,6:15 AM,112.20,12`}</pre>
      </details>
    </details>
  );
}
