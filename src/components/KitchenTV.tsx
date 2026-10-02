import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { buildPlan, countdownTarget, dayLabel, floorState, fmt, lineupFor, type Analysis, type DayFilter } from '../lib/engine';
import { countdown, DayRail, statusStyle } from './Floor';

const EV: Record<string, string> = { rush: 'border-l-red', ready: 'border-l-red', stock: 'border-l-warn', reset: 'border-l-warn', cut: 'border-l-warn', break: 'border-l-ok', add: 'border-l-foh' };

/** Full-screen board for the kitchen TV. Big type, live countdown, keeps the screen awake where allowed. */
export function KitchenTV({ an, filter, now, clock, onExit }: { an: Analysis; filter: DayFilter; now: number; clock: Date | null; onExit: () => void }) {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    document.documentElement.requestFullscreen?.().catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onExit();
    window.addEventListener('keydown', esc);
    return () => {
      lock?.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      window.removeEventListener('keydown', esc);
    };
  }, [onExit]);

  const st = floorState(an, now), t = st.target, cd = countdownTarget(st, now), lu = lineupFor(st);
  const ev = buildPlan(an).filter((e) => e.t > now).slice(0, 3);
  const sty = statusStyle[st.cls];
  const chips = (counts: Record<string, number>, c: string) =>
    Object.entries(counts).filter(([, v]) => v).map(([k, v]) => (
      <span key={k} className="inline-flex items-center gap-2.5 rounded-xl bg-panel2 px-3.5 py-2 text-xl font-bold"><b className={`font-display text-3xl ${c}`}>{v}</b>{k}</span>
    ));

  return (
    <div className="grid gap-[22px] px-[clamp(16px,3vw,40px)] py-[18px]">
      <div className="flex flex-wrap items-center gap-4">
        <span className="mr-auto font-display text-[22px] font-bold uppercase tracking-[0.08em] text-muted">Rush Forecaster · {filter === 'all' ? 'Today' : dayLabel(filter)}</span>
        <span className="font-display text-[40px] font-bold num">{clock ? clock.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : fmt(now)}</span>
        <button type="button" className="btn" onClick={onExit}>Exit TV</button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-stretch gap-[22px]">
        <AnimatePresence mode="wait">
          <motion.div key={st.tag + st.head} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`grid content-start gap-2 rounded-[22px] border p-6 ${sty.box}`}>
            <span className={`flex items-center gap-3 font-display text-2xl font-extrabold uppercase tracking-[0.14em] ${sty.tag}`}><span className="pulse-dot !h-4 !w-4" />{st.tag}</span>
            <h2 className="font-display text-[clamp(44px,6vw,84px)] font-extrabold uppercase leading-[.95]">{st.head}</h2>
            <p className="text-[22px] text-muted">{st.sub}</p>
            <DayRail an={an} now={now} tall />
          </motion.div>
        </AnimatePresence>
        {cd && (
          <div className="grid place-content-center rounded-[22px] border border-line bg-panel p-6 text-center">
            <span className="label !text-base">{cd.label}</span>
            <span className={`font-display text-[clamp(80px,12vw,180px)] font-extrabold leading-[.9] num ${st.cls === 'inrush' ? 'text-red-text' : st.cls === 'coming' ? 'text-warn' : ''}`}>{countdown(cd.t, now, clock)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-[22px]">
        <Box label="On the clock now">
          <Nums f={st.nowRow.foh} b={st.nowRow.boh} />
        </Box>
        <Box label={t ? `For the ${t.dp.toLowerCase()} peak · ${fmt(t.peakMin)}` : 'Rest of day'}>
          <Nums f={t ? t.peakFoh : st.nowRow.foh} b={t ? t.peakBoh : st.nowRow.boh} />
        </Box>
        <Box label="Positions" wide><div className="flex flex-wrap gap-2.5">{chips(lu.boh.counts, 'text-red-text')}{chips(lu.foh.counts, 'text-foh')}</div></Box>
        <Box label="Coming up" wide>
          <ol className="grid gap-2.5">
            {ev.length ? ev.map((e, i) => (
              <li key={i} className={`flex items-baseline gap-4 rounded-xl border-l-[6px] bg-panel2 px-3.5 py-2.5 text-[22px] font-bold ${EV[e.k]}`}>
                <b className="min-w-[4.6ch] font-display text-[28px] num">{fmt(e.t)}</b><span>{e.w}</span>
              </li>
            )) : <li className="text-[22px]">Nothing left today. Close strong.</li>}
          </ol>
        </Box>
      </div>

      <div className="flex flex-wrap gap-3">
        {an.rushes.map((p) => (
          <span key={p.dp} className={`rounded-full px-4 py-2 font-display text-2xl font-semibold uppercase tracking-[0.05em] ${now >= p.end ? 'bg-panel2 text-muted opacity-40' : t === p ? 'bg-red text-white' : 'bg-panel2 text-muted'}`}>
            {p.dp} <b className={`ml-1.5 num ${t === p ? 'text-white' : 'text-fg'}`}>{fmt(p.peakMin)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Box({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`grid content-start gap-2 rounded-[22px] border border-line bg-panel p-6 ${wide ? 'lg:col-span-2' : ''}`}><span className="label">{label}</span>{children}</div>;
}
function Nums({ f, b }: { f: number; b: number }) {
  return (
    <div className="flex gap-8">
      <span className="grid font-display text-[clamp(70px,9vw,120px)] font-bold leading-[.9] text-foh num">{f}<small className="text-xl tracking-[0.1em] text-muted">FOH</small></span>
      <span className="grid font-display text-[clamp(70px,9vw,120px)] font-bold leading-[.9] text-red-text num">{b}<small className="text-xl tracking-[0.1em] text-muted">BOH</small></span>
    </div>
  );
}
