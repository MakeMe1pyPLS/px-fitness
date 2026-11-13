// Collaboration add-ons for the Friends tab: train together, group challenges,
// coach & clients, combat-sports size matching and fight dates.
import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Sheet, Switch, social, useCloud, useData, useSocial, useToast } from '../components/core';
import { COMBAT_SPORTS, formatCode, normalizeCode, sizeMatches, type Challenge, type CombatInfo, type CoachLink, type TrainInvite } from '../lib/social';
import { addDays, formatShortDate, plural, toDateKey } from '../lib/dates';
import { PayCoach } from './EventsPayments';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const fmtTime = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};
const dayLabel = (d: string) => (d === toDateKey(new Date()) ? 'Today' : d === addDays(toDateKey(new Date()), 1) ? 'Tomorrow' : formatShortDate(d));

// ── requests waiting on me (train invites, challenge invites, coach clients) ──
export function ExtraRequests() {
  const s = useSocial();
  const toast = useToast();
  const me = s.me?.user_id ?? '';
  const name = (id: string) => s.people[id] ?? 'A friend';
  const train = s.invites.filter((i) => i.to_user === me && i.status === 'pending' && i.day >= toDateKey(new Date()));
  const chal = s.challenges.filter((c) => s.members.some((m) => m.challenge_id === c.id && m.user_id === me && m.status === 'invited'));
  if (!train.length && !chal.length) return null;
  const act = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok)).catch((e) => toast(errMsg(e)));
  return (
    <section className="card stack" data-testid="extra-requests">
      <h2 className="eyebrow">Waiting on you</h2>
      {train.map((i) => (
        <div key={i.id} className="stack" style={{ gap: 6 }} data-testid="train-invite">
          <p><b>{name(i.from_user)}</b> wants to train together: <b>{i.workout}</b>, {dayLabel(i.day)}{i.at_time ? ` at ${fmtTime(i.at_time)}` : ''}</p>
          {i.note && <p className="small muted">“{i.note}”</p>}
          <div className="row"><button className="btn btn-primary btn-sm" onClick={() => act(social.respondTraining(i.id, 'accepted'), 'It’s a plan')} data-testid="train-accept">I’m in</button><button className="btn btn-ghost btn-sm" onClick={() => act(social.respondTraining(i.id, 'declined'), 'Declined')}>Can’t make it</button></div>
        </div>
      ))}
      {chal.map((c) => (
        <div key={c.id} className="stack" style={{ gap: 6 }} data-testid="challenge-invite">
          <p><b>{name(c.owner)}</b> invited you to <b>{c.name}</b>: {c.goal} workouts by {formatShortDate(c.ends)}</p>
          <div className="row"><button className="btn btn-primary btn-sm" onClick={() => act(social.joinChallenge(c.id), 'You’re in the challenge')} data-testid="challenge-join">Join</button><button className="btn btn-ghost btn-sm" onClick={() => act(social.leaveChallenge(c.id), 'Declined')}>No thanks</button></div>
        </div>
      ))}
    </section>
  );
}

/** Coach tab: people asking to become this coach's clients. */
export function ClientRequests() {
  const s = useSocial();
  const toast = useToast();
  const clients = s.coachLinks.filter((l) => l.i_am === 'coach' && l.status === 'pending');
  if (!clients.length) return null;
  const act = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok)).catch((e) => toast(errMsg(e)));
  return (
    <section className="card stack" data-testid="client-requests">
      <h2 className="eyebrow">New client requests</h2>
      {clients.map((l) => (
        <div key={l.other_id} className="stack" style={{ gap: 6 }} data-testid="client-request">
          <p><b>{l.display_name ?? 'Someone'}</b> wants you as their coach.</p>
          <div className="row"><button className="btn btn-primary btn-sm" onClick={() => act(social.acceptClient(l.other_id), `${l.display_name} is now your client`)} data-testid="client-accept">Accept</button><button className="btn btn-ghost btn-sm" onClick={() => act(social.endCoachLink(l.other_id, 'coach'), 'Declined')}>Decline</button></div>
        </div>
      ))}
    </section>
  );
}

// ── train together ─────────────────────────────────────────────────────────
export function TrainTogether() {
  const s = useSocial();
  const toast = useToast();
  const [plan, setPlan] = useState(false);
  const [cancel, setCancel] = useState<TrainInvite | null>(null);
  const me = s.me?.user_id ?? '';
  const today = toDateKey(new Date());
  const upcoming = s.invites.filter((i) => i.day >= today && (i.status === 'accepted' || (i.status === 'pending' && i.from_user === me)));
  const friends = s.connections.filter((c) => c.status === 'accepted');
  if (!friends.length) return null;
  const other = (i: TrainInvite) => s.people[i.from_user === me ? i.to_user : i.from_user] ?? 'Friend';
  return (
    <section className="card stack" data-testid="train-together">
      <div className="row-between"><h2 className="eyebrow">Train together</h2><button className="btn btn-outline btn-sm" onClick={() => setPlan(true)} data-testid="plan-session">Plan a session</button></div>
      {upcoming.length === 0 ? <p className="small muted">Pick a friend, a day and a workout. When they say yes, it shows up on both your Today screens.</p> : upcoming.map((i) => (
        <div key={i.id} className="row-between" data-testid="train-item">
          <span><b>{i.workout}</b> with {other(i)}<span className="small muted" style={{ display: 'block' }}>{dayLabel(i.day)}{i.at_time ? ` · ${fmtTime(i.at_time)}` : ''}{i.status === 'pending' ? ' · waiting for a reply' : ''}</span></span>
          <button className="btn btn-ghost btn-sm" onClick={() => setCancel(i)}>Cancel</button>
        </div>
      ))}
      {plan && <PlanSessionSheet onClose={() => setPlan(false)} />}
      {cancel && <ConfirmDialog title="Cancel this session?" body={`${other(cancel)} will see it’s off.`} confirmLabel="Cancel session" onCancel={() => setCancel(null)} onConfirm={() => { const i = cancel; setCancel(null); social.respondTraining(i.id, 'cancelled').then(() => toast('Session cancelled')).catch((e) => toast(errMsg(e))); }} />}
    </section>
  );
}

function PlanSessionSheet({ onClose }: { onClose: () => void }) {
  const s = useSocial();
  const data = useData();
  const toast = useToast();
  const friends = s.connections.filter((c) => c.status === 'accepted');
  const [f, setF] = useState({ friend: friends[0]?.user_id ?? '', day: addDays(toDateKey(new Date()), 1), time: '18:00', workout: data.templates[0]?.name ?? '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet title="Plan a session together" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (f.day < toDateKey(new Date())) return setErr('Pick today or a later day.');
        setBusy(true);
        try { await social.proposeTraining(f.friend, f.day, f.time, f.workout, f.note); toast(`Invite sent to ${s.people[f.friend] ?? 'your friend'}`); onClose(); } catch (e2) { setErr(errMsg(e2)); }
        setBusy(false);
      }}>
        <div className="field"><label className="label" htmlFor="pt-f">With</label><select id="pt-f" className="input" value={f.friend} onChange={(e) => setF({ ...f, friend: e.target.value })} data-testid="pt-friend">{friends.map((x) => <option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select></div>
        <div className="row">
          <div className="field grow"><label className="label" htmlFor="pt-d">Day</label><input id="pt-d" className="input" type="date" min={toDateKey(new Date())} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} data-testid="pt-day" /></div>
          <div className="field grow"><label className="label" htmlFor="pt-t">Time</label><input id="pt-t" className="input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
        </div>
        <div className="field"><label className="label" htmlFor="pt-w">Workout</label><input id="pt-w" className="input" list="pt-wl" maxLength={80} value={f.workout} onChange={(e) => setF({ ...f, workout: e.target.value })} data-testid="pt-workout" /><datalist id="pt-wl">{data.templates.map((t) => <option key={t.id} value={t.name} />)}</datalist></div>
        <div className="field"><label className="label" htmlFor="pt-n">Note (optional)</label><input id="pt-n" className="input" maxLength={200} placeholder="e.g. Meet at the gym on 5th St" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !f.friend || !f.workout.trim()} data-testid="pt-send">{busy ? 'Sending…' : 'Send invite'}</button>
      </form>
    </Sheet>
  );
}

/** On the Today screen: a session with a friend planned for today. */
export function TrainTodayCard() {
  const c = useCloud();
  const s = useSocial();
  useEffect(() => { if (c.enabled && c.session && !s.loaded && !s.loading) void social.load(); }, [c.enabled, c.session, s.loaded, s.loading]);
  const me = s.me?.user_id;
  const today = toDateKey(new Date());
  const items = s.invites.filter((i) => i.day === today && i.status === 'accepted');
  if (!c.enabled || !me || !items.length) return null;
  return (
    <section className="card card-ink stack" data-testid="train-today">
      <h2 className="eyebrow" style={{ color: 'inherit', opacity: 0.8 }}>Training together today</h2>
      {items.map((i) => <p key={i.id}><b>{i.workout}</b> with {s.people[i.from_user === me ? i.to_user : i.from_user] ?? 'a friend'}{i.at_time ? ` at ${fmtTime(i.at_time)}` : ''}</p>)}
    </section>
  );
}

// ── challenges ─────────────────────────────────────────────────────────────
export function Challenges() {
  const s = useSocial();
  const [create, setCreate] = useState(false);
  const [leave, setLeave] = useState<Challenge | null>(null);
  const toast = useToast();
  const me = s.me?.user_id ?? '';
  const mine = s.challenges.filter((c) => s.members.some((m) => m.challenge_id === c.id && m.user_id === me && m.status === 'joined'));
  if (!s.connections.some((c) => c.status === 'accepted') && !mine.length) return null;
  return (
    <section className="card stack" data-testid="challenges">
      <div className="row-between"><h2 className="eyebrow">Challenges</h2><button className="btn btn-outline btn-sm" onClick={() => setCreate(true)} data-testid="new-challenge">Start one</button></div>
      {mine.length === 0 && <p className="small muted">Set a group goal, like 12 workouts this month, and see everyone’s progress.</p>}
      {mine.map((c) => {
        const ms = s.members.filter((m) => m.challenge_id === c.id && m.status === 'joined').sort((a, b) => b.progress - a.progress);
        const invited = s.members.filter((m) => m.challenge_id === c.id && m.status === 'invited').length;
        const over = c.ends < toDateKey(new Date());
        return (
          <article key={c.id} className="stack" style={{ gap: 8 }} data-testid="challenge">
            <div className="row-between"><b>{c.name}</b><span className="small muted">{over ? 'Ended' : `Ends ${formatShortDate(c.ends)}`}</span></div>
            {ms.map((m) => {
              const pct = Math.min(100, Math.round((m.progress / c.goal) * 100));
              return (
                <div key={m.user_id} className="ch-row">
                  <span className="small">{m.user_id === me ? 'You' : s.people[m.user_id] ?? 'Member'}</span>
                  <span className="ch-bar" role="progressbar" aria-valuemin={0} aria-valuemax={c.goal} aria-valuenow={m.progress} aria-label={`${m.user_id === me ? 'Your' : `${s.people[m.user_id]}’s`} progress`}><span style={{ width: `${pct}%` }} /></span>
                  <span className="small tnum">{m.progress}/{c.goal}</span>
                </div>
              );
            })}
            {invited > 0 && <p className="small muted">{invited} invited, not joined yet</p>}
            <button className="link-btn link-quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => setLeave(c)}>{c.owner === me ? 'End challenge' : 'Leave'}</button>
          </article>
        );
      })}
      <p className="small muted">Progress counts finished workouts between the start and end dates.</p>
      {create && <ChallengeSheet onClose={() => setCreate(false)} />}
      {leave && <ConfirmDialog danger title={leave.owner === me ? 'End this challenge?' : 'Leave this challenge?'} body={leave.owner === me ? 'It’s removed for everyone.' : 'Your progress is removed from it.'} confirmLabel={leave.owner === me ? 'End it' : 'Leave'} onCancel={() => setLeave(null)} onConfirm={() => { const c = leave; setLeave(null); social.leaveChallenge(c.id).then(() => toast('Done')).catch((e) => toast(errMsg(e))); }} />}
    </section>
  );
}

function ChallengeSheet({ onClose }: { onClose: () => void }) {
  const s = useSocial();
  const toast = useToast();
  const today = toDateKey(new Date());
  const friends = s.connections.filter((c) => c.status === 'accepted');
  const [f, setF] = useState({ name: '12 workouts this month', goal: 12, starts: today, ends: addDays(today, 29), invite: friends.map((x) => x.user_id) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string) => setF({ ...f, invite: f.invite.includes(id) ? f.invite.filter((x) => x !== id) : [...f.invite, id] });
  return (
    <Sheet title="Start a challenge" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try { await social.createChallenge(f.name, f.goal, f.starts, f.ends, f.invite); toast(f.invite.length ? 'Challenge started. Invites sent.' : 'Challenge started'); onClose(); } catch (e2) { setErr(errMsg(e2)); }
        setBusy(false);
      }}>
        <div className="field"><label className="label" htmlFor="ch-n">Name</label><input id="ch-n" className="input" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="ch-name" /></div>
        <div className="field"><label className="label" htmlFor="ch-g">Goal (finished workouts)</label><input id="ch-g" className="input" type="number" inputMode="numeric" min={1} max={200} value={f.goal} onChange={(e) => setF({ ...f, goal: Number(e.target.value) })} data-testid="ch-goal" /></div>
        <div className="row">
          <div className="field grow"><label className="label" htmlFor="ch-s">Starts</label><input id="ch-s" className="input" type="date" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
          <div className="field grow"><label className="label" htmlFor="ch-e">Ends</label><input id="ch-e" className="input" type="date" value={f.ends} min={f.starts} onChange={(e) => setF({ ...f, ends: e.target.value })} /></div>
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
          <legend className="label">Invite</legend>
          {friends.map((x) => <label key={x.user_id} className="check-row"><input type="checkbox" checked={f.invite.includes(x.user_id)} onChange={() => toggle(x.user_id)} /> {x.display_name}</label>)}
        </fieldset>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy} data-testid="ch-create">{busy ? 'Starting…' : 'Start challenge'}</button>
      </form>
    </Sheet>
  );
}

// ── coach & clients ────────────────────────────────────────────────────────
export function CoachSection() {
  const s = useSocial();
  const toast = useToast();
  const [connect, setConnect] = useState(false);
  const [open, setOpen] = useState<CoachLink | null>(null);
  const [drop, setDrop] = useState<CoachLink | null>(null);
  const me = s.me!;
  const coaches = s.coachLinks.filter((l) => l.i_am === 'client');
  const clients = s.coachLinks.filter((l) => l.i_am === 'coach' && l.status === 'accepted');
  const notesFor = (coach: string) => s.notes.filter((n) => n.coach_id === coach && n.client_id === me.user_id);
  return (
    <section className="card stack" data-testid="coach-section">
      <h2 className="eyebrow">Coach</h2>
      {coaches.length === 0 ? (
        <>
          <p className="small muted">Working with a coach on PX-Fitness? Connect with their code so they can see your workouts and leave you notes.</p>
          <button className="btn btn-outline" onClick={() => setConnect(true)} data-testid="connect-coach">Connect my coach</button>
        </>
      ) : coaches.map((l) => (
        <div key={l.other_id} className="stack" style={{ gap: 8 }} data-testid="my-coach">
          <div className="row-between"><b>{l.display_name ?? 'Your coach'}</b><span className="badge">{l.status === 'accepted' ? 'Connected' : 'Waiting to accept'}</span></div>
          {l.status === 'accepted' && (
            <>
              <p className="small muted">Your coach sees your recent workouts.</p>
              <div className="setting-row"><div><b>Share check-ins</b><p className="small muted">Mood, energy, sleep, stress and soreness numbers from the last 2 weeks. Never your notes.</p></div><Switch label="Share check-ins with my coach" checked={l.share_checkins} onChange={(v) => social.setCoachCheckins(l.other_id, v).then(() => toast(v ? 'Check-ins shared with your coach' : 'Check-ins private again')).catch((e) => toast(errMsg(e)))} /></div>
              <PayCoach coachId={l.other_id} />
              {notesFor(l.other_id).length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <b className="small">Notes from your coach</b>
                  {notesFor(l.other_id).slice(0, 5).map((n) => <p key={n.id} className="note-bubble" data-testid="coach-note">{n.body}<span className="small muted" style={{ display: 'block' }}>{new Date(n.created_at).toLocaleDateString()}</span></p>)}
                </div>
              )}
            </>
          )}
          <button className="link-btn link-quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => setDrop(l)} data-testid="disconnect-coach">Disconnect</button>
        </div>
      ))}

      <div className="setting-row"><div><b>I’m a coach</b><p className="small muted">Clients can connect to you with your friend code.</p></div><Switch label="Coach mode" checked={!!me.is_coach} onChange={(v) => social.setCoachMode(v).then(() => toast(v ? 'Coach mode on' : 'Coach mode off')).catch((e) => toast(errMsg(e)))} /></div>
      {me.is_coach && (
        <div className="stack" style={{ gap: 6 }} data-testid="my-clients">
          <b className="small">Your clients · {clients.length}</b>
          {clients.length === 0 && <p className="small muted">Share your code <b className="tnum">{formatCode(me.friend_code ?? '')}</b> with clients so they can connect.</p>}
          {clients.map((l) => <button key={l.other_id} className="friend-row friend-btn" onClick={() => setOpen(l)} data-testid="client"><b className="grow" style={{ textAlign: 'left' }}>{l.display_name}</b><span className="small muted">{l.client_shared.recent?.[0] ? `Last: ${formatShortDate(l.client_shared.recent[0].date)}` : 'No workouts yet'}</span></button>)}
        </div>
      )}
      {connect && <ConnectCoachSheet onClose={() => setConnect(false)} />}
      {drop && <ConfirmDialog title={`Disconnect from ${drop.display_name ?? 'your coach'}?`} body="They’ll stop seeing your workouts and check-ins. Past payments and notes aren’t affected." confirmLabel="Disconnect" onCancel={() => setDrop(null)} onConfirm={() => { const l = drop; setDrop(null); social.endCoachLink(l.other_id, 'client').then(() => toast('Coach disconnected')).catch((e) => toast(errMsg(e))); }} />}
      {open && <ClientSheet link={s.coachLinks.find((x) => x.other_id === open.other_id && x.i_am === 'coach') ?? open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ConnectCoachSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet title="Connect your coach" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try { const r = await social.connectCoach(code); toast(r.status === 'accepted' ? `Connected to ${r.name}` : `Request sent to ${r.name}`); onClose(); } catch (e2) { setErr(errMsg(e2)); }
        setBusy(false);
      }}>
        <div className="field"><label className="label" htmlFor="cc-code">Your coach’s code</label><input id="cc-code" className="input code-input" placeholder="ABCD-2345" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} onChange={(e) => { const n = normalizeCode(e.target.value); setCode(n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4)}` : n); }} data-testid="coach-code" /></div>
        <p className="small muted">Once they accept, they’ll see your recent workouts. Check-ins stay private unless you switch them on.</p>
        {err && <p className="form-error" role="alert" data-testid="coach-error">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || normalizeCode(code).length !== 8} data-testid="coach-send">{busy ? 'Sending…' : 'Send request'}</button>
      </form>
    </Sheet>
  );
}

function ClientSheet({ link, onClose }: { link: CoachLink; onClose: () => void }) {
  const s = useSocial();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const notes = s.notes.filter((n) => n.client_id === link.other_id);
  const recent = link.client_shared.recent ?? [];
  const ck = link.client_shared.checkins ?? [];
  return (
    <Sheet title={link.display_name ?? 'Client'} onClose={onClose} label={`${link.display_name}’s training`}>
      <div className="stack-lg" data-testid="client-sheet">
        <section className="stack">
          <h3 className="eyebrow">Recent workouts</h3>
          {recent.length === 0 ? <p className="small muted">No finished workouts yet.</p> : recent.slice(0, 8).map((w) => <p key={w.id} className="small"><b>{w.name}</b> <span className="muted">· {formatShortDate(w.date)}{w.minutes ? ` · ${w.minutes} min` : ''}{w.short ? ' · short' : ''} · {plural(w.sets, 'set')}</span></p>)}
        </section>
        {(link.client_shared.skills?.length ?? 0) > 0 && (
          <section className="stack" data-testid="client-skills">
            <h3 className="eyebrow">PX Boot Camp levels</h3>
            {link.client_shared.skills!.map((k) => <p key={k.id} className="small"><b>{k.ladder}</b> <span className="muted">· Level {k.level}/{k.of}: {k.name}</span></p>)}
          </section>
        )}
        {(link.client_shared.upcoming?.length ?? 0) > 0 && (
          <section className="stack" data-testid="client-upcoming">
            <h3 className="eyebrow">Coming up</h3>
            {link.client_shared.upcoming!.map((u, i) => <p key={i} className="small"><b>{u.label || u.kind}</b> <span className="muted">· {formatShortDate(u.date)}{u.endDate ? `–${formatShortDate(u.endDate)}` : ''}</span></p>)}
          </section>
        )}
        <section className="stack">
          <h3 className="eyebrow">Check-ins</h3>
          {!link.share_checkins ? <p className="small muted">{link.display_name} keeps check-ins private.</p> : ck.length === 0 ? <p className="small muted">No check-ins in the last 2 weeks.</p> : (
            <table className="mini-table" data-testid="client-checkins">
              <thead><tr><th>Day</th><th>Mood</th><th>Energy</th><th>Sleep</th><th>Sore</th></tr></thead>
              <tbody>{ck.slice(0, 7).map((c) => <tr key={c.date}><td>{formatShortDate(c.date)}</td><td>{c.mood ?? '–'}</td><td>{c.energy ?? '–'}</td><td>{c.sleepHours != null ? `${c.sleepHours} h` : '–'}</td><td>{c.soreness ?? '–'}</td></tr>)}</tbody>
            </table>
          )}
        </section>
        <section className="stack">
          <h3 className="eyebrow">Notes</h3>
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await social.addNote(link.other_id, note); setNote(''); toast('Note sent'); } catch (e2) { toast(errMsg(e2)); } setBusy(false); }}>
            <label className="label" htmlFor="cn-b">Write a note {link.display_name} will see</label>
            <textarea id="cn-b" className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="note-body" />
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || !note.trim()} data-testid="note-send">Send note</button>
          </form>
          {notes.map((n) => <div key={n.id} className="row-between note-bubble"><span>{n.body}<span className="small muted" style={{ display: 'block' }}>{new Date(n.created_at).toLocaleDateString()}</span></span><button className="btn btn-ghost btn-sm" aria-label="Delete note" onClick={() => social.deleteNote(n.id).catch((e) => toast(errMsg(e)))}>Delete</button></div>)}
        </section>
        <button className="btn btn-ghost" onClick={() => social.endCoachLink(link.other_id, 'coach').then(() => { toast('Client removed'); onClose(); }).catch((e) => toast(errMsg(e)))}>Remove client</button>
      </div>
    </Sheet>
  );
}

// ── combat sports ──────────────────────────────────────────────────────────
export function CombatCard() {
  const s = useSocial();
  const data = useData();
  const toast = useToast();
  const me = s.me!;
  const cur = me.shared?.combat;
  const n = data.nutrition?.prefs;
  const lc = data.combat; // fight camp profile on this device
  const [f, setF] = useState<CombatInfo>(() => ({ sport: cur?.sport ?? lc?.sport ?? '', heightCm: cur?.heightCm ?? lc?.heightCm ?? n?.heightCm, weightKg: cur?.weightKg ?? lc?.weightKg ?? n?.weightKg, fightDate: cur?.fightDate ?? lc?.fightDate ?? '', fightName: cur?.fightName ?? lc?.fightName ?? '' }));
  const [busy, setBusy] = useState(false);
  const matches = useMemo(() => sizeMatches(me.share_combat ? cur : undefined, s.friends), [me.share_combat, cur, s.friends]);
  const imperial = (data.profile?.unit ?? 'lb') === 'lb';
  const totalIn = f.heightCm ? Math.round(f.heightCm / 2.54) : null;
  const [ftIn, setFtIn] = useState(() => ({ ft: totalIn ? String(Math.floor(totalIn / 12)) : '', inch: totalIn ? String(totalIn % 12) : '' }));
  const setHeightImp = (ft: string, inch: string) => {
    setFtIn({ ft, inch });
    const inches = (Number(ft) || 0) * 12 + (Number(inch) || 0);
    setF({ ...f, heightCm: inches ? inches * 2.54 : undefined });
  };
  const save = async (share: boolean) => {
    setBusy(true);
    try { await social.setCombat(f.sport ? f : null, share && !!f.sport); toast(share ? 'Shared with friends' : 'Saved, kept private'); } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };
  return (
    <section className="card stack" data-testid="combat-card">
      <h2 className="eyebrow">Combat sports</h2>
      <p className="small muted">Share your sport, size and next fight with friends. Friends close to your size in the same sport show up as possible training partners.</p>
      <div className="field"><label className="label" htmlFor="cb-s">Sport</label><select id="cb-s" className="input" value={f.sport} onChange={(e) => setF({ ...f, sport: e.target.value })} data-testid="cb-sport"><option value="">I don’t do combat sports</option>{COMBAT_SPORTS.map((x) => <option key={x}>{x}</option>)}</select></div>
      {f.sport && (
        <>
          {imperial ? (
            <div className="row">
              <div className="field grow"><label className="label" htmlFor="cb-ft">Height (ft / in)</label>
                <div className="row" style={{ gap: 6 }}>
                  <input id="cb-ft" className="input" type="number" inputMode="numeric" min={4} max={7} aria-label="Feet" placeholder="ft" value={ftIn.ft} onChange={(e) => setHeightImp(e.target.value, ftIn.inch)} data-testid="cb-feet" />
                  <input className="input" type="number" inputMode="numeric" min={0} max={11} aria-label="Inches" placeholder="in" value={ftIn.inch} onChange={(e) => setHeightImp(ftIn.ft, e.target.value)} data-testid="cb-inches" />
                </div>
              </div>
              <div className="field grow"><label className="label" htmlFor="cb-lb">Weight (lb)</label><input id="cb-lb" className="input" type="number" inputMode="decimal" min={80} max={550} value={f.weightKg ? Math.round(f.weightKg * 2.20462) : ''} onChange={(e) => setF({ ...f, weightKg: e.target.value ? Number(e.target.value) / 2.20462 : undefined })} data-testid="cb-pounds" /></div>
            </div>
          ) : (
            <div className="row">
              <div className="field grow"><label className="label" htmlFor="cb-h">Height (cm)</label><input id="cb-h" className="input" type="number" inputMode="numeric" min={120} max={230} value={f.heightCm ?? ''} onChange={(e) => setF({ ...f, heightCm: e.target.value ? Number(e.target.value) : undefined })} data-testid="cb-height" /></div>
              <div className="field grow"><label className="label" htmlFor="cb-w">Weight (kg)</label><input id="cb-w" className="input" type="number" inputMode="decimal" min={35} max={250} step="0.1" value={f.weightKg ?? ''} onChange={(e) => setF({ ...f, weightKg: e.target.value ? Number(e.target.value) : undefined })} data-testid="cb-weight" /></div>
            </div>
          )}
          <div className="stack" style={{ gap: 'var(--s-3, 12px)' }}>
            <div className="field grow"><label className="label" htmlFor="cb-d">Next fight</label><input id="cb-d" className="input" type="date" min={toDateKey(new Date())} value={f.fightDate ?? ''} onChange={(e) => setF({ ...f, fightDate: e.target.value })} data-testid="cb-date" /></div>
            <div className="field grow"><label className="label" htmlFor="cb-n">Event name</label><input id="cb-n" className="input" maxLength={60} placeholder="Optional" value={f.fightName ?? ''} onChange={(e) => setF({ ...f, fightName: e.target.value })} data-testid="cb-event" /></div>
          </div>
          <div className="row"><button className="btn btn-primary grow" disabled={busy} onClick={() => save(true)} data-testid="cb-share">{me.share_combat ? 'Update' : 'Share with friends'}</button>{me.share_combat && <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)} data-testid="cb-unshare">Stop sharing</button>}</div>
          {me.share_combat && matches.length > 0 && <p className="small" data-testid="size-matches"><b>Close to your size:</b> {matches.map((id) => s.friends[id]?.display_name).join(', ')}</p>}
        </>
      )}
      {!f.sport && me.share_combat && <button className="btn btn-ghost" onClick={() => save(false)}>Stop sharing</button>}
    </section>
  );
}

/** Small badge in the friend list. */
export function SizeMatchBadge({ friendId }: { friendId: string }) {
  const s = useSocial();
  const me = s.me;
  if (!me?.share_combat) return null;
  return sizeMatches(me.shared?.combat, s.friends).includes(friendId) ? <span className="badge" data-testid="size-badge">Similar size</span> : null;
}
