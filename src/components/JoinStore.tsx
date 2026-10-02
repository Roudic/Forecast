import { useState } from 'react';
import { motion } from 'framer-motion';
import { joinStore } from '../lib/backend';
import { STORE_ID, STORE_NAME } from '../lib/firebase';
import { Mark } from './TopBar';

/** First open on a new device: enter the store code once. The device stays joined after that. */
export function JoinStore({ onJoined, error: startError }: { onJoined: () => void; error?: string }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(startError ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError('Enter the store code.'); return; }
    setBusy(true); setError('');
    try { await joinStore(code, name || 'Leader'); onJoined(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card grid w-full max-w-md gap-4">
        <div className="flex items-center gap-3"><Mark /><div><h1 className="text-[28px] font-extrabold uppercase leading-none tracking-[0.03em]">Rush Forecaster</h1><span className="text-sm text-muted">{STORE_NAME} #{STORE_ID}</span></div></div>
        <p className="text-muted">Enter the store code to connect this iPad. You only do this once per device.</p>
        <label className="grid gap-1 font-bold" htmlFor="join-code">Store code
          <input id="join-code" className="field text-xl tracking-[0.2em]" autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="grid gap-1 font-bold" htmlFor="join-name">Your name or device <span className="text-sm font-normal text-muted">Like "Josh" or "Kitchen TV"</span>
          <input id="join-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <div className="rounded-xl border border-red bg-red-soft px-4 py-3 font-bold">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
      </motion.form>
    </div>
  );
}
