import React, { useRef, useState } from 'react';
import { Icon, Sheet, cloud, store, useCloud, useToast, type Route } from '../../components/core';
import { CloudError, isActive } from '../../lib/cloud';
import { downscale, parseScan, regram, totals, type ScanItem, type ScanResult } from '../../lib/foodPhoto';
import { toDateKey } from '../../lib/dates';

type St = { s: 'pick' } | { s: 'ready' } | { s: 'busy' } | { s: 'result'; r: ScanResult } | { s: 'error'; msg: string };

/** Take or choose a food photo → AI estimate → edit grams → log. PX Plus only. */
export function PhotoScanSheet({ onClose, go }: { onClose: () => void; go: (r: Route) => void }) {
  const c = useCloud();
  const toast = useToast();
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [st, setSt] = useState<St>({ s: 'pick' });
  const [img, setImg] = useState<{ base64: string; mediaType: string; preview: string } | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ScanItem[]>([]);
  const [name, setName] = useState('');
  const [where, setWhere] = useState<'home' | 'out'>('home');

  const allowed = c.enabled && !!c.session && isActive(c.sub);

  const pickFile = async (f?: File | null) => {
    if (!f) return;
    try { const d = await downscale(f); setImg(d); setSt({ s: 'ready' }); }
    catch { setSt({ s: 'error', msg: 'Couldn’t open that photo. Try a different one.' }); }
  };

  const analyze = async () => {
    if (!img) return;
    setSt({ s: 'busy' });
    try {
      const r = parseScan(await cloud.scanFood(img.base64, img.mediaType, note));
      setItems(r.items);
      setName(r.mealName || r.items.map((i) => i.name).slice(0, 2).join(' & ') || 'Meal');
      setSt({ s: 'result', r });
    } catch (e) {
      const code = e instanceof CloudError ? e.code : '';
      if (code === 'not_subscribed') void cloud.refreshSub();
      setSt({ s: 'error', msg: e instanceof Error ? e.message : 'The photo scan didn’t work. Try again.' });
    }
  };

  const t = totals(items);

  return (
    <Sheet title="Scan your food" onClose={onClose}>
      <div className="stack-lg" data-testid="photo-scan">
        {!allowed ? (
          <div className="stack" data-testid="scan-locked">
            <p><b>Photo calorie scan is part of PX Plus.</b></p>
            <p className="small muted">{!c.enabled ? 'Accounts aren’t switched on in this version of the app yet.' : !c.session ? 'Sign in, then upgrade to PX Plus to scan meals.' : 'Upgrade to PX Plus to scan meals. It shares the daily AI allowance with the AI coach.'}</p>
            {c.enabled && <button className="btn btn-ink" onClick={() => { onClose(); go('you'); }}>{c.session ? 'See PX Plus' : 'Sign in'}</button>}
          </div>
        ) : (
          <>
            <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickFile(e.target.files?.[0])} data-testid="scan-camera-input" />
            <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} data-testid="scan-file-input" />

            {img ? <img src={img.preview} alt="Your meal" className="scan-preview" /> : (
              <div className="scan-drop">
                <Icon.camera size={36} />
                <p className="small muted">Shoot from above with the whole plate in frame. A fork or hand in the shot helps judge portions.</p>
              </div>
            )}

            {(st.s === 'pick' || st.s === 'ready' || st.s === 'error') && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-outline grow" onClick={() => cam.current?.click()} data-testid="scan-take"><Icon.camera size={18} /> {img ? 'Retake' : 'Take photo'}</button>
                <button className="btn btn-ghost grow" onClick={() => lib.current?.click()} data-testid="scan-choose">Choose photo</button>
              </div>
            )}

            {st.s === 'ready' && (
              <>
                <div className="field"><label className="label" htmlFor="scan-note">Anything the photo can’t show? <span className="muted">(optional)</span></label>
                  <input id="scan-note" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cooked in butter, 2 tbsp ranch" data-testid="scan-note" /></div>
                <button className="btn btn-primary btn-lg" onClick={analyze} data-testid="scan-analyze">Estimate calories</button>
              </>
            )}

            {st.s === 'busy' && <div className="stack" aria-busy="true" aria-label="Estimating"><div className="skeleton" style={{ height: 52 }} /><div className="skeleton" style={{ height: 52 }} /><p className="small muted">Looking at your plate…</p></div>}

            {st.s === 'error' && <p className="small" role="alert" data-testid="scan-error">{st.msg} You can still log the meal by hand.</p>}

            {st.s === 'result' && (st.r.notFood || !items.length) && (
              <p role="alert" data-testid="scan-notfood">{st.r.notFood ? 'That doesn’t look like food. Try another photo.' : 'No food could be picked out. Try a clearer photo from above.'}</p>
            )}

            {st.s === 'result' && items.length > 0 && (
              <div className="stack" data-testid="scan-result">
                {st.r.demo && <p className="why-box small" data-testid="scan-demo"><b>Demo:</b> this is a fixed sample estimate, not an analysis of your photo.</p>}
                <div className="scan-total">
                  <div><b className="tnum" data-testid="scan-kcal">{t.kcal}</b><span>kcal</span></div>
                  <div><b className="tnum" data-testid="scan-p">{t.p}g</b><span>protein</span></div>
                  <div><b className="tnum">{t.c}g</b><span>carbs</span></div>
                  <div><b className="tnum">{t.f}g</b><span>fat</span></div>
                </div>
                <ul className="scan-items">
                  {items.map((i, k) => (
                    <li key={k} data-testid="scan-item">
                      <div className="row-between"><b>{i.name}</b><button className="icon-btn" aria-label={`Remove ${i.name}`} onClick={() => setItems(items.filter((_, j) => j !== k))}><Icon.trash size={16} /></button></div>
                      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <input className="input scan-grams" type="number" inputMode="numeric" min={0} max={2000} aria-label={`Grams of ${i.name}`} value={i.grams} onChange={(e) => setItems(items.map((x, j) => (j === k ? regram(x, Number(e.target.value)) : x)))} data-testid={`scan-grams-${k}`} />
                        <span className="small">g</span>
                        <span className="small muted grow tnum">{i.kcal} kcal · {i.p}g P · {i.c}g C · {i.f}g F</span>
                        <span className={`badge conf-${i.confidence}`}>{i.confidence === 'high' ? 'Clear' : i.confidence === 'medium' ? 'Likely' : 'Rough guess'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="small muted">AI estimate from a photo. Portion sizes are hard to judge by eye, so check the grams; calories update as you edit.{st.r.caveat && !st.r.demo ? ` ${st.r.caveat}` : ''}</p>
                <div className="field"><label className="label" htmlFor="scan-name">Meal name</label><input id="scan-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
                <div className="seg" role="group" aria-label="Where"><button aria-pressed={where === 'home'} onClick={() => setWhere('home')}>Home</button><button aria-pressed={where === 'out'} onClick={() => setWhere('out')}>Eating out</button></div>
                <button className="btn btn-primary btn-lg" disabled={!name.trim()} onClick={() => {
                  store.logMeal({ name: name.trim(), where, date: toDateKey(new Date()), kcal: t.kcal, p: t.p, c: t.c, f: t.f, source: 'photo', items: items.map((i) => ({ name: i.name, grams: i.grams })) });
                  toast(`Logged ${t.kcal} kcal`);
                  onClose();
                }} data-testid="scan-log">Log {t.kcal} kcal</button>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
