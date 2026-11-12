// PX Saturdays (coach events with RSVPs) and in-app coaching payments (Stripe Connect).
import React, { useEffect, useState } from 'react';
import { ConfirmDialog, Sheet, social, useCloud, useData, useSocial, useToast } from '../components/core';
import { eventsOn, money, type CoachEvent, type CoachOffer } from '../lib/social';
import { addDays, toDateKey } from '../lib/dates';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const EVENT_KEY = 'px:event';
export const stashEvent = (id: string) => { try { sessionStorage.setItem(EVENT_KEY, id); } catch { /* ignore */ } };
const takeEvent = () => { try { const v = sessionStorage.getItem(EVENT_KEY); sessionStorage.removeItem(EVENT_KEY); return v; } catch { return null; } };

// ── events ─────────────────────────────────────────────────────────────────
export function EventsSection() {
  const s = useSocial();
  const toast = useToast();
  const [post, setPost] = useState(false);
  const [open, setOpen] = useState<CoachEvent | null>(null);
  const me = s.me!;
  const upcoming = s.events.filter((e) => !e.cancelled || e.coach_id === me.user_id);
  if (!me.is_coach && upcoming.length === 0) return null;
  return (
    <section className="card stack" data-testid="events">
      <div className="row-between"><h2 className="eyebrow">PX Saturdays & sessions</h2>{me.is_coach && <button className="btn btn-outline btn-sm" onClick={() => setPost(true)} data-testid="post-event">Post a session</button>}</div>
      {upcoming.length === 0 && <p className="small muted">Post a free group session, like a Saturday park workout. Share the link on Facebook and Instagram; people sign up right in the app.</p>}
      {upcoming.map((e) => (
        <button key={e.id} className="event-row" onClick={() => setOpen(e)} data-testid="event">
          <span className="grow" style={{ textAlign: 'left' }}>
            <b>{e.title}</b>{e.cancelled && <span className="badge" style={{ marginLeft: 6 }}>Cancelled</span>}
            <span className="small muted" style={{ display: 'block' }}>{when(e.starts_at)} · {e.location}</span>
          </span>
          <span className="small" style={{ textAlign: 'right' }}>{e.me_going ? <b className="going">Going</b> : null}<span className="muted" style={{ display: 'block' }}>{e.going}{e.capacity ? `/${e.capacity}` : ''} going</span></span>
        </button>
      ))}
      {post && <PostEventSheet onClose={() => setPost(false)} />}
      {open && <EventSheet event={s.events.find((x) => x.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function PostEventSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const today = toDateKey(new Date());
  const w = new Date().getDay();
  const sat = addDays(today, w === 6 ? 7 : 6 - w);
  const [f, setF] = useState({ title: 'PX Saturday: free calisthenics', day: sat, time: '09:00', minutes: 60, location: '', details: 'Free, all levels. Bring water and a mat if you have one.', capacity: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet title="Post a session" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
          const [y, m, d] = f.day.split('-').map(Number);
          const [hh, mm] = f.time.split(':').map(Number);
          await social.postEvent({ title: f.title, startsAt: new Date(y, m - 1, d, hh, mm).toISOString(), minutes: f.minutes, location: f.location, details: f.details, capacity: f.capacity ? Number(f.capacity) : null });
          toast('Session posted. Share the link to fill it.');
          onClose();
        } catch (e2) { setErr(errMsg(e2)); }
        setBusy(false);
      }}>
        <div className="field"><label className="label" htmlFor="ev-t">Name</label><input id="ev-t" className="input" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="ev-title" /></div>
        <div className="row">
          <div className="field grow"><label className="label" htmlFor="ev-d">Day</label><input id="ev-d" className="input" type="date" min={today} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} data-testid="ev-day" /></div>
          <div className="field grow"><label className="label" htmlFor="ev-h">Time</label><input id="ev-h" className="input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} data-testid="ev-time" /></div>
        </div>
        <div className="field"><label className="label" htmlFor="ev-l">Where to meet</label><input id="ev-l" className="input" maxLength={160} placeholder="Park name and a landmark, e.g. by the pavilion" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} data-testid="ev-location" /></div>
        <div className="row">
          <div className="field grow"><label className="label" htmlFor="ev-m">Length (min)</label><input id="ev-m" className="input" type="number" inputMode="numeric" min={15} max={480} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} /></div>
          <div className="field grow"><label className="label" htmlFor="ev-c">Spots (optional)</label><input id="ev-c" className="input" type="number" inputMode="numeric" min={1} max={500} placeholder="No limit" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} data-testid="ev-capacity" /></div>
        </div>
        <div className="field"><label className="label" htmlFor="ev-x">Details</label><textarea id="ev-x" className="input" rows={2} maxLength={500} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy} data-testid="ev-post">{busy ? 'Posting…' : 'Post session'}</button>
      </form>
    </Sheet>
  );
}

function EventSheet({ event, onClose, onChange }: { event: CoachEvent; onClose: () => void; onChange?: () => Promise<void> }) {
  const s = useSocial();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<{ user_id: string; display_name: string }[] | null>(null);
  const [cancel, setCancel] = useState(false);
  const mine = event.coach_id === s.me?.user_id;
  const full = event.capacity != null && event.going >= event.capacity;
  const link = `${location.origin}${location.pathname}?event=${event.id}#friends`;
  useEffect(() => { if (mine) social.attendees(event.id).then(setPeople).catch(() => setPeople([])); }, [mine, event.id, event.going]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); await onChange?.(); toast(ok); } catch (e) { toast(errMsg(e)); } setBusy(false); };
  const share = async () => {
    const text = `${event.title}: ${when(event.starts_at)} at ${event.location}. Sign up in the PX-Fitness app: ${link}`;
    try { if (navigator.share) await navigator.share({ title: event.title, text }); else { await navigator.clipboard.writeText(text); toast('Link copied. Paste it on Facebook or Instagram.'); } } catch { /* closed */ }
  };
  return (
    <Sheet title={event.title} onClose={onClose}>
      <div className="stack" data-testid="event-sheet">
        {event.cancelled && <p className="form-error">This session was cancelled.</p>}
        <p><b>{when(event.starts_at)}</b> · {event.minutes} min<br />{event.location}</p>
        {event.coach_name && !mine && <p className="small muted">Hosted by {event.coach_name}</p>}
        {event.details && <p className="small">{event.details}</p>}
        <p className="small" data-testid="event-count"><b>{event.going}</b>{event.capacity ? ` of ${event.capacity}` : ''} going</p>
        {!mine && !event.cancelled && (event.me_going
          ? <><p className="going-banner">You’re going. See you there.</p><button className="btn btn-ghost" disabled={busy} onClick={() => act(() => social.cancelRsvp(event.id), 'Spot released')} data-testid="event-unrsvp">Can’t make it anymore</button></>
          : <button className="btn btn-primary btn-block" disabled={busy || full} onClick={() => act(() => social.rsvp(event.id), 'You’re in. See you there!')} data-testid="event-rsvp">{full ? 'Full' : 'Save my spot'}</button>)}
        {mine && (
          <>
            <button className="btn btn-primary" onClick={share} data-testid="event-share">Share link</button>
            <section className="stack" style={{ gap: 4 }} data-testid="attendees">
              <b className="small">Who’s coming</b>
              {people === null ? <p className="small muted">Loading…</p> : people.length === 0 ? <p className="small muted">No sign-ups yet. Share the link in local Facebook groups and your stories.</p> : people.map((p) => <p key={p.user_id} className="small">{p.display_name}</p>)}
            </section>
            {!event.cancelled && <button className="btn btn-ghost" onClick={() => setCancel(true)}>Cancel session</button>}
          </>
        )}
      </div>
      {cancel && <ConfirmDialog danger title="Cancel this session?" body="Everyone who signed up will see it’s cancelled." confirmLabel="Cancel session" onCancel={() => setCancel(false)} onConfirm={() => { setCancel(false); void act(() => social.cancelEvent(event.id), 'Session cancelled'); }} />}
    </Sheet>
  );
}

/** Opens a session shared by link (?event=…), with or without a Friends profile. */
export function EventFromLink() {
  const toast = useToast();
  const s = useSocial();
  const [ev, setEv] = useState<CoachEvent | null>(null);
  useEffect(() => {
    const id = takeEvent();
    if (!id) return;
    social.getEvent(id).then((e) => (e ? setEv(e) : toast('That session link doesn’t work anymore.'))).catch(() => toast('Couldn’t open that session.'));
  }, [toast]);
  if (!ev) return null;
  return <EventSheet event={s.events.find((x) => x.id === ev.id) ?? ev} onClose={() => setEv(null)} onChange={async () => setEv(await social.getEvent(ev.id))} />;
}

/** Today screen: a session I signed up for today. */
export function EventTodayCard() {
  const c = useCloud();
  const s = useSocial();
  const today = toDateKey(new Date());
  const mine = eventsOn(s.events, today).filter((e) => e.me_going);
  if (!c.enabled || !s.me || !mine.length) return null;
  return (
    <section className="card card-ink stack" data-testid="event-today">
      <h2 className="eyebrow" style={{ color: 'inherit', opacity: 0.8 }}>You’re going today</h2>
      {mine.map((e) => <p key={e.id}><b>{e.title}</b><br /><span className="small">{new Date(e.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {e.location}</span></p>)}
    </section>
  );
}

// ── coaching payments ──────────────────────────────────────────────────────
/** Coach side: connect Stripe, set prices, see what's been paid. */
export function CoachPayments() {
  const s = useSocial();
  const data = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const me = s.me!;
  if (!me.is_coach) return null;
  const myOffers = s.offers.filter((o) => o.coach_id === me.user_id);
  const received = s.payments.filter((p) => p.coach_id === me.user_id);
  const monthStart = toDateKey(new Date()).slice(0, 8) + '01';
  const monthTotal = received.filter((p) => p.status === 'paid' && toDateKey(new Date(p.created_at)) >= monthStart).reduce((n, p) => n + p.amount_cents, 0);
  const connect = async () => { setBusy(true); try { location.assign(await social.connectPayouts(location.origin + location.pathname)); } catch (e) { toast(errMsg(e)); setBusy(false); } };
  const ready = !!s.payouts?.chargesEnabled;
  return (
    <section className="card stack" data-testid="coach-payments">
      <h2 className="eyebrow">Get paid in the app</h2>
      {!ready ? (
        <>
          <p className="small muted">{s.payouts?.connected ? 'Your Stripe account isn’t finished yet. Stripe needs a few more details before clients can pay you.' : 'Connect your own Stripe account. Clients pay you directly; Stripe’s card fee comes out of each payment and PX-Fitness takes nothing.'}</p>
          <div className="row"><button className="btn btn-primary grow" disabled={busy} onClick={connect} data-testid="connect-stripe">{s.payouts?.connected ? 'Finish Stripe setup' : 'Connect Stripe'}</button>{s.payouts?.connected && <button className="btn btn-ghost" onClick={() => social.payoutStatus().then((r) => toast(r.chargesEnabled ? 'Payments are ready' : 'Still waiting on Stripe')).catch((e) => toast(errMsg(e)))}>Check again</button>}</div>
        </>
      ) : <p className="small"><b className="going">Ready to take payments.</b> Money goes straight to your Stripe account.</p>}

      <b className="small">What clients can pay for</b>
      {myOffers.length === 0 && <p className="small muted">Add your session prices. Clients connected to you will see them.</p>}
      {myOffers.map((o) => <div key={o.id} className="row-between small" data-testid="my-offer"><span><b>{o.name}</b> <span className="muted">· {money(o.price_cents)}{o.sessions > 1 ? ` for ${o.sessions} sessions` : ''}</span></span><button className="btn btn-ghost btn-sm" onClick={() => social.removeOffer(o.id).catch((e) => toast(errMsg(e)))}>Remove</button></div>)}
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-outline btn-sm" onClick={() => setAdd(true)} data-testid="add-offer">Add a price</button>
        {myOffers.length === 0 && data.coach.tiers.length > 0 && <button className="btn btn-ghost btn-sm" onClick={async () => { try { for (const t of data.coach.tiers) await social.addOffer({ name: `${t.perWeek}× a week · per session`, priceCents: t.pricePerSession * 100, sessions: 1 }); toast('Added your coaching tiers'); } catch (e) { toast(errMsg(e)); } }} data-testid="use-tiers">Use my coaching tiers</button>}
      </div>

      {received.length > 0 && (
        <div className="stack" style={{ gap: 4 }} data-testid="payments-received">
          <div className="row-between"><b className="small">Payments</b><span className="small">This month: <b className="tnum">{money(monthTotal)}</b></span></div>
          {received.slice(0, 8).map((p) => <p key={p.id} className="small">{s.people[p.client_id] ?? 'Client'} · {p.offer_name} · <b>{money(p.amount_cents)}</b> <span className="muted">· {new Date(p.created_at).toLocaleDateString()}{p.status === 'refunded' ? ' · refunded' : ''}</span></p>)}
        </div>
      )}
      {add && <AddOfferSheet onClose={() => setAdd(false)} />}
    </section>
  );
}

function AddOfferSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: 'Single session', price: '80', sessions: 1 });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet title="Add a price" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await social.addOffer({ name: f.name, priceCents: Math.round(Number(f.price) * 100), sessions: f.sessions }); toast('Price added'); onClose(); } catch (e2) { setErr(errMsg(e2)); } }}>
        <div className="field"><label className="label" htmlFor="of-n">Name</label><input id="of-n" className="input" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="of-name" /></div>
        <div className="row">
          <div className="field grow"><label className="label" htmlFor="of-p">Price ($)</label><input id="of-p" className="input" type="number" inputMode="decimal" min={5} max={1000} step="1" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} data-testid="of-price" /></div>
          <div className="field grow"><label className="label" htmlFor="of-s">Sessions</label><input id="of-s" className="input" type="number" inputMode="numeric" min={1} max={50} value={f.sessions} onChange={(e) => setF({ ...f, sessions: Number(e.target.value) })} /></div>
        </div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" data-testid="of-save">Save</button>
      </form>
    </Sheet>
  );
}

/** Client side: pay my coach. */
export function PayCoach({ coachId }: { coachId: string }) {
  const s = useSocial();
  const toast = useToast();
  const [pick, setPick] = useState<CoachOffer | null>(null);
  const offers = s.offers.filter((o) => o.coach_id === coachId);
  const mine = s.payments.filter((p) => p.coach_id === coachId && p.client_id === s.me?.user_id);
  if (!offers.length && !mine.length) return null;
  return (
    <div className="stack" style={{ gap: 6 }} data-testid="pay-coach">
      <b className="small">Book and pay</b>
      {offers.map((o) => <div key={o.id} className="row-between small"><span><b>{o.name}</b>{o.sessions > 1 ? <span className="muted"> · {o.sessions} sessions</span> : null}</span><button className="btn btn-primary btn-sm" onClick={() => setPick(o)} data-testid="pay-offer">Pay {money(o.price_cents)}</button></div>)}
      {mine.length > 0 && <p className="small muted">Paid: {mine.slice(0, 3).map((p) => `${p.offer_name} ${money(p.amount_cents)} on ${new Date(p.created_at).toLocaleDateString()}`).join(' · ')}</p>}
      {pick && <PaySheet offer={pick} coachName={s.people[coachId] ?? 'your coach'} onClose={() => setPick(null)} onError={(m) => toast(m)} />}
    </div>
  );
}

function PaySheet({ offer, coachName, onClose, onError }: { offer: CoachOffer; coachName: string; onClose: () => void; onError: (m: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={`${offer.name} · ${money(offer.price_cents)}`} onClose={onClose}>
      <div className="stack">
        <p className="small">You’ll pay {coachName} through Stripe’s secure checkout. PX-Fitness never sees your card.</p>
        <div className="field"><label className="label" htmlFor="pay-n">Note for your coach (optional)</label><input id="pay-n" className="input" maxLength={200} placeholder="e.g. Saturday mornings work best" value={note} onChange={(e) => setNote(e.target.value)} data-testid="pay-note" /></div>
        <button className="btn btn-primary btn-block" disabled={busy} data-testid="pay-go" onClick={async () => { setBusy(true); try { location.assign(await social.payCoach(offer.id, note, location.origin + location.pathname)); } catch (e) { onError(errMsg(e)); setBusy(false); } }}>{busy ? 'Opening checkout…' : `Continue to payment`}</button>
      </div>
    </Sheet>
  );
}

/** After Stripe sends someone back (?coachpay=… or ?payouts=…). */
export function usePaymentReturn() {
  const toast = useToast();
  const c = useCloud();
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const pay = q.get('coachpay'), po = q.get('payouts');
    if (!pay && !po) return;
    q.delete('coachpay'); q.delete('payouts');
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
    if (pay === 'success') { toast('Payment sent. Your coach will see it shortly.'); setTimeout(() => void social.load(), 2500); }
    else if (pay === 'cancel') toast('Payment canceled. You weren’t charged.');
    if (po && c.session) social.payoutStatus().then((r) => toast(r.chargesEnabled ? 'Stripe is connected. Clients can pay you now.' : 'Stripe still needs a few details. Tap “Finish Stripe setup”.')).catch(() => undefined);
  }, [toast, c.session]);
}
