import React, { useMemo, useRef, useState } from 'react';
import { ConfirmDialog, Icon, Sheet, store, useData, useToast } from './core';
import { PhotoStore, autoMilestones, MAX_PHOTOS } from '../lib/photos';
import { completedSessions, exerciseBests } from '../lib/stats';
import { formatShortDate, toDateKey } from '../lib/dates';
import type { ProgressPhoto } from '../lib/types';

export const photos = new PhotoStore();

/** Shrink to ≤900px on the long side and re-encode as JPEG, entirely on-device. */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file couldn’t be read as an image.')); i.src = url; });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally { URL.revokeObjectURL(url); }
}

export function PhotosMilestones() {
  const data = useData();
  const toast = useToast();
  const [list, setList] = useState<ProgressPhoto[]>(() => photos.list());
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ProgressPhoto | null>(null);
  const [del, setDel] = useState<ProgressPhoto | null>(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const prs = useMemo(() => [...exerciseBests(data).values()].filter((b) => b.sessions > 1).length, [data]);
  const auto = autoMilestones(completedSessions(data), prs, data.checkins.length);
  const months = useMemo(() => {
    const m = new Map<string, ProgressPhoto[]>();
    list.forEach((p) => { const k = p.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), p]); });
    return [...m.entries()];
  }, [list]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const url = await compress(f);
      photos.add(toDateKey(new Date()), url);
      setList(photos.list());
      toast('Photo saved on this device');
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <section className="card stack" aria-labelledby="pm-h">
      <div className="row-between">
        <h2 id="pm-h" className="eyebrow">Photos & milestones</h2>
        <span className="small muted tnum">{list.length}/{MAX_PHOTOS} photos</span>
      </div>
      <p className="small muted">Progress is more than a scale number. Photos are optional, compressed, and never leave this device.</p>
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="photo-in" onChange={(e) => onFile(e.target.files?.[0])} data-testid="photo-input" />
      <label htmlFor="photo-in" className="btn btn-outline" aria-busy={busy}>{busy ? 'Saving…' : <><Icon.plus size={16} /> Add a monthly photo</>}</label>
      {months.map(([m, ps]) => (
        <div key={m}>
          <div className="small" style={{ fontWeight: 700, margin: '6px 0' }}>{new Date(m + '-02').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
          <div className="photo-grid">{ps.map((p) => <button key={p.id} className="photo" onClick={() => setView(p)} aria-label={`Photo from ${formatShortDate(p.date)}`} data-testid="photo"><img src={p.dataUrl} alt="" /></button>)}</div>
        </div>
      ))}

      <hr className="divider" />
      <div className="row-between"><b className="small">Milestones</b><button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)} data-testid="add-milestone"><Icon.plus size={16} /> Add</button></div>
      <ul className="milestones">
        {auto.map((a) => <li key={a.title}><span className="dot" style={{ color: 'var(--ember)' }} /> <span className="grow">{a.title}</span>{a.date && <span className="small muted">{formatShortDate(a.date)}</span>}</li>)}
        {[...data.milestones].sort((a, b) => b.date.localeCompare(a.date)).map((m) => <li key={m.id}><span className="dot" style={{ color: 'var(--moss)' }} /> <span className="grow">{m.title}{m.note ? <span className="small muted"> · {m.note}</span> : null}</span><span className="small muted">{formatShortDate(m.date)}</span><button className="icon-btn" aria-label={`Remove ${m.title}`} onClick={() => store.removeMilestone(m.id)}><Icon.trash /></button></li>)}
        {!auto.length && !data.milestones.length && <li className="small muted">Your first workout becomes your first milestone. Add your own too: first pull-up, a 5K, a week of sleep.</li>}
      </ul>

      {view && (
        <Sheet title={formatShortDate(view.date)} onClose={() => setView(null)}>
          <img src={view.dataUrl} alt={`Progress photo from ${formatShortDate(view.date)}`} style={{ width: '100%', borderRadius: 12 }} />
          <button className="btn btn-danger btn-block" style={{ marginTop: 12 }} onClick={() => { setDel(view); }}>Delete photo</button>
        </Sheet>
      )}
      {del && <ConfirmDialog danger title="Delete this photo?" body="It’s removed from this device for good." confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={() => { photos.remove(del.id); setList(photos.list()); setDel(null); setView(null); }} />}
      {adding && <MilestoneSheet onClose={() => setAdding(false)} />}
    </section>
  );
}

function MilestoneSheet({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toDateKey(new Date()));
  return (
    <Sheet title="New milestone" onClose={onClose}>
      <form className="stack-lg" onSubmit={(e) => { e.preventDefault(); store.addMilestone({ title: title.trim(), note: note.trim() || undefined, date }); onClose(); }}>
        <div className="field"><label className="label" htmlFor="ms-t">What did you do?</label><input id="ms-t" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="First unassisted pull-up" data-testid="ms-title" /></div>
        <div className="field"><label className="label" htmlFor="ms-d">When</label><input id="ms-d" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label className="label" htmlFor="ms-n">Note <span className="muted">(optional)</span></label><input id="ms-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn btn-ink btn-lg" disabled={!title.trim()} data-testid="ms-save">Save milestone</button>
      </form>
    </Sheet>
  );
}
