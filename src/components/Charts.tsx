import type { Analysis } from '../lib/engine';
import { fmt, fmtShort, money } from '../lib/engine';

const C = { line: '#352C30', muted: '#B5A8AD', faint: '#76696F', red: '#E51636', warn: '#F2AA3C', warnsoft: '#33260F', oksoft: '#112B22', foh: '#6FA9FF', fg: '#F6F0F2', band: 'rgba(246,240,242,.07)' };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function SalesChart({ an, now }: { an: Analysis; now?: number | null }) {
  const { L, step } = an, W = 1000, H = 260, pl = 58, pr = 12, pt = 30, pb = 32, bw = (W - pl - pr) / L.length;
  const mx = niceMax(Math.max(...L.map((r) => Math.max(r.sales, r.high))) * 1.08);
  const x = (m: number) => pl + ((m - L[0].min) / step) * bw;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / mx);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[640px]" role="img" aria-label="Forecast sales by 15 minutes">
        {an.breaks.map((b) => <rect key={'b' + b.start} x={x(b.start)} y={pt} width={x(b.end) - x(b.start)} height={H - pt - pb} fill={C.oksoft} />)}
        {an.rushes.filter((r) => r.level !== 'light').map((r) => {
          const a = Math.max(pl, x(r.start - 45));
          return (
            <g key={'s' + r.start}>
              <rect x={a} y={pt} width={Math.max(0, x(r.start - 15) - a)} height={H - pt - pb} fill={C.warnsoft} />
              <rect x={x(r.end)} y={pt} width={Math.max(0, Math.min(W - pr, x(r.end + 30)) - x(r.end))} height={H - pt - pb} fill={C.warnsoft} />
            </g>
          );
        })}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (mx * i) / 4;
          return (
            <g key={i}>
              <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke={C.line} />
              <text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill={C.muted}>{money(v)}</text>
            </g>
          );
        })}
        {L.map((r, i) => r.high > r.low && <rect key={'r' + i} x={pl + i * bw} y={y(r.high)} width={bw} height={y(r.low) - y(r.high)} fill={C.band} />)}
        {L.map((r, i) => (
          <rect key={i} className="bar-grow" style={{ animationDelay: `${120 + i * 7}ms` }}
            x={pl + i * bw + bw * 0.18} y={y(r.sales)} width={Math.max(1, bw * 0.64)} height={H - pb - y(r.sales)} rx={2}
            fill={r.level === 'light' ? C.warn : r.level ? C.red : C.faint}>
            <title>{`${fmt(r.min)} · ${money(r.sales)} (range ${money(r.low)}–${money(r.high)})`}</title>
          </rect>
        ))}
        {an.rushes.map((r) => {
          const cx = x(r.peakMin) + bw / 2, cy = y(r.peakSales) - 6;
          return (
            <g key={'p' + r.peakMin}>
              <path d={`M${cx - 6} ${cy - 8}L${cx + 6} ${cy - 8}L${cx} ${cy}Z`} fill={C.fg} />
              <text x={cx} y={cy - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.fg}>{`${r.dp[0]} ${fmtShort(r.peakMin)}`}</text>
            </g>
          );
        })}
        {L.filter((r) => r.min % 120 === 0).map((r) => (
          <text key={'t' + r.min} x={x(r.min)} y={H - 10} textAnchor="middle" fontSize={12} fill={C.muted}>{fmtShort(r.min)}</text>
        ))}
        {now != null && now >= L[0].min && now <= an.close && (
          <g>
            <line x1={x(now)} x2={x(now)} y1={pt - 4} y2={H - pb} stroke={C.fg} strokeWidth={2.5} />
            <text x={x(now) + 6} y={pt + 8} fontSize={13} fontWeight={700} fill={C.fg}>NOW</text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function CrewChart({ an }: { an: Analysis }) {
  const { L, step } = an, W = 1000, H = 220, pl = 58, pr = 12, pt = 14, pb = 32, bw = (W - pl - pr) / L.length;
  const mx = Math.max(4, Math.ceil(Math.max(...L.map((r) => r.crew)) / 4) * 4);
  const x = (m: number) => pl + ((m - L[0].min) / step) * bw;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / mx);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[640px]" role="img" aria-label="Crew needed by 15 minutes">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (mx * i) / 4;
          return (
            <g key={i}>
              <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke={C.line} />
              <text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill={C.muted}>{v}</text>
            </g>
          );
        })}
        {L.map((r, i) => {
          const X = pl + i * bw + bw * 0.12, w = Math.max(1, bw * 0.76);
          return (
            <g key={i} className="bar-grow" style={{ animationDelay: `${120 + i * 7}ms` }}>
              <rect x={X} y={y(r.boh)} width={w} height={H - pb - y(r.boh)} fill={C.red}><title>{`${fmt(r.min)} · BOH ${r.boh}`}</title></rect>
              <rect x={X} y={y(r.crew)} width={w} height={Math.max(0, y(r.boh) - y(r.crew) - 1)} fill={C.foh}><title>{`${fmt(r.min)} · FOH ${r.foh}`}</title></rect>
            </g>
          );
        })}
        {L.filter((r) => r.min % 120 === 0).map((r) => (
          <text key={'t' + r.min} x={x(r.min)} y={H - 10} textAnchor="middle" fontSize={12} fill={C.muted}>{fmtShort(r.min)}</text>
        ))}
      </svg>
    </div>
  );
}

export function Spark({ an, max }: { an: Analysis; max: number }) {
  const W = 140, H = 34, n = an.L.length;
  const pts = an.L.map((r, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - 2 - (r.sales / max) * (H - 4)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[34px] w-full" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={C.red} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Legend({ items }: { items: [string, string, boolean?][] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
      {items.map(([c, l, outline]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: c, outline: outline ? '1px solid #76696F' : undefined }} />
          {l}
        </span>
      ))}
    </div>
  );
}
