import { motion } from 'framer-motion';
import { money, prettyDate, type ForecastReport as Report } from '../lib/engine';
import { Card } from './ui';

const pct = (v: number | null, d = 0) => (v == null ? '–' : `${(v * 100).toFixed(d)}%`);

/** The accuracy tile at the top of Scheduler. */
export function AccuracyTile({ r }: { r: Report }) {
  if (r.dayErr == null || r.slotErr == null)
    return (
      <div className="tile grid min-w-[min(100%,250px)] max-w-[420px] gap-1">
        <span className="label">Accuracy check</span>
        <span className="text-sm text-muted">Load 3 or more of the same weekday and the forecast starts testing itself against real days.</span>
      </div>
    );
  const onDay = 100 - r.dayErr * 100;
  const tone = r.dayErr <= 0.06 ? 'text-ok' : r.dayErr <= 0.12 ? 'text-warn' : 'text-red-text';
  return (
    <div className="tile grid min-w-[min(100%,250px)] max-w-[420px] gap-1">
      <span className="label">Accuracy check · tested on {r.folds} real day{r.folds === 1 ? '' : 's'}</span>
      <span className={`font-display text-[32px] font-bold leading-none ${tone}`}>{onDay.toFixed(0)}% on the day</span>
      <div className="h-2 overflow-hidden rounded-full bg-panel3">
        <motion.i className="block h-full rounded-full bg-gradient-to-r from-ok to-[#7EE0B5]" initial={{ width: 0 }} animate={{ width: `${Math.max(4, onDay)}%` }} transition={{ duration: 1, delay: 0.2 }} />
      </div>
      <span className="text-sm text-muted">
        Hid each recent day, forecast it from the days before, then compared. Each 15-min slot landed within {pct(r.slotErr)} on average.
      </span>
    </div>
  );
}

/** "How this forecast is built": every model, its tested error, and how much say it gets. */
export function ForecastReportCard({ r, delay = 3.8 }: { r: Report; delay?: number }) {
  const scored = r.models.filter((m) => m.slotErr != null);
  const bestErr = Math.min(...scored.map((m) => m.slotErr as number));
  const trend = r.trendPct;
  return (
    <Card title="How this forecast is built" sub={r.method === 'auto' ? 'Six methods, blended by how accurate each one was on your own days' : `Using the ${r.method} average (switch to Auto in settings for the blend)`} delay={delay}>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3">
        <Fact label="Days used" v={String(r.used)} sub={r.skipped.length ? `${r.skipped.length} odd day${r.skipped.length > 1 ? 's' : ''} left out` : 'No odd days found'} />
        <Fact label="Tested on" v={`${r.folds} day${r.folds === 1 ? '' : 's'}`} sub="Hidden, forecast, then compared" />
        <Fact label="Per-15 error" v={pct(r.slotErr)} sub="Lower is better" t={r.slotErr == null ? undefined : r.slotErr <= 0.1 ? 'good' : r.slotErr <= 0.18 ? 'meh' : 'bad'} />
        <Fact label="Trend" v={trend == null ? '–' : `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`} sub={trend == null ? 'Needs 3+ weeks' : `per week${Math.abs(trend) < 1 ? ', holding steady' : trend > 0 ? ', growing' : ', slipping'}`} t={trend == null ? undefined : trend >= 1 ? 'good' : trend <= -1 ? 'bad' : undefined} />
      </div>

      {scored.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[15px]">
            <thead>
              <tr className="text-xs uppercase tracking-[0.08em] text-muted">
                <th className="border-b border-line px-2 py-2 text-left font-bold">Method</th>
                <th className="border-b border-line px-2 py-2 text-right font-bold">Per-15 error</th>
                <th className="border-b border-line px-2 py-2 text-right font-bold">Day error</th>
                <th className="w-[34%] border-b border-line px-2 py-2 text-left font-bold">Say in the forecast</th>
              </tr>
            </thead>
            <tbody>
              {[...r.models].sort((a, b) => b.weight - a.weight || (a.slotErr ?? 9) - (b.slotErr ?? 9)).map((m, i) => (
                <tr key={m.id} className={m.weight > 0 ? '' : 'opacity-50'}>
                  <td className="border-b border-line px-2 py-2.5">
                    <b>{m.label}</b>{m.slotErr != null && m.slotErr === bestErr && <span className="ml-2 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok">Most accurate</span>}
                    <div className="text-[13px] text-muted">{m.desc}</div>
                  </td>
                  <td className="border-b border-line px-2 text-right num">{pct(m.slotErr, 1)}</td>
                  <td className="border-b border-line px-2 text-right num">{pct(m.dayErr, 1)}</td>
                  <td className="border-b border-line px-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel3">
                        <motion.i className="block h-full rounded-full bg-gradient-to-r from-red to-red-text" style={{ originX: 0, width: `${m.weight * 100}%` }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.2 + i * 0.06 }} />
                      </div>
                      <span className="w-10 text-right font-bold num">{Math.round(m.weight * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted">Load 3 or more of the same weekday and each method gets graded on your real days. Until then, the forecast uses the trimmed average.</p>
      )}

      {r.skipped.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-lg uppercase tracking-[0.05em] text-muted">Left out so they don't skew the counts</h3>
          <div className="flex flex-wrap gap-2">
            {r.skipped.map((d) => (
              <span key={d.key} className="rounded-xl border border-line bg-panel2 px-3 py-1.5 text-sm"><b>{prettyDate(d.key)}</b> · {money(d.total)} · <span className="text-muted">{d.why}</span></span>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted">Want one counted anyway? If it's a real pattern (every Thursday is catering), it stops getting flagged once it happens more often.</p>
        </div>
      )}
    </Card>
  );
}

function Fact({ label, v, sub, t }: { label: string; v: string; sub: string; t?: 'good' | 'meh' | 'bad' }) {
  const c = t === 'good' ? 'text-ok' : t === 'meh' ? 'text-warn' : t === 'bad' ? 'text-red-text' : '';
  return (
    <div className="tile flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={`font-display text-[30px] font-bold leading-[1.05] num ${c}`}>{v}</span>
      <span className="text-sm text-muted">{sub}</span>
    </div>
  );
}
