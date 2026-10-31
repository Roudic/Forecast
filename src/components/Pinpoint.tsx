import { useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fmt, momentAt, money, type Analysis, type DayFilter, type MomentKind } from '../lib/engine';
import { useHourEdit } from '../hooks/useHourEdit';

const TONE: Record<MomentKind, { chip: string; label: string }> = {
  peak: { chip: 'bg-red text-white', label: 'Peak' },
  rush: { chip: 'bg-red-soft text-red-text', label: 'Rush' },
  bump: { chip: 'bg-warn-soft text-warn', label: 'Bump' },
  lock: { chip: 'bg-red-soft text-red-text', label: 'Lock in' },
  stock: { chip: 'bg-warn-soft text-warn', label: 'Stock-up' },
  reset: { chip: 'bg-warn-soft text-warn', label: 'Reset' },
  break: { chip: 'bg-ok-soft text-ok', label: 'Breaks' },
  steady: { chip: 'bg-panel3 text-muted', label: 'Steady' },
  closed: { chip: 'bg-panel3 text-muted', label: 'Closed' },
};

/** Track a finger or mouse across an element and turn its x position into a minute of the day. */
export function useScrub(from: number, to: number, step: number, onPick: (min: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pick = useCallback((clientX: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(0.9999, Math.max(0, (clientX - r.left) / r.width));
    const m = from + f * (to - from);
    onPick(Math.floor((m - from) / step) * step + from);
  }, [from, to, step, onPick]);
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); pick(e.clientX); },
    onPointerMove: (e: React.PointerEvent) => { if (dragging.current || e.pointerType === 'mouse') pick(e.clientX); },
    onPointerUp: () => { dragging.current = false; },
    onPointerCancel: () => { dragging.current = false; },
  };
  return { ref, handlers };
}

/** Readout for one 15-minute window: what's happening, the forecast, and the crew. */
export function PinpointPanel({ an, min, onClose, closeLabel = 'Close', compact = false, editFor }: { an: Analysis; min: number; onClose?: () => void; closeLabel?: string; compact?: boolean; editFor?: DayFilter }) {
  const mo = momentAt(an, min);
  const h = Math.floor(mo.min / 60);
  const hour = an.hourly.find((x) => x.h === h);
  const t = TONE[mo.kind];
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={mo.min} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
        className={`mt-3 grid gap-3 rounded-2xl border border-line bg-panel2 p-3.5 ${compact ? '' : 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'}`} role="status" aria-live="polite">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[26px] font-bold leading-none num">{fmt(mo.min)}<span className="text-base text-muted"> – {fmt(mo.min + an.step)}</span></span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.08em] ${t.chip}`}>{t.label}</span>
            {onClose && <button type="button" onClick={onClose} className="ml-auto text-sm font-bold text-muted underline-offset-4 hover:underline">{closeLabel}</button>}
          </div>
          <div className="mt-1 text-lg font-bold">{mo.title}</div>
          <div className="text-[15px] text-muted">{mo.detail}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Sales / 15" v={money(mo.sales)} sub={`${money(mo.low)}–${money(mo.high)}`} />
          <Stat label="FOH" v={String(mo.foh)} c="text-foh" sub={mo.edited ? 'hand-edited' : 'on the clock'} />
          <Stat label="BOH" v={String(mo.boh)} c="text-red-text" sub={mo.trans != null ? `~${Math.round(mo.trans)} orders` : `${Math.round(mo.doneShare * 100)}% of day done`} />
        </div>
        {editFor !== undefined && hour && <QuickEdit filter={editFor} h={h} foh={hour.foh} boh={hour.boh} autoFoh={hour.autoFoh} autoBoh={hour.autoBoh} />}
      </motion.div>
    </AnimatePresence>
  );
}

function Stat({ label, v, sub, c = '' }: { label: string; v: string; sub: string; c?: string }) {
  return (
    <div className="rounded-xl bg-panel3 px-2 py-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`font-display text-[26px] font-bold leading-tight num ${c}`}>{v}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

/** Hint line under a scrubbable timeline. */
export const ScrubHint = ({ text = 'Tap or drag anywhere on the timeline to pinpoint that 15.' }: { text?: string }) => (
  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4"><circle cx="8" cy="8" r="3" fill="currentColor" /><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".5" /></svg>{text}</p>
);


/** −/+ right in the pinpoint readout. Changes the whole hour, same as the hour-by-hour table. */
function QuickEdit({ filter, h, foh, boh, autoFoh, autoBoh }: { filter: DayFilter; h: number; foh: number; boh: number; autoFoh: number; autoBoh: number }) {
  const { setCount, canSave } = useHourEdit(filter);
  if (!canSave) return null;
  const btn = 'grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel3 text-lg font-bold transition hover:border-muted active:scale-95 disabled:opacity-30';
  const side = (k: 'foh' | 'boh', v: number, auto: number) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-10 text-xs font-bold uppercase ${k === 'foh' ? 'text-foh' : 'text-red-text'}`}>{k}</span>
      <button type="button" className={btn} aria-label={`One less ${k.toUpperCase()} for the ${fmt(h * 60)} hour`} disabled={v <= 0} onClick={() => setCount(h, k, v - 1, auto)}>−</button>
      <span className="w-8 text-center font-display text-2xl font-bold num">{v}</span>
      <button type="button" className={btn} aria-label={`One more ${k.toUpperCase()} for the ${fmt(h * 60)} hour`} onClick={() => setCount(h, k, v + 1, auto)}>+</button>
      {v !== auto && <button type="button" className="text-xs font-bold text-warn underline-offset-2 hover:underline" onClick={() => setCount(h, k, auto, auto)}>undo (was {auto})</button>}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 sm:col-span-2">
      <span className="text-sm text-muted">Crew for the whole {fmt(h * 60)}–{fmt(h * 60 + 60)} hour <span className="text-faint">(sized for its busiest 15)</span>:</span>
      {side('foh', foh, autoFoh)}
      {side('boh', boh, autoBoh)}
    </div>
  );
}
