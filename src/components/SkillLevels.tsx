import React, { useState } from 'react';
import { ConfirmDialog, store, useData, useToast } from './core';
import { LADDERS, levelOf, nextLevel } from '../lib/skills';

/** PX Boot Camp levels on the Progress screen. */
export function SkillLevels() {
  const data = useData();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ id: string; level: number; name: string; test: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card stack" aria-labelledby="sk-h" data-testid="skill-levels">
      <div className="row-between"><h2 id="sk-h" className="eyebrow">PX Boot Camp levels</h2><span className="small muted">Calisthenics skills</span></div>
      {LADDERS.map((l) => {
        const lv = levelOf(data, l.id);
        const nx = nextLevel(data, l.id);
        const pct = Math.round((lv / l.levels.length) * 100);
        return (
          <article key={l.id} className="skill" data-testid={`skill-${l.id}`}>
            <button className="skill-head" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
              <span><b>{l.name}</b><span className="small muted" style={{ display: 'block' }}>{lv ? `Level ${lv}: ${l.levels[lv - 1].name}` : 'Not started'}</span></span>
              <span className="small tnum">{lv}/{l.levels.length}</span>
            </button>
            <span className="ch-bar" role="progressbar" aria-label={`${l.name} level`} aria-valuemin={0} aria-valuemax={l.levels.length} aria-valuenow={lv}><span style={{ width: `${pct}%` }} /></span>
            {nx ? (
              <div className="row-between small" style={{ gap: 8 }}>
                <span className="muted">Next: <b style={{ color: 'var(--ink)' }}>{nx.name}</b> · {nx.test}</span>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirm({ id: l.id, level: nx.number, name: nx.name, test: nx.test })} data-testid={`levelup-${l.id}`}>I did it</button>
              </div>
            ) : <p className="small"><b>Top level reached.</b> Keep it sharp.</p>}
            {open === l.id && (
              <ol className="skill-steps small">
                {l.levels.map((s, i) => <li key={s.name} className={i < lv ? 'done' : ''}><b>{s.name}</b> <span className="muted">· {s.test}</span></li>)}
                {lv > 0 && <li style={{ listStyle: 'none', marginTop: 6 }}><button className="link-btn small" onClick={() => { store.setSkillLevel(l.id, lv - 1); toast('Level adjusted'); }}>Move back a level</button></li>}
              </ol>
            )}
          </article>
        );
      })}
      <p className="small muted">Tap a skill to see every level. Only mark a level when you’ve done its test with good form.</p>
      {confirm && (
        <ConfirmDialog title={`Level ${confirm.level}: ${confirm.name}`} body={`Did you do it with good form? Test: ${confirm.test}.`} confirmLabel="Yes, level up" onCancel={() => setConfirm(null)}
          onConfirm={() => { store.setSkillLevel(confirm.id, confirm.level); toast(`Level up! ${confirm.name}`); setConfirm(null); }} />
      )}
    </section>
  );
}
