import { motion } from 'framer-motion';
import { STORE_ID, STORE_NAME } from '../lib/firebase';
import { backend } from '../lib/backend';

export type Mode = 'live' | 'ahead';

export function Mark() {
  return (
    <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-gradient-to-br from-red to-red-2 shadow-glow" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 13.5V9.5M9.5 2.5h5M12 2.5v3.5M18.5 7l1.6-1.6" /></svg>
    </div>
  );
}

type Props = {
  mode: Mode; setMode: (m: Mode) => void; isSample: boolean; dayCount: number; onFiles: (f: File[]) => void; uploading: boolean;
};

export function TopBar({ mode, setMode, isSample, dayCount, onFiles, uploading }: Props) {
  return (
    <header className="sticky z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-bg/85 px-4 pb-3 pt-3.5 backdrop-blur-md" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mr-auto flex min-w-0 items-center gap-3">
        <Mark />
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold uppercase leading-none tracking-[0.03em] max-sm:text-[22px]">Rush Forecaster</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {STORE_NAME} #{STORE_ID}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isSample ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok'}`}>
              {isSample ? 'Sample data · upload yours' : `${dayCount} days saved`}
            </span>
            {backend.mode === 'local' && <span className="rounded-full bg-panel2 px-2.5 py-0.5 text-xs font-bold">Demo mode</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="csv-upload" className={`btn btn-primary cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>{uploading ? 'Saving…' : 'Upload CSVs'}</label>
        <input id="csv-upload" type="file" accept=".csv,text/csv,.txt" multiple hidden onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) onFiles(f); }} />
        <div className="relative grid grid-cols-2 rounded-2xl border border-line bg-panel2 p-1" role="group" aria-label="Mode">
          {(['live', 'ahead'] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`relative z-[1] min-h-[42px] whitespace-nowrap px-4 font-display text-[19px] font-bold uppercase tracking-[0.05em] transition-colors max-sm:px-2.5 max-sm:text-base ${mode === m ? 'text-white' : 'text-muted'}`}>
              {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 -z-[1] rounded-[10px] bg-gradient-to-b from-red to-red-2 shadow-glow" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              {m === 'live' ? <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${mode === 'live' ? 'bg-white' : 'bg-ok'} animate-pulse`} />Today · Live</span> : 'Look Ahead'}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

