import { useState } from 'react';
import { motion } from 'framer-motion';
import { fmt, money, NO_WHATIF, type Analysis, type WhatIf } from '../lib/engine';
import { Card } from './ui';

const CHIPS: [string, number][] = [['Slow day', -10], ['Normal', 0], ['Busy', 10], ['Game day', 15], ['Promo', 20]];

/** "What if" for one Look Ahead date: a % swing and catering pickups. Counts and shifts follow. */
export function WhatIfCard({ w, setW, an, baseTotal, date }: { w: WhatIf; setW: (w: WhatIf) => void; an: Analysis; baseTotal: number; date: string }) {
  const [time, setTime] = useState(() => an.L.find((r) => r.min >= 690)?.min ?? an.L[0].min);
  const [amt, setAmt] = useState('');
  const delta = an.total - baseTotal;
  const active = w.pct !== 0 || w.adds.length > 0;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amt.replace(/[^0-9.]/g, ''));
    if (!(n > 0)) return;
    setW({ ...w, adds: [...w.adds, { min: time, amount: n }].sort((a, b) => a.min - b.min) });
    setAmt('');
  };

  return (
    <Card title="What if?" sub="Dial in what you know about this day. Counts, peaks and shifts update as you tap." delay={2.8}
      className={active ? '!border-warn' : ''}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <span className="label">How's the day looking?</span>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Day type">
            {CHIPS.map(([label, v]) => (
              <button key={label} type="button" aria-pressed={w.pct === v} onClick={() => setW({ ...w, pct: v })}
                className={`min-h-11 rounded-xl border px-3.5 font-bold transition ${w.pct === v ? 'border-transparent bg-red text-white shadow-glow' : 'border-line bg-panel2 hover:border-muted'}`}>
                {label}{v !== 0 && <span className="ml-1.5 text-sm font-normal opacity-80">{v > 0 ? '+' : ''}{v}%</span>}
              </button>
            ))}
          </div>
          <label htmlFor={`whatif-pct-${date}`} className="mt-4 flex items-center justify-between text-sm font-bold">
            <span>Fine-tune</span>
            <span className={`font-display text-2xl num ${w.pct > 0 ? 'text-ok' : w.pct < 0 ? 'text-warn' : ''}`}>{w.pct > 0 ? '+' : ''}{w.pct}%</span>
          </label>
          <input id={`whatif-pct-${date}`} type="range" min={-30} max={40} step={5} value={w.pct} onChange={(e) => setW({ ...w, pct: +e.target.value })} className="w-full accent-red" />
          <div className="flex justify-between text-xs text-muted"><span>−30%</span><span>0</span><span>+40%</span></div>
        </div>

        <div className="min-w-0">
          <span className="label">Catering orders</span>
          <form onSubmit={add} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm font-bold" htmlFor={`cat-time-${date}`}>Pickup
              <select id={`cat-time-${date}`} className="field !w-auto" value={time} onChange={(e) => setTime(+e.target.value)}>
                {an.L.map((r) => <option key={r.min} value={r.min}>{fmt(r.min)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold" htmlFor={`cat-amt-${date}`}>Order total
              <span className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                <input id={`cat-amt-${date}`} inputMode="decimal" placeholder="800" className="field !w-32 pl-7" value={amt} onChange={(e) => setAmt(e.target.value)} />
              </span>
            </label>
            <button type="submit" className="btn">Add order</button>
          </form>
          <p className="mt-1.5 text-xs text-muted">Counted in the 30 minutes before pickup, when the kitchen is building it.</p>
          {w.adds.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {w.adds.map((a, i) => (
                <motion.span key={`${a.min}-${i}`} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel2 py-1 pl-3 pr-1 text-sm">
                  <b>{money(a.amount)}</b> pickup {fmt(a.min)}
                  <button type="button" aria-label={`Remove ${money(a.amount)} order at ${fmt(a.min)}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-fg"
                    onClick={() => setW({ ...w, adds: w.adds.filter((_, k) => k !== i) })}>✕</button>
                </motion.span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        {active ? (
          <>
            <span className="text-[15px]">Forecast <b className="num">{money(baseTotal)}</b> → <b className="num">{money(an.total)}</b>{' '}
              <span className={`font-bold num ${delta >= 0 ? 'text-ok' : 'text-warn'}`}>({delta >= 0 ? '+' : '−'}{money(Math.abs(delta))})</span></span>
            <button type="button" className="btn btn-sm ml-auto" onClick={() => setW(NO_WHATIF)}>Clear what-if</button>
          </>
        ) : <span className="text-sm text-muted">No changes. This is the straight forecast.</span>}
        <span className="w-full text-xs text-muted">Saved on this iPad for this date only.</span>
      </div>
    </Card>
  );
}
