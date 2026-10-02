import { motion, useReducedMotion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export function Card({ title, sub, children, delay = 0, className = '' }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.section
      className={`card ${className}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1], delay: delay * 0.07 }}
    >
      {title && (
        <h2 className="card-title">
          <span>{title}</span>
          {sub && <small>{sub}</small>}
        </h2>
      )}
      {children}
    </motion.section>
  );
}

export function Rise({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1], delay: delay * 0.07 }}>
      {children}
    </motion.div>
  );
}

/** Counts up from 0 on mount, then glides to new values. */
export function CountUp({ value, format = (v) => String(Math.round(v)) }: { value: number; format?: (v: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const start = performance.now(), a = from.current, D = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / D), e = 1 - Math.pow(1 - p, 3);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <span className="num">{format(shown)}</span>;
}

export function Kpi({ label, children, sub, tone, delay = 0 }: { label: string; children: ReactNode; sub?: ReactNode; tone?: 'good' | 'meh' | 'bad'; delay?: number }) {
  const c = tone === 'good' ? 'text-ok' : tone === 'meh' ? 'text-warn' : tone === 'bad' ? 'text-red-text' : '';
  return (
    <Rise delay={delay} className="card !p-4 flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={`font-display text-[40px] font-bold leading-[1.05] num ${c}`}>{children}</span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </Rise>
  );
}

export const tone = (v: number, good: number, ok: number, higherIsBetter = true): 'good' | 'meh' | 'bad' =>
  higherIsBetter ? (v >= good ? 'good' : v >= ok ? 'meh' : 'bad') : v <= good ? 'good' : v <= ok ? 'meh' : 'bad';

/* ---------- toasts ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const show = useCallback((text: string) => {
    const id = Date.now();
    setMsg({ id, text });
    setTimeout(() => setMsg((m) => (m?.id === id ? null : m)), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <motion.div
          key={msg.id}
          role="status"
          initial={{ opacity: 0, y: 14, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          className="fixed left-1/2 z-50 rounded-full bg-ok px-5 py-3 font-bold text-[#06140e] shadow-2xl"
          style={{ bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))' }}
        >
          {msg.text}
        </motion.div>
      )}
    </ToastCtx.Provider>
  );
}

/** Copies text; when the browser refuses, shows it in a box to select by hand. */
export function useCopy() {
  const toast = useToast();
  const [fallback, setFallback] = useState<string | null>(null);
  const copy = async (text: string, okMsg: string) => {
    try { await navigator.clipboard.writeText(text); toast(okMsg); setFallback(null); }
    catch { setFallback(text); }
  };
  const box = fallback ? (
    <textarea readOnly value={fallback} autoFocus onFocus={(e) => e.currentTarget.select()}
      className="mt-3 h-60 w-full rounded-xl border border-line bg-panel2 p-3 font-mono text-sm" aria-label="Copy this text" />
  ) : null;
  return { copy, box };
}

/** Two-tap confirm, since the app can't use browser confirm dialogs on every device. */
export function ConfirmButton({ children, confirmText = 'Tap again to confirm', onConfirm, className = 'btn' }: { children: ReactNode; confirmText?: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? '!border-red !text-red-text' : ''}`} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmText : children}
    </button>
  );
}
