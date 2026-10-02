import { motion } from 'framer-motion';
import {
  buildPlan, countdownTarget, dayLabel, dur, floorState, fmt, fmtShort, huddleText, LEVEL_LABEL, lineupFor, money,
  type Analysis, type DayFilter, type Deploy, type FloorState,
} from '../lib/engine';
import { Card, CountUp, useCopy } from './ui';
import { useStoreCfg } from '../hooks/storeContext';
import { Legend, SalesChart } from './Charts';

/** Countdown text: seconds when running on the live clock, minutes when someone picked a time. */
export function countdown(target: number, nowMin: number, clock: Date | null) {
  if (!clock) return dur(target - nowMin);
  const sec = target * 60 - (clock.getHours() * 3600 + clock.getMinutes() * 60 + clock.getSeconds());
  if (sec <= 0) return 'now';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(x).padStart(2, '0')}`;
}

export const statusStyle = {
  inrush: { box: 'border-red bg-gradient-to-br from-red-soft to-panel', tag: 'text-red-text', glow: 'rgba(229,22,54,.35)' },
  coming: { box: 'border-warn bg-gradient-to-br from-warn-soft to-panel', tag: 'text-warn', glow: 'rgba(242,170,60,.25)' },
  steady: { box: 'border-[#245441] bg-gradient-to-br from-ok-soft to-panel', tag: 'text-ok', glow: 'rgba(61,196,141,.18)' },
  closed: { box: 'border-line bg-panel', tag: 'text-muted', glow: 'transparent' },
} as const;

type Props = {
  an: Analysis; filter: DayFilter; now: number; clock: Date | null; live: boolean;
  setLive: (v: boolean) => void; setManual: (m: number) => void; onTV: () => void;
};

export function Floor({ an, filter, now, clock, live, setLive, setManual, onTV }: Props) {
  const { positions } = useStoreCfg();
  const st = floorState(an, now);
  const t = st.target;
  const lu = lineupFor(st, positions);
  const ev = buildPlan(an).filter((e) => e.t >= now - an.step);
  const nextIdx = ev.findIndex((e) => e.t > now);
  const cd = countdownTarget(st, now);
  const sty = statusStyle[st.cls];
  const { copy, box } = useCopy();

  return (
    <div className="grid gap-[18px]">
      <Card className="!py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="label">Time</span>
          <select id="time-pick" aria-label="Time of day" className="field !w-auto" disabled={live} value={st.ci >= 0 ? an.L[st.ci].min : ''} onChange={(e) => setManual(+e.target.value)}>
            {st.ci < 0 && <option value="">{fmt(now)}</option>}
            {an.L.map((r) => <option key={r.min} value={r.min}>{fmt(r.min)}</option>)}
          </select>
          <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 font-bold" htmlFor="live-clock">
            <input id="live-clock" type="checkbox" className="h-[22px] w-[22px] accent-red" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Live clock
          </label>
          <div className="ml-auto flex flex-wrap gap-2.5">
            <button type="button" className="btn" onClick={onTV}>Kitchen TV</button>
            <button type="button" className="btn" onClick={() => copy(huddleText(an, now, dayLabel(filter), positions), 'Huddle copied. Paste it in the group chat.')}>Copy shift huddle</button>
          </div>
        </div>
        {box}
      </Card>

      <motion.section layout className={`relative grid gap-2 overflow-hidden rounded-[20px] border px-6 pb-5 pt-5 transition-colors duration-300 ${sty.box}`}>
        <span aria-hidden className="pointer-events-none absolute -bottom-1/2 -right-[10%] h-[140%] w-[60%]" style={{ background: `radial-gradient(closest-side, ${sty.glow}, transparent)` }} />
        <span className={`relative flex items-center gap-2.5 font-display text-lg font-extrabold uppercase tracking-[0.14em] ${sty.tag}`}>
          <span className={st.cls === 'closed' ? 'h-3 w-3 rounded-full bg-current' : 'pulse-dot'} />{st.tag} · {fmt(now)}
        </span>
        <h2 className="relative font-display text-[clamp(34px,6vw,56px)] font-extrabold uppercase leading-[.98]">{st.head}</h2>
        <p className="relative max-w-[70ch] text-[19px] text-muted">{st.sub}</p>
        {cd && (
          <div className="relative flex flex-wrap items-baseline gap-3">
            <span className="label">{cd.label}</span>
            <span className="font-display text-[clamp(30px,5vw,44px)] font-bold leading-none num">{countdown(cd.t, now, clock)}</span>
          </div>
        )}
        <DayRail an={an} now={now} />
      </motion.section>

      <Card title="Today's peaks" sub="Peak 15 for every daypart" delay={1}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
          {an.peaks.map((p) => p.none ? (
            <div key={p.dp} className="grid gap-1 rounded-2xl border border-line border-t-4 border-t-faint bg-panel2 px-4 py-3 opacity-70">
              <div className="flex justify-between"><h3 className="text-xl uppercase">{p.dp}</h3><span className="text-xs font-bold uppercase text-muted">Ramp</span></div>
              <span className="font-display text-[34px] font-bold leading-none num">{p.peakMin != null ? fmt(p.peakMin) : '—'}</span>
              <span className="text-sm text-muted">Busiest 15. {p.why}.</span>
            </div>
          ) : (
            <div key={p.dp} className={`grid gap-1 rounded-2xl border border-t-4 bg-panel2 px-4 py-3 transition ${p.level === 'light' ? 'border-t-warn' : 'border-t-red'} ${now >= p.end ? 'opacity-40' : ''} ${t === p ? 'border-fg' : 'border-line'}`}>
              <div className="flex justify-between"><h3 className="text-xl uppercase">{p.dp}</h3>
                <span className={`text-xs font-bold uppercase ${p.level === 'light' ? 'text-warn' : 'text-red-text'}`}>{now >= p.end ? 'Done' : now >= p.start ? 'Now' : LEVEL_LABEL[p.level]}</span></div>
              <span className="font-display text-[34px] font-bold leading-none num">{fmt(p.peakMin)}</span>
              <span className="text-sm text-muted num">{fmt(p.start)} – {fmt(p.end)} · {dur(p.end - p.start)}</span>
              <span className="text-sm num">Crew <b className="text-foh">{p.peakFoh}</b> / <b className="text-red-text">{p.peakBoh}</b></span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-[18px]">
        <Card title="On the clock now" sub={`${fmt(st.nowRow.min)} forecast ${money(st.nowRow.sales)}`} delay={2}>
          <div className="flex flex-wrap gap-6">
            <Big label="FOH" c="text-foh"><CountUp value={st.nowRow.foh} /></Big>
            <Big label="BOH" c="text-red-text"><CountUp value={st.nowRow.boh} /></Big>
            <Big label="Total"><CountUp value={st.nowRow.crew} /></Big>
          </div>
          <p className="tile mt-4 text-[17px]">
            {st.brNow ? <><b>Send breaks now.</b> Window closes at {fmt(st.brNow.end)}. {st.brNow.send} at a time.</>
              : st.brNext ? <>Next break window opens at <b>{fmt(st.brNext.start)}</b> and runs to {fmt(st.brNext.end)}.</>
              : 'No more break windows today. Work breaks into slow 15s after the rush.'}
          </p>
        </Card>
        <Card title={t ? (st.cur ? 'This rush' : 'Next rush') : 'Rush'} sub={t ? t.name : 'none left today'} delay={3}>
          {t ? (
            <>
              <div className="flex flex-wrap gap-6">
                <Big label="Starts" size="text-[38px]">{fmt(t.start)}</Big>
                <Big label="How long" size="text-[38px]">{dur(t.end - t.start)}</Big>
                <Big label="Peak" size="text-[38px]">{fmt(t.peakMin)}</Big>
              </div>
              <p className="tile mt-4 text-[17px]">
                Crew for the peak: <b className="text-foh">{t.peakFoh} FOH</b> and <b className="text-red-text">{t.peakBoh} BOH</b>. Everyone on position by <b>{fmt(t.start - 15)}</b>.
                {t.level !== 'light' && <> Stock-up from <b>{fmt(Math.max(an.open, t.start - 45))}</b>.</>}
              </p>
            </>
          ) : <p className="text-sm text-muted">No rush left in the forecast. Run to the counts in the game plan.</p>}
        </Card>
      </div>

      <Card title={`Line positions ${t ? 'for the rush peak' : 'right now'}`} sub={`${lu.am ? 'Breakfast board' : 'Lunch/dinner board'} · bars show how full each station is`} delay={4}>
        <button type="button" className="btn btn-sm mb-3" onClick={() => { const d = document.getElementById('positions-editor') as HTMLDetailsElement | null; if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth' }); } }}>Edit positions</button>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-[18px]">
          <Stations title={`BOH · ${t ? t.peakBoh : st.nowRow.boh}`} d={lu.boh} side="boh" />
          <Stations title={`FOH · ${t ? t.peakFoh : st.nowRow.foh}`} d={lu.foh} side="foh" />
        </div>
      </Card>

      <Card title="Game plan" sub={`From ${fmt(now)} to close`} delay={5}>
        <ol className="grid gap-2.5">
          {ev.length ? ev.map((e, i) => (
            <li key={`${e.t}-${e.k}-${i}`} className={`grid grid-cols-1 gap-1 rounded-2xl border border-l-[5px] bg-panel2 px-4 py-3 sm:grid-cols-[96px_1fr] sm:gap-3.5 ${EV[e.k]} ${e.t + an.step <= now ? 'opacity-45' : ''} ${i === nextIdx ? 'border-y-fg border-r-fg' : 'border-y-line border-r-line'}`}>
              <span className="font-display text-[22px] font-bold num">{fmt(e.t)}</span>
              <div>
                <div className="text-lg font-bold">{e.w}</div>
                <div className="text-[15px] text-muted">{e.d}</div>
                {e.list && <ul className="mt-1.5 list-disc pl-5 text-[15px] text-muted">{e.list.map((x) => <li key={x}>{x}</li>)}</ul>}
              </div>
            </li>
          )) : <li className="text-muted">Nothing left on the plan today.</li>}
        </ol>
      </Card>

      <Card title="Best break times today" delay={6}>
        <div className="grid gap-2.5">
          {an.breaks.length ? an.breaks.map((b) => (
            <div key={b.start} className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3.5 py-3 ${b === an.bestBreak ? 'border-ok bg-ok-soft' : 'border-line bg-panel2'}`}>
              <b className="font-display text-[22px] num">{fmt(b.start)} – {fmt(b.end)}</b>
              <span>{b.dp} · {dur(b.end - b.start)} · send {b.send} at a time{b === an.bestBreak && <> · <strong className="text-ok">best window</strong></>}</span>
            </div>
          )) : <p className="text-sm text-muted">No clear slow windows. Rotate breaks one at a time in the slowest 15s.</p>}
        </div>
        <p className="mt-2.5 text-sm text-muted">Windows skip the 45 minutes before a rush and the 15 minutes after. Minors still get their breaks on time no matter what this says.</p>
      </Card>

      <Card title="The day at a glance" delay={7}>
        <SalesChart an={an} now={now} />
        <Legend items={[['#E51636', 'Rush'], ['#F2AA3C', 'Light bump'], ['rgba(246,240,242,.07)', 'Normal range', true], ['#33260F', 'Stock-up / reset', true], ['#112B22', 'Break window', true]]} />
      </Card>
    </div>
  );
}

const EV: Record<string, string> = {
  rush: 'border-l-red', ready: 'border-l-red', stock: 'border-l-warn', reset: 'border-l-warn', cut: 'border-l-warn', break: 'border-l-ok', add: 'border-l-foh',
};

function Big({ label, children, c = '', size = 'text-[58px]' }: { label: string; children: React.ReactNode; c?: string; size?: string }) {
  return <div className="grid gap-0.5"><span className="label">{label}</span><span className={`font-display font-bold leading-none num ${size} ${c}`}>{children}</span></div>;
}

function Stations({ title, d, side }: { title: string; d: Deploy; side: 'foh' | 'boh' }) {
  return (
    <div>
      <h3 className={`mb-2.5 text-xl uppercase tracking-[0.04em] ${side === 'foh' ? 'text-foh' : 'text-red-text'}`}>{title}</h3>
      <div className="grid gap-2">
        {Object.entries(d.counts).map(([k, v], i) => (
          <div key={k} className={`grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-1 rounded-xl border border-line bg-panel2 px-3.5 py-2.5 font-bold ${v ? '' : 'opacity-40'}`}>
            <span>{k}</span>
            <span className={`text-right font-display text-[26px] num ${side === 'foh' ? 'text-foh' : 'text-red-text'}`}>{v}</span>
            <span className="col-span-2 h-[5px] overflow-hidden rounded-full bg-panel3">
              <motion.i className={`block h-full rounded-full ${side === 'foh' ? 'bg-foh' : 'bg-red'}`} style={{ originX: 0, width: `${(v / d.cap[k]) * 100}%` }}
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: i * 0.05 }} />
            </span>
          </div>
        ))}
        {d.extra > 0 && <div className="text-sm text-muted">+{d.extra} more than the stations hold. Use them as runners or on prep.</div>}
      </div>
    </div>
  );
}

export function DayRail({ an, now, tall = false }: { an: Analysis; now: number; tall?: boolean }) {
  const span = an.close - an.open;
  const p = (m: number) => Math.min(100, Math.max(0, ((m - an.open) / span) * 100));
  const ticks: number[] = [];
  for (let m = Math.ceil(an.open / 120) * 120; m <= an.close; m += 120) ticks.push(m);
  const seg = (a: number, b: number, c: string, k: string) => <span key={k} className={`absolute inset-y-0 ${c}`} style={{ left: `${p(a)}%`, width: `${p(b) - p(a)}%` }} />;
  return (
    <div className="relative mt-2.5">
      <div className={`relative overflow-hidden rounded-xl bg-panel3 ${tall ? 'h-14' : 'h-11'}`} aria-hidden>
        {an.breaks.map((b) => seg(b.start, b.end, 'bg-ok/35', 'b' + b.start))}
        {an.rushes.map((r) => r.level === 'light'
          ? seg(r.start, r.end, 'bg-warn/45', 'l' + r.start)
          : [seg(r.start - 45, r.start, 'bg-warn/45', 's' + r.start), seg(r.start, r.end, 'bg-gradient-to-b from-red to-red-2', 'r' + r.start), seg(r.end, r.end + 30, 'bg-warn/45', 'e' + r.start)])}
        <span className="absolute inset-y-0 left-0 bg-black/45 transition-[width] duration-1000" style={{ width: `${p(now)}%` }} />
        {now >= an.open && now <= an.close && <span className="absolute -inset-y-0.5 w-[3px] bg-fg shadow-[0_0_12px_rgba(255,255,255,.8)] transition-[left] duration-1000" style={{ left: `calc(${p(now)}% - 1px)` }} />}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted num">{ticks.map((m) => <span key={m}>{fmtShort(m)}</span>)}</div>
    </div>
  );
}

export type { FloorState };
