import React, { useState } from 'react';
import { Icon, store, useData, useToast, type Route } from '../../components/core';
import { fourWeek, isValidUrl, tierLabel } from '../../lib/coach';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Client-facing: meet the coach, compare tiers, request a session. */
export function Coaching({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const c = data.coach;
  const toast = useToast();
  const [tier, setTier] = useState(c.tiers[1]?.id ?? c.tiers[0]?.id);
  const [f, setF] = useState({ name: data.profile?.name ?? '', contact: '', preferred: '', message: '' });
  const [sent, setSent] = useState(false);
  const hours = DAYS.filter((d) => c.hours[d]?.trim());
  const calendly = c.links.calendly && isValidUrl(c.links.calendly) ? c.links.calendly : '';

  return (
    <div className="page">
      <header className="page-head" style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
        {data.profile && <button className="icon-btn" aria-label="Back" onClick={() => go('home')}><Icon.back /></button>}
        <h1 className="page-title display">Coaching</h1>
      </header>

      <section className="card stack">
        <span className="eyebrow">Your coach</span>
        <h2 className="display" style={{ fontSize: 'var(--t-2xl)' }}>{c.profile.name || 'Personal coaching'}</h2>
        {c.profile.headline && <p style={{ fontWeight: 600 }}>{c.profile.headline}</p>}
        <p className="muted">{c.profile.bio || 'Personal coaching and simple tools to help you move forward, stay consistent, and make the plan fit your budget.'}</p>
        <div className="row wrap" style={{ gap: 6 }}>
          {c.profile.specialties && c.profile.specialties.split(',').map((x) => x.trim()).filter(Boolean).map((x) => <span key={x} className="badge">{x}</span>)}
          {c.profile.location && <span className="badge"><Icon.pin size={14} /> {c.profile.location}</span>}
        </div>
        {hours.length > 0 && <p className="small"><b>Hours: </b>{hours.map((d) => `${d} ${c.hours[d]}`).join(' · ')}</p>}
      </section>

      <section className="card stack" aria-labelledby="pace-h">
        <h2 id="pace-h" className="eyebrow">Choose your pace</h2>
        <p className="small muted">Weekly options with lower per-session pricing at higher frequency.</p>
        <div className="stack" role="radiogroup" aria-label="Coaching options">
          {c.tiers.map((t) => (
            <button key={t.id} role="radio" aria-checked={tier === t.id} className="option tier" onClick={() => setTier(t.id)} data-testid={`tier-${t.perWeek}`}>
              <div className="row-between" style={{ width: '100%' }}>
                <b>{tierLabel(t)}</b>
                <b className="tnum">${t.pricePerSession}<span className="small" style={{ fontWeight: 500 }}> / session</span></b>
              </div>
              <span className="tnum">About ${fourWeek(t).toLocaleString()} for 4 weeks ({t.perWeek * 4} sessions)</span>
            </button>
          ))}
        </div>
        {!c.tiersConfirmed && <p className="small why-box">Prices are the coach’s draft rates and haven’t been confirmed yet. The final price is agreed with the coach before anything is charged.</p>}
      </section>

      <section className="card stack" aria-labelledby="book-h">
        <h2 id="book-h" className="eyebrow">Book a session</h2>
        {calendly && <a className="btn btn-primary btn-block" href={calendly} target="_blank" rel="noopener noreferrer">Pick a time on Calendly</a>}
        {sent ? (
          <div className="stack" role="status">
            <b>Request saved.</b>
            <p className="small">In this preview, requests are stored on this device only. Once accounts are connected they go straight to your coach.{c.links.email ? ` You can also email ${c.links.email}.` : ''}</p>
            <button className="btn btn-outline" onClick={() => setSent(false)}>Send another</button>
          </div>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); store.requestCoaching({ name: f.name.trim(), contact: f.contact.trim(), tierId: tier, preferred: f.preferred.trim(), message: f.message.trim() }); setSent(true); toast('Request saved'); }}>
            {calendly && <p className="small muted">Or send a request instead:</p>}
            <div className="field"><label className="label" htmlFor="bk-n">Name</label><input id="bk-n" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" data-testid="bk-name" /></div>
            <div className="field"><label className="label" htmlFor="bk-c">Email or phone</label><input id="bk-c" className="input" required value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} autoComplete="email" data-testid="bk-contact" /></div>
            <div className="field"><label className="label" htmlFor="bk-p">Days and times that work</label><input id="bk-p" className="input" value={f.preferred} onChange={(e) => setF({ ...f, preferred: e.target.value })} placeholder="e.g. Tue/Thu after 5pm" /></div>
            <div className="field"><label className="label" htmlFor="bk-m">Goals or anything the coach should know <span className="muted">(optional)</span></label><textarea id="bk-m" className="textarea" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="No medical records here, please. Share health details directly with your coach." /></div>
            <button className="btn btn-ink btn-lg" disabled={!f.name.trim() || !f.contact.trim()} data-testid="bk-send">Request coaching</button>
          </form>
        )}
      </section>
    </div>
  );
}
