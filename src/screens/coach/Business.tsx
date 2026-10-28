import React, { useState } from 'react';
import { ConfirmDialog, Icon, Sheet, store, useData, useToast, type Route } from '../../components/core';
import { calendarUrl, clientBalance, deskMetrics, fourWeek, isValidUrl, paymentsCsv, tierLabel, upcoming, weekPlanText } from '../../lib/coach';
import { GOALS } from '../../lib/goals';
import { addDays, DAY_SHORT, formatShortDate, toDateKey, weekStart } from '../../lib/dates';
import type { AppData, CoachClient, CoachSession, Payment } from '../../lib/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="page-head">
      <div>
        <div className="row" style={{ gap: 8 }}><span className="eyebrow">Owner workspace</span><span className="coach-flag">Coach view</span></div>
        <h1 className="page-title display">{title}</h1>
        {sub && <p className="muted small" style={{ marginTop: 4 }}>{sub}</p>}
      </div>
    </header>
  );
}

const PreviewNote = () => <p className="small muted">Prototype: business data stays on this device. Client requests arrive here only when made on this same device until accounts are connected.</p>;

export function BizDesk({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const c = data.coach;
  const m = deskMetrics(c);
  const next = upcoming(c).slice(0, 4);
  const open = c.inquiries.filter((i) => i.status === 'new' || i.status === 'contacted').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const toast = useToast();
  return (
    <div className="page">
      <Head title="Business desk" sub="Plan client weeks, follow new inquiries, and keep a simple payment log." />
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <button className="metric metric-btn" onClick={() => go('biz-clients')}><b data-testid="m-clients">{m.activeClients}</b><span>active clients</span></button>
        <button className="metric metric-btn" onClick={() => document.getElementById('inq')?.scrollIntoView()}><b data-testid="m-inq">{m.openInquiries}</b><span>open inquiries{m.newInquiries ? ` · ${m.newInquiries} new` : ''}</span></button>
        <button className="metric metric-btn" onClick={() => go('biz-pay')}><b>{usd(m.due)}</b><span>payments due</span></button>
        <button className="metric metric-btn" onClick={() => go('biz-pay')}><b>{usd(m.collectedMonth)}</b><span>collected this month</span></button>
      </div>

      <section className="card stack">
        <div className="row-between"><h2 className="eyebrow">Coming up · {m.sessionsThisWeek} this week</h2><button className="btn btn-ghost btn-sm" onClick={() => go('biz-schedule')}>Schedule</button></div>
        {next.length ? <div className="list">{next.map((s) => <div key={s.id} className="list-row"><span><b>{s.name}</b><br /><span className="small muted">{formatShortDate(s.date)} · {s.time} · {s.minutes} min · {s.kind === 'video' ? 'Video' : 'In person'}</span></span></div>)}</div> : <p className="small muted">Nothing scheduled.</p>}
      </section>

      <section className="card stack" id="inq" aria-labelledby="inq-h">
        <div className="row-between"><h2 id="inq-h" className="eyebrow">New inquiries</h2></div>
        {!open.length && <p className="small muted">No open inquiries. Requests from the Coaching page land here.</p>}
        {open.map((q) => {
          const t = c.tiers.find((x) => x.id === q.tierId);
          return (
            <div key={q.id} className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }} data-testid="inquiry">
              <div className="row-between"><b>{q.name}</b><span className={'badge ' + (q.status === 'new' ? 'badge-ember' : '')}>{q.status === 'new' ? 'New' : 'Contacted'}</span></div>
              <span className="small">{q.contact}{t ? ` · ${tierLabel(t)}` : ''}{q.preferred ? ` · ${q.preferred}` : ''}</span>
              {q.message && <span className="small muted">“{q.message}”</span>}
              <span className="small muted">{formatShortDate(q.createdAt.slice(0, 10))} · {q.source === 'app' ? 'from the app' : 'added by you'}</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {q.status === 'new' && <button className="btn btn-outline btn-sm" onClick={() => store.setInquiry(q.id, 'contacted')}>Mark contacted</button>}
                <button className="btn btn-ink btn-sm" onClick={() => { store.convertInquiry(q.id); toast(`${q.name} added as a client`); }} data-testid="convert">Add as client</button>
                <button className="btn btn-ghost btn-sm" onClick={() => store.setInquiry(q.id, 'closed')}>Close</button>
              </div>
            </div>
          );
        })}
      </section>
      <PreviewNote />
    </div>
  );
}

export function BizClients() {
  const data = useData();
  const c = data.coach;
  const [edit, setEdit] = useState<CoachClient | 'new' | null>(null);
  const [week, setWeek] = useState<CoachClient | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const list = c.clients.filter((x) => filter === 'all' || x.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="page">
      <Head title="Clients" />
      <div className="row-between">
        <div className="seg" role="group" aria-label="Filter clients"><button aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Active</button><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button></div>
        <button className="btn btn-ink btn-sm" onClick={() => setEdit('new')} data-testid="add-client"><Icon.plus size={16} /> Client</button>
      </div>
      {!list.length ? <div className="card"><p className="muted">No clients yet. Add one, or convert an inquiry from the desk.</p></div> : (
        <div className="stack">
          {list.map((cl) => {
            const t = c.tiers.find((x) => x.id === cl.tierId);
            const bal = clientBalance(c, cl.id);
            const planned = DAYS.filter((d) => cl.week[d]?.trim()).length;
            return (
              <article key={cl.id} className="card card-tight stack" style={{ gap: 6 }} data-testid="client">
                <div className="row-between"><b>{cl.name}</b>{cl.status !== 'active' && <span className="badge">{cl.status}</span>}</div>
                <span className="small muted">{[cl.contact, t && tierLabel(t), cl.goal && GOALS.find((g) => g.id === cl.goal)?.label].filter(Boolean).join(' · ')}</span>
                <span className="small">{planned ? `${planned} day${planned > 1 ? 's' : ''} programmed this week` : 'Week not programmed yet'}{bal.due ? ` · ${usd(bal.due)} due` : ''}</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setWeek(cl)} data-testid="program-week">Program week</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEdit(cl)}>Edit</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {edit && <ClientSheet data={data} client={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {week && <WeekSheet client={week} onClose={() => setWeek(null)} />}
    </div>
  );
}

function ClientSheet({ data, client, onClose }: { data: AppData; client: CoachClient | null; onClose: () => void }) {
  const [f, setF] = useState<Omit<CoachClient, 'id' | 'createdAt'>>(client ?? { name: '', contact: '', goal: '', tierId: data.coach.tiers[0]?.id, status: 'active', notes: '', week: {} });
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <Sheet title={client ? 'Edit client' : 'New client'} onClose={onClose}>
      <form className="stack-lg" onSubmit={(e) => { e.preventDefault(); store.saveClient({ ...f, id: client?.id }); toast('Client saved'); onClose(); }}>
        <div className="field"><label className="label" htmlFor="cl-n">Name</label><input id="cl-n" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="cl-name" /></div>
        <div className="field"><label className="label" htmlFor="cl-c">Email or phone</label><input id="cl-c" className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow"><label className="label" htmlFor="cl-g">Goal</label><select id="cl-g" className="input" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })}><option value="">Not set</option>{GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
          <div className="field grow"><label className="label" htmlFor="cl-t">Plan</label><select id="cl-t" className="input" value={f.tierId ?? ''} onChange={(e) => setF({ ...f, tierId: e.target.value || undefined })}><option value="">None</option>{data.coach.tiers.map((t) => <option key={t.id} value={t.id}>{tierLabel(t)}</option>)}</select></div>
        </div>
        <div className="field"><div className="label">Status</div><div className="chips">{(['active', 'paused', 'ended'] as const).map((s) => <button type="button" key={s} className="chip" aria-pressed={f.status === s} onClick={() => setF({ ...f, status: s })}>{s}</button>)}</div></div>
        <div className="field"><label className="label" htmlFor="cl-no">Notes</label><textarea id="cl-no" className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Training notes. Don’t store medical records here." /></div>
        <div className="row-between">
          {client ? <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}><Icon.trash /> Remove</button> : <span />}
          <button className="btn btn-ink" disabled={!f.name.trim()} data-testid="cl-save">Save</button>
        </div>
      </form>
      {confirm && client && <ConfirmDialog danger title={`Remove ${client.name}?`} body="Their client record and week plan are deleted. Payments and sessions stay in your logs." confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={() => { store.removeClient(client.id); onClose(); }} />}
    </Sheet>
  );
}

function WeekSheet({ client, onClose }: { client: CoachClient; onClose: () => void }) {
  const [week, setWeek] = useState<Record<string, string>>({ ...client.week });
  const toast = useToast();
  return (
    <Sheet title={`${client.name}’s week`} onClose={onClose}>
      <div className="stack">
        <p className="small muted">Write each day’s session in plain words, e.g. “Lower A: squats 3×8, RDL 3×10” or “Rest / 20 min walk”.</p>
        {DAYS.map((d) => (
          <div key={d} className="field"><label className="label" htmlFor={`wk-${d}`}>{d}</label><textarea id={`wk-${d}`} className="textarea" style={{ minHeight: 48 }} value={week[d] ?? ''} onChange={(e) => setWeek({ ...week, [d]: e.target.value })} data-testid={`wk-${d}`} /></div>
        ))}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-outline grow" onClick={async () => { try { await navigator.clipboard.writeText(weekPlanText(client.name, week)); toast('Plan copied. Paste it into a text or email'); } catch { toast('Copy isn’t available here'); } }}>Copy as text</button>
          <button className="btn btn-ink grow" onClick={() => { store.saveClient({ ...client, week }); toast('Week saved'); onClose(); }} data-testid="wk-save">Save week</button>
        </div>
      </div>
    </Sheet>
  );
}

export function BizSchedule() {
  const data = useData();
  const c = data.coach;
  const [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState<CoachSession | 'new' | null>(null);
  const ws = addDays(weekStart(toDateKey(new Date())), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <div className="page">
      <Head title="Schedule" />
      <div className="row-between">
        <div className="row"><button className="icon-btn" aria-label="Previous week" onClick={() => setOffset(offset - 1)}><Icon.back /></button><b className="small">Week of {formatShortDate(ws)}</b><button className="icon-btn" aria-label="Next week" onClick={() => setOffset(offset + 1)} style={{ transform: 'scaleX(-1)' }}><Icon.back /></button></div>
        <button className="btn btn-ink btn-sm" onClick={() => setEdit('new')} data-testid="add-session"><Icon.plus size={16} /> Session</button>
      </div>
      <div className="stack">
        {days.map((d) => {
          const ss = c.sessions.filter((s) => s.date === d).sort((a, b) => a.time.localeCompare(b.time));
          const dn = DAY_SHORT[new Date(d + 'T12:00').getDay()];
          return (
            <section key={d} className="card card-tight" aria-label={`${dn} ${formatShortDate(d)}`}>
              <div className="row-between"><b>{dn} <span className="muted small">{formatShortDate(d)}</span></b>{c.hours[dn] ? <span className="small muted">{c.hours[dn]}</span> : null}</div>
              {ss.length === 0 ? <p className="small muted" style={{ marginTop: 4 }}>—</p> : ss.map((s) => (
                <div key={s.id} className="sess" data-status={s.status} data-testid="session">
                  <div className="row-between"><span><b>{s.time}</b> {s.name} <span className="small muted">· {s.minutes} min · {s.kind === 'video' ? 'Video' : 'In person'}</span></span>{s.status !== 'scheduled' && <span className="badge">{s.status.replace('_', '-')}</span>}</div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    {s.status === 'scheduled' && <button className="btn btn-outline btn-sm" onClick={() => store.saveSession({ ...s, status: 'done' })}>Done</button>}
                    <a className="btn btn-ghost btn-sm" href={calendarUrl(s, c.profile.name, c.links.meet)} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
                    {s.kind === 'video' && c.links.meet && isValidUrl(c.links.meet) && <a className="btn btn-ghost btn-sm" href={c.links.meet} target="_blank" rel="noopener noreferrer">Video link</a>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdit(s)}>Edit</button>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <p className="small muted">“Add to Google Calendar” opens a prefilled event you confirm in Google. Automatic two-way sync needs Google sign-in, which isn’t connected yet.</p>
      {edit && <SessionSheet data={data} s={edit === 'new' ? null : edit} defaultDate={days[0] < toDateKey(new Date()) ? toDateKey(new Date()) : days[0]} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SessionSheet({ data, s, defaultDate, onClose }: { data: AppData; s: CoachSession | null; defaultDate: string; onClose: () => void }) {
  const [f, setF] = useState<Omit<CoachSession, 'id'>>(s ?? { name: '', date: defaultDate, time: '17:00', minutes: 60, kind: 'in_person', status: 'scheduled' });
  const clients = data.coach.clients.filter((x) => x.status === 'active');
  const toast = useToast();
  return (
    <Sheet title={s ? 'Edit session' : 'New session'} onClose={onClose}>
      <form className="stack-lg" onSubmit={(e) => { e.preventDefault(); store.saveSession({ ...f, id: s?.id }); toast('Session saved'); onClose(); }}>
        {clients.length > 0 && <div className="field"><label className="label" htmlFor="ss-c">Client</label><select id="ss-c" className="input" value={f.clientId ?? ''} onChange={(e) => { const cl = clients.find((x) => x.id === e.target.value); setF({ ...f, clientId: cl?.id, name: cl?.name ?? f.name }); }}><option value="">Someone else</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
        <div className="field"><label className="label" htmlFor="ss-n">Name</label><input id="ss-n" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="ss-name" /></div>
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow"><label className="label" htmlFor="ss-d">Date</label><input id="ss-d" className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="field grow"><label className="label" htmlFor="ss-t">Time</label><input id="ss-t" className="input" type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
        </div>
        <div className="field"><div className="label">Length</div><div className="chips">{[30, 45, 60, 90].map((m) => <button type="button" key={m} className="chip" aria-pressed={f.minutes === m} onClick={() => setF({ ...f, minutes: m })}>{m} min</button>)}</div></div>
        <div className="field"><div className="label">Where</div><div className="chips"><button type="button" className="chip" aria-pressed={f.kind === 'in_person'} onClick={() => setF({ ...f, kind: 'in_person' })}>In person</button><button type="button" className="chip" aria-pressed={f.kind === 'video'} onClick={() => setF({ ...f, kind: 'video' })}>Video</button></div>{f.kind === 'video' && !data.coach.links.meet && <p className="small muted">Add your video link in Setup to attach it to video sessions.</p>}</div>
        {s && <div className="field"><div className="label">Status</div><div className="chips">{(['scheduled', 'done', 'no_show', 'cancelled'] as const).map((st) => <button type="button" key={st} className="chip" aria-pressed={f.status === st} onClick={() => setF({ ...f, status: st })}>{st.replace('_', '-')}</button>)}</div></div>}
        <div className="row-between">
          {s ? <button type="button" className="btn btn-ghost" onClick={() => { store.removeSession(s.id); onClose(); }}><Icon.trash /> Delete</button> : <span />}
          <button className="btn btn-ink" disabled={!f.name.trim()} data-testid="ss-save">Save</button>
        </div>
      </form>
    </Sheet>
  );
}

export function BizPayments() {
  const data = useData();
  const c = data.coach;
  const [edit, setEdit] = useState<Payment | 'new' | null>(null);
  const toast = useToast();
  const list = [...c.payments].sort((a, b) => b.date.localeCompare(a.date));
  const m = deskMetrics(c);
  return (
    <div className="page">
      <Head title="Payments" sub="A simple log. Cards aren’t charged from the app." />
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="metric"><b data-testid="pay-due">{usd(m.due)}</b><span>due</span></div>
        <div className="metric"><b data-testid="pay-month">{usd(m.collectedMonth)}</b><span>collected this month</span></div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ink grow" onClick={() => setEdit('new')} data-testid="add-payment"><Icon.plus size={16} /> Payment</button>
        {list.length > 0 && <button className="btn btn-outline grow" onClick={async () => { try { await navigator.clipboard.writeText(paymentsCsv(data)); toast('Copied as CSV. Paste into a spreadsheet'); } catch { toast('Copy isn’t available here'); } }}>Copy CSV</button>}
      </div>
      {!list.length ? <div className="card"><p className="muted">No payments logged yet.</p></div> : (
        <div className="card"><div className="list">
          {list.map((p) => (
            <div key={p.id} className="list-row" data-testid="payment">
              <span><b>{p.payer}</b><br /><span className="small muted">{formatShortDate(p.date)} · {p.method || 'method not set'}{p.note ? ` · ${p.note}` : ''}</span></span>
              <span className="row" style={{ gap: 6 }}>
                <b className="tnum">{usd(p.amount)}</b>
                {p.status === 'due' ? <button className="btn btn-outline btn-sm" onClick={() => store.savePayment({ ...p, status: 'paid', date: toDateKey(new Date()) })} data-testid="mark-paid">Mark paid</button> : <span className="badge badge-moss">Paid</span>}
                <button className="icon-btn" aria-label={`Edit payment from ${p.payer}`} onClick={() => setEdit(p)}><Icon.more /></button>
              </span>
            </div>
          ))}
        </div></div>
      )}
      {edit && <PaymentSheet data={data} p={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PaymentSheet({ data, p, onClose }: { data: AppData; p: Payment | null; onClose: () => void }) {
  const [f, setF] = useState<Omit<Payment, 'id'>>(p ?? { payer: '', amount: 0, date: toDateKey(new Date()), method: '', status: 'paid' });
  const clients = data.coach.clients;
  return (
    <Sheet title={p ? 'Edit payment' : 'Log a payment'} onClose={onClose}>
      <form className="stack-lg" onSubmit={(e) => { e.preventDefault(); store.savePayment({ ...f, id: p?.id }); onClose(); }}>
        {clients.length > 0 && <div className="field"><label className="label" htmlFor="pm-c">Client</label><select id="pm-c" className="input" value={f.clientId ?? ''} onChange={(e) => { const cl = clients.find((x) => x.id === e.target.value); setF({ ...f, clientId: cl?.id, payer: cl?.name ?? f.payer }); }}><option value="">Someone else</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
        <div className="field"><label className="label" htmlFor="pm-p">Payer</label><input id="pm-p" className="input" required value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })} data-testid="pm-payer" /></div>
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow"><label className="label" htmlFor="pm-a">Amount ($)</label><input id="pm-a" className="input tnum" type="number" min={0} step="0.01" required value={f.amount || ''} onChange={(e) => setF({ ...f, amount: Math.max(0, Number(e.target.value)) })} data-testid="pm-amount" /></div>
          <div className="field grow"><label className="label" htmlFor="pm-d">Date</label><input id="pm-d" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        </div>
        <div className="field"><label className="label" htmlFor="pm-m">Method</label><input id="pm-m" className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} placeholder="Cash, Zelle, Cash App…" list="pm-methods" /><datalist id="pm-methods"><option>Cash</option><option>Zelle</option><option>Cash App</option><option>Venmo</option><option>Card</option></datalist></div>
        <div className="field"><div className="label">Status</div><div className="chips"><button type="button" className="chip" aria-pressed={f.status === 'paid'} onClick={() => setF({ ...f, status: 'paid' })}>Paid</button><button type="button" className="chip" aria-pressed={f.status === 'due'} onClick={() => setF({ ...f, status: 'due' })} data-testid="pm-due">Due</button></div></div>
        <div className="row-between">
          {p ? <button type="button" className="btn btn-ghost" onClick={() => { store.removePayment(p.id); onClose(); }}><Icon.trash /> Delete</button> : <span />}
          <button className="btn btn-ink" disabled={!f.payer.trim() || !(f.amount > 0)} data-testid="pm-save">Save</button>
        </div>
      </form>
    </Sheet>
  );
}

export function BizSetup({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const c = data.coach;
  const toast = useToast();
  const [prof, setProf] = useState(c.profile);
  const [hours, setHours] = useState(c.hours);
  const [links, setLinks] = useState(c.links);
  const [tiers, setTiers] = useState(c.tiers);
  const [confirmed, setConfirmed] = useState(c.tiersConfirmed);
  const [reset, setReset] = useState(false);
  const badLink = !isValidUrl(links.calendly) || !isValidUrl(links.meet);
  return (
    <div className="page">
      <Head title="Make it yours" sub="Add coach information, hours, and calendar or video links." />
      <section className="card stack-lg">
        <h2 className="eyebrow">Coach profile</h2>
        <div className="field"><label className="label" htmlFor="cp-n">Name</label><input id="cp-n" className="input" value={prof.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} data-testid="cp-name" /></div>
        <div className="field"><label className="label" htmlFor="cp-h">Headline</label><input id="cp-h" className="input" value={prof.headline} onChange={(e) => setProf({ ...prof, headline: e.target.value })} placeholder="e.g. Strength coach · 8 years" /></div>
        <div className="field"><label className="label" htmlFor="cp-b">Bio</label><textarea id="cp-b" className="textarea" value={prof.bio} onChange={(e) => setProf({ ...prof, bio: e.target.value })} /></div>
        <div className="field"><label className="label" htmlFor="cp-s">Specialties <span className="muted">(comma-separated)</span></label><input id="cp-s" className="input" value={prof.specialties} onChange={(e) => setProf({ ...prof, specialties: e.target.value })} placeholder="Strength, beginners, fat loss" /></div>
        <div className="field"><label className="label" htmlFor="cp-l">Location</label><input id="cp-l" className="input" value={prof.location} onChange={(e) => setProf({ ...prof, location: e.target.value })} /></div>
      </section>
      <section className="card stack">
        <h2 className="eyebrow">Business hours</h2>
        {DAYS.map((d) => <div key={d} className="row"><span style={{ width: 40, fontWeight: 700 }}>{d}</span><input className="input grow" aria-label={`${d} hours`} value={hours[d] ?? ''} onChange={(e) => setHours({ ...hours, [d]: e.target.value })} placeholder="Closed, or e.g. 6am–12pm" /></div>)}
      </section>
      <section className="card stack-lg">
        <h2 className="eyebrow">Links</h2>
        <div className="field"><label className="label" htmlFor="ln-c">Calendly link</label><input id="ln-c" className="input" inputMode="url" value={links.calendly} onChange={(e) => setLinks({ ...links, calendly: e.target.value.trim() })} placeholder="https://calendly.com/…" aria-invalid={!isValidUrl(links.calendly)} data-testid="ln-calendly" />{!isValidUrl(links.calendly) && <span className="small" style={{ color: 'var(--ember-deep)' }}>Use a full link starting with https://</span>}</div>
        <div className="field"><label className="label" htmlFor="ln-m">Video link (Google Meet or similar)</label><input id="ln-m" className="input" inputMode="url" value={links.meet} onChange={(e) => setLinks({ ...links, meet: e.target.value.trim() })} placeholder="https://meet.google.com/…" aria-invalid={!isValidUrl(links.meet)} /></div>
        <div className="field"><label className="label" htmlFor="ln-e">Contact email</label><input id="ln-e" className="input" type="email" value={links.email} onChange={(e) => setLinks({ ...links, email: e.target.value.trim() })} /></div>
      </section>
      <section className="card stack">
        <h2 className="eyebrow">Coaching options</h2>
        {tiers.map((t, i) => (
          <div key={t.id} className="row" style={{ gap: 8 }}>
            <span className="grow small"><b>{tierLabel(t)}</b><br /><span className="muted">4 weeks: ${fourWeek(t).toLocaleString()}</span></span>
            <label className="small" htmlFor={`tp-${t.id}`}>$/session</label>
            <input id={`tp-${t.id}`} className="input tnum" style={{ width: 90 }} type="number" min={0} value={t.pricePerSession} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, pricePerSession: Math.max(0, Number(e.target.value)) } : x)))} data-testid={`tp-${t.perWeek}`} />
          </div>
        ))}
        <label className="row small" style={{ gap: 10, minHeight: 44 }}><input type="checkbox" className="big-check" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="tiers-confirmed" /> These are my confirmed prices (removes the “draft rates” note clients see)</label>
      </section>
      <button className="btn btn-primary btn-lg" disabled={badLink} onClick={() => { store.setCoach({ profile: prof, hours, links, tiers, tiersConfirmed: confirmed }); toast('Setup saved'); }} data-testid="setup-save">Save setup</button>

      <section className="card stack">
        <h2 className="eyebrow">Privacy</h2>
        <p className="small">Prototype data stays on this device. Profile details, check-ins, meal choices and compressed progress photos are stored in this browser only. Don’t enter medical records.</p>
        <p className="small muted">A real launch needs an accessible privacy policy, secure accounts, data deletion, and consent for any connected service. Client and coach data will then be separated by account.</p>
        <button className="btn btn-danger" onClick={() => setReset(true)}>Delete all business data</button>
      </section>
      <button className="btn btn-outline" onClick={() => { store.setCoach({ viewAsCoach: false }); go('home'); }} data-testid="exit-coach">Back to client view</button>
      {reset && <ConfirmDialog danger title="Delete business data?" body="Clients, sessions, inquiries and payments are erased from this device. Your profile, hours and links stay." confirmLabel="Delete" onCancel={() => setReset(false)} onConfirm={() => { store.resetBusiness(); setReset(false); toast('Business data deleted'); }} />}
    </div>
  );
}
