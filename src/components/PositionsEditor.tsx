import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DEFAULT_POSITIONS, deploy, fmt, type Board, type Positions, type Side } from '../lib/engine';
import { backend } from '../lib/backend';
import { useStoreCfg } from '../hooks/storeContext';
import { ConfirmButton, useToast } from './ui';

const SIDE_LABEL: Record<Side, string> = { boh: 'Back of House', foh: 'Front of House' };
const BOARD_LABEL: Record<Board, string> = { am: 'Breakfast board', day: 'Lunch & dinner board' };
const CUTOFFS = [600, 615, 630, 645, 660];

/**
 * Line positions editor. Each board is an ordered list of seats: seat 1 is the first person
 * on the line, seat 2 the second, and so on. Leaders reorder, swap, add and remove seats,
 * and manage the station list. Saves to the store so every iPad and the TV use it.
 */
export function PositionsEditor() {
  const { positions, canSave } = useStoreCfg();
  const toast = useToast();
  const [draft, setDraft] = useState<Positions>(positions);
  const [side, setSide] = useState<Side>('boh');
  const [board, setBoard] = useState<Board>('day');
  const [preview, setPreview] = useState(6);
  const [newStation, setNewStation] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(positions), [positions]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(positions), [draft, positions]);
  const seats = draft.seats[side][board];
  const stations = draft.stations[side];
  const dep = deploy(preview, seats);

  const setSeats = (next: string[]) => setDraft((d) => ({ ...d, seats: { ...d.seats, [side]: { ...d.seats[side], [board]: next } } }));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= seats.length) return;
    const n = [...seats];
    [n[i], n[j]] = [n[j], n[i]];
    setSeats(n);
  };
  const addStation = () => {
    const name = newStation.trim();
    if (!name) return;
    if (stations.some((s) => s.toLowerCase() === name.toLowerCase())) { toast(`${name} is already a station`); return; }
    setDraft((d) => ({ ...d, stations: { ...d.stations, [side]: [...d.stations[side], name] } }));
    setNewStation('');
  };
  const removeStation = (name: string) =>
    setDraft((d) => ({
      ...d,
      stations: { ...d.stations, [side]: d.stations[side].filter((s) => s !== name) },
      seats: { ...d.seats, [side]: { am: d.seats[side].am.filter((s) => s !== name), day: d.seats[side].day.filter((s) => s !== name) } },
    }));
  const save = async () => {
    setSaving(true);
    try { await backend.savePositions(draft); toast('Line positions saved for the whole store'); }
    catch (e) { toast(`Couldn't save: ${(e as Error).message}`); }
    finally { setSaving(false); }
  };

  return (
    <details className="card !py-1.5" id="positions-editor">
      <summary className="min-h-12 cursor-pointer py-3 font-display text-[22px] font-bold uppercase tracking-[0.05em]">
        Line positions {dirty && <span className="ml-2 rounded-full bg-warn-soft px-2.5 py-0.5 align-middle font-body text-xs normal-case tracking-normal text-warn">Unsaved changes</span>}
      </summary>
      <p className="text-[15px] text-muted">
        Set the order you fill the line. <b className="text-fg">Seat 1</b> is the first person you put on, seat 2 the second, and so on.
        List a station more than once to put more people there. With 6 BOH on the clock, the first 6 seats get filled.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Seg value={side} onChange={setSide} opts={[['boh', 'BOH'], ['foh', 'FOH']]} />
        <Seg value={board} onChange={setBoard} opts={[['am', 'Breakfast'], ['day', 'Lunch & dinner']]} />
        <label className="ml-auto inline-flex items-center gap-2 text-sm font-bold" htmlFor="am-cutoff">
          Breakfast board until
          <select id="am-cutoff" className="field !min-h-10 !w-auto !py-1.5" value={draft.amCutoff} onChange={(e) => setDraft((d) => ({ ...d, amCutoff: +e.target.value }))}>
            {CUTOFFS.map((m) => <option key={m} value={m}>{fmt(m)}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* seat order */}
        <div className="min-w-0">
          <h3 className={`mb-2 text-xl uppercase tracking-[0.04em] ${side === 'boh' ? 'text-red-text' : 'text-foh'}`}>
            {SIDE_LABEL[side]} · {BOARD_LABEL[board]} · {seats.length} seats
          </h3>
          <ol className="grid gap-1.5">
            <AnimatePresence initial={false}>
              {seats.map((st, i) => (
                <motion.li key={`${i}-${st}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`grid grid-cols-[44px_1fr_auto] items-center gap-2 rounded-xl border px-2 py-1.5 ${i < preview ? 'border-line bg-panel2' : 'border-dashed border-line bg-transparent'}`}>
                  <span className={`text-center font-display text-xl font-bold num ${i < preview ? (side === 'boh' ? 'text-red-text' : 'text-foh') : 'text-faint'}`}>{i + 1}</span>
                  <select aria-label={`Seat ${i + 1} station`} className="field !min-h-10 !py-1.5" value={st}
                    onChange={(e) => { const n = [...seats]; n[i] = e.target.value; setSeats(n); }}>
                    {stations.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="flex gap-1">
                    <IconBtn label={`Move seat ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>▲</IconBtn>
                    <IconBtn label={`Move seat ${i + 1} down`} disabled={i === seats.length - 1} onClick={() => move(i, 1)}>▼</IconBtn>
                    <IconBtn label={`Remove seat ${i + 1}`} onClick={() => setSeats(seats.filter((_, k) => k !== i))}>✕</IconBtn>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" disabled={!stations.length} onClick={() => setSeats([...seats, seats[seats.length - 1] ?? stations[0]])}>+ Add seat</button>
            <button type="button" className="btn btn-sm" onClick={() => setSeats([...draft.seats[side][board === 'am' ? 'day' : 'am']])}>
              Copy from {board === 'am' ? 'lunch & dinner' : 'breakfast'}
            </button>
          </div>
        </div>

        {/* preview + stations */}
        <div className="grid content-start gap-4">
          <div className="tile">
            <label className="label" htmlFor="pos-preview">Preview · {preview} {side.toUpperCase()} on the clock</label>
            <input id="pos-preview" type="range" min={1} max={Math.max(seats.length + 2, 8)} value={preview} onChange={(e) => setPreview(+e.target.value)} className="mt-2 w-full accent-red" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(dep.counts).filter(([, v]) => v).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-lg bg-panel3 px-2.5 py-1 text-sm font-bold">
                  <b className={`font-display text-lg ${side === 'boh' ? 'text-red-text' : 'text-foh'}`}>{v}</b>{k}
                </span>
              ))}
            </div>
            {dep.extra > 0 && <p className="mt-2 text-sm text-warn">{dep.extra} more than this board has seats. They show as extra on the floor screen. Add seats if that happens a lot.</p>}
          </div>

          <div>
            <h3 className="mb-2 text-lg uppercase tracking-[0.05em] text-muted">{side.toUpperCase()} stations</h3>
            <div className="flex flex-wrap gap-2">
              {stations.map((s) => {
                const used = draft.seats[side].am.filter((x) => x === s).length + draft.seats[side].day.filter((x) => x === s).length;
                return (
                  <span key={s} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-panel2 py-1 pl-3 pr-1 text-sm font-bold">
                    {s}<span className="font-normal text-muted num">· {used}</span>
                    <ConfirmButton className="btn btn-sm !min-h-8 !px-2" confirmText={used ? `Remove + ${used} seats?` : 'Remove?'} onConfirm={() => removeStation(s)}>✕</ConfirmButton>
                  </span>
                );
              })}
            </div>
            <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); addStation(); }}>
              <input id="new-station" aria-label="New station name" placeholder={side === 'boh' ? 'e.g. Grill, Nuggets, Catering' : 'e.g. Outside Order Taker, Mobile'} className="field !min-h-10 !py-1.5 font-normal" value={newStation} onChange={(e) => setNewStation(e.target.value)} />
              <button type="submit" className="btn btn-sm whitespace-nowrap">Add station</button>
            </form>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 py-4">
        <button type="button" className="btn btn-primary" disabled={!dirty || saving || !canSave} onClick={save}>{saving ? 'Saving…' : 'Save positions'}</button>
        {dirty && <button type="button" className="btn" onClick={() => setDraft(positions)}>Undo changes</button>}
        <ConfirmButton onConfirm={() => setDraft(structuredClone(DEFAULT_POSITIONS))} confirmText="Tap again to load defaults">Start from Hueytown default</ConfirmButton>
        <span className="text-sm text-muted">{canSave ? 'Saved positions show on every iPad and the kitchen TV.' : 'Upload your own sales data to save.'}</span>
      </div>
    </details>
  );
}

function Seg<T extends string>({ value, onChange, opts }: { value: T; onChange: (v: T) => void; opts: [T, string][] }) {
  return (
    <div className="inline-grid grid-flow-col rounded-xl border border-line bg-panel2 p-1" role="group">
      {opts.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`min-h-10 rounded-lg px-3.5 font-display text-[17px] font-bold uppercase tracking-[0.04em] transition-colors ${value === v ? 'bg-red text-white' : 'text-muted'}`}>{l}</button>
      ))}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel3 text-sm text-muted transition hover:text-fg disabled:opacity-30">{children}</button>
  );
}
