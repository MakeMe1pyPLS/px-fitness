import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Icon, Sheet, Switch, social, useCloud, useData, useSocial, useToast, type Route } from '../components/core';
import { AuthSheet } from '../components/Account';
import { photos as localPhotos } from '../components/PhotosMilestones';
import { buildFeed, formatCode, normalizeCode, type FeedItem, type SharedPhoto, type SocialProfile } from '../lib/social';
import { formatShortDate } from '../lib/dates';
import type { ProgressPhoto } from '../lib/types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const INVITE_KEY = 'px:invite';
export const takeInvite = () => { try { const c = sessionStorage.getItem(INVITE_KEY); sessionStorage.removeItem(INVITE_KEY); return c; } catch { return null; } };
export const stashInvite = (c: string) => { try { sessionStorage.setItem(INVITE_KEY, c); } catch { /* ignore */ } };

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return <span className="avatar" aria-hidden style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 35% 26%)` }}>{name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

function RemotePhoto({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; social.photoUrl(path).then((u) => live && setSrc(u)).catch(() => live && setFailed(true)); return () => { live = false; }; }, [path]);
  if (failed) return <span className={'photo-missing ' + (className ?? '')}>Photo unavailable</span>;
  return src ? <img src={src} alt={alt} className={className} /> : <span className={'photo-loading ' + (className ?? '')} aria-label="Loading photo" />;
}

function CheerButton({ to, target, label }: { to: string; target: string; label: string }) {
  const s = useSocial();
  const toast = useToast();
  const on = social.cheered(to, target);
  void s;
  return (
    <button className={'cheer' + (on ? ' on' : '')} aria-pressed={on} aria-label={on ? `Remove cheer for ${label}` : `Cheer ${label}`} data-testid="cheer"
      onClick={() => social.toggleCheer(to, target).catch((e) => toast(errMsg(e)))}>
      <Icon.bolt size={16} />{on ? 'Cheered' : 'Cheer'}
    </button>
  );
}

// ── entry ───────────────────────────────────────────────────────────────────
export function Friends({ go }: { go: (r: Route) => void }) {
  const c = useCloud();
  const s = useSocial();
  const [auth, setAuth] = useState<null | 'signin' | 'signup'>(null);

  useEffect(() => { if (c.session && !s.loaded && !s.loading) void social.load(); }, [c.session, s.loaded, s.loading]);

  if (!c.enabled) return <div className="page"><header className="page-head"><h1 className="page-title display">Friends</h1></header><p className="muted">Friends isn’t switched on yet.</p></div>;

  if (!c.session) return (
    <div className="page">
      <header className="page-head"><h1 className="page-title display">Friends</h1></header>
      <section className="card card-ink stack" data-testid="friends-signedout">
        <h2 className="title">Train with your people</h2>
        <p>Add friends with a private code, cheer each other’s workouts, and see the routines and photos they choose to share.</p>
        <p className="small" style={{ opacity: 0.8 }}>You need a free account so your friends can find what you share.</p>
        <div className="row"><button className="btn btn-primary grow" onClick={() => setAuth('signup')} data-testid="friends-signup">Create account</button><button className="btn btn-outline grow" onClick={() => setAuth('signin')}>Sign in</button></div>
      </section>
      {auth && <AuthSheet initial={auth} onClose={() => setAuth(null)} />}
    </div>
  );

  if (!s.loaded) return <div className="page"><header className="page-head"><h1 className="page-title display">Friends</h1></header><p className="muted" role="status">Loading…</p></div>;
  if (s.error && !s.me) return (
    <div className="page"><header className="page-head"><h1 className="page-title display">Friends</h1></header>
      <section className="card stack"><p>{s.error}</p><button className="btn btn-outline" onClick={() => social.load()}>Try again</button></section></div>
  );
  if (!s.me) return <FriendsSetup />;
  return <FriendsHome go={go} />;
}

// ── first-time setup ────────────────────────────────────────────────────────
function FriendsSetup() {
  const data = useData();
  const toast = useToast();
  const [name, setName] = useState(data.profile?.name ?? '');
  const [routine, setRoutine] = useState(false);
  const [workouts, setWorkouts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="page">
      <header className="page-head"><h1 className="page-title display">Friends</h1></header>
      <form className="card stack" data-testid="friends-setup" onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try { await social.createProfile(name, routine, workouts); toast('You’re set up. Share your code to add friends.'); }
        catch (e2) { setErr(errMsg(e2)); }
        setBusy(false);
      }}>
        <h2 className="title">Set up your Friends profile</h2>
        <div className="field">
          <label className="label" htmlFor="fr-name">Name friends will see</label>
          <input id="fr-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-testid="friends-name" placeholder="e.g. Sam" />
        </div>
        <p className="small muted">Nobody can search for you. People only see you after you share your private code and accept each other.</p>
        <b className="small">What friends can see</b>
        <div className="setting-row"><div><b>My plan</b><p className="small muted">Workout names and exercises. No weights.</p></div><Switch label="Share my plan" checked={routine} onChange={setRoutine} /></div>
        <div className="setting-row"><div><b>My workouts</b><p className="small muted">What you finished, when, and for how long.</p></div><Switch label="Share my workouts" checked={workouts} onChange={setWorkouts} /></div>
        <p className="small muted">Photos are shared one at a time, only the ones you pick. Check-ins, mood, sleep, notes and meals are never shared.</p>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !name.trim()} data-testid="friends-create">{busy ? 'Setting up…' : 'Continue'}</button>
      </form>
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
function FriendsHome({ go }: { go: (r: Route) => void }) {
  const s = useSocial();
  const toast = useToast();
  const me = s.me!;
  const myId = me.user_id;
  const [add, setAdd] = useState<string | null>(() => takeInvite());
  const [open, setOpen] = useState<SocialProfile | null>(null);
  const [share, setShare] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<SharedPhoto | null>(null);
  const incoming = s.connections.filter((x) => x.status === 'pending' && x.incoming);
  const outgoing = s.connections.filter((x) => x.status === 'pending' && !x.incoming);
  const friends = s.connections.filter((x) => x.status === 'accepted');
  const feed = useMemo(() => buildFeed(s.friends, s.photos), [s.friends, s.photos]);
  const nameOf = (id: string) => s.friends[id]?.display_name ?? s.connections.find((x) => x.user_id === id)?.display_name ?? 'A friend';
  const received = s.cheers.filter((x) => x.to_user === myId).slice(0, 5);
  const myPhotos = s.photos.filter((p) => p.user_id === myId);

  const describeTarget = (t: string) => {
    if (t.startsWith('w:')) return me.shared?.recent?.find((w) => `w:${w.id}` === t)?.name ?? 'a workout';
    if (t.startsWith('p:')) return 'your photo';
    return 'your progress';
  };

  return (
    <div className="page">
      <header className="page-head row-between">
        <h1 className="page-title display">Friends</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setAdd('')} data-testid="add-friend"><Icon.plus size={16} /> Add</button>
      </header>

      {incoming.length > 0 && (
        <section className="card stack" data-testid="requests">
          <h2 className="eyebrow">Friend requests</h2>
          {incoming.map((r) => (
            <div key={r.user_id} className="friend-row">
              <Avatar name={r.display_name ?? '?'} />
              <b className="grow">{r.display_name ?? 'Someone'}</b>
              <button className="btn btn-primary btn-sm" onClick={() => social.accept(r.user_id).then(() => toast(`You and ${r.display_name} are friends`)).catch((e) => toast(errMsg(e)))} data-testid="accept">Accept</button>
              <button className="btn btn-ghost btn-sm" onClick={() => social.remove(r.user_id).catch((e) => toast(errMsg(e)))}>Decline</button>
            </div>
          ))}
        </section>
      )}

      {friends.length === 0 ? (
        <section className="card card-ink stack" data-testid="invite-card">
          <h2 className="title">Bring a friend</h2>
          <p>Send your code to a friend. Once you both accept, you can cheer each other on and see what you each share.</p>
          <CodeBox code={me.friend_code ?? ''} />
        </section>
      ) : (
        <section className="stack" aria-labelledby="feed-h">
          <h2 id="feed-h" className="eyebrow">Activity</h2>
          {feed.length === 0 && <p className="small muted card">Nothing shared yet. When friends share workouts or photos, they show up here.</p>}
          {feed.map((it) => <FeedCard key={it.user + it.key} it={it} onPhoto={setViewPhoto} onOpen={() => setOpen(s.friends[it.user] ?? null)} />)}
        </section>
      )}

      {received.length > 0 && (
        <section className="card stack">
          <h2 className="eyebrow">Cheers for you</h2>
          {received.map((r) => <p key={r.from_user + r.target} className="small"><b>{nameOf(r.from_user)}</b> cheered {describeTarget(r.target)}</p>)}
        </section>
      )}

      {friends.length > 0 && (
        <section className="card stack" data-testid="friend-list">
          <h2 className="eyebrow">Your friends · {friends.length}</h2>
          {friends.map((f) => (
            <button key={f.user_id} className="friend-row friend-btn" onClick={() => setOpen(s.friends[f.user_id] ?? { user_id: f.user_id, display_name: f.display_name ?? 'Friend', share_routine: false, share_workouts: false, shared: {}, updated_at: '' })} data-testid="friend">
              <Avatar name={f.display_name ?? '?'} />
              <span className="grow" style={{ textAlign: 'left' }}><b>{f.display_name}</b><span className="small muted" style={{ display: 'block' }}>{sharingSummary(s.friends[f.user_id], s.photos.filter((p) => p.user_id === f.user_id).length)}</span></span>
              <Icon.arrow size={18} />
            </button>
          ))}
          {outgoing.map((o) => (
            <div key={o.user_id} className="friend-row">
              <Avatar name={o.display_name ?? '?'} />
              <span className="grow"><b>{o.display_name}</b><span className="small muted" style={{ display: 'block' }}>Request sent</span></span>
              <button className="btn btn-ghost btn-sm" onClick={() => social.remove(o.user_id).catch((e) => toast(errMsg(e)))}>Cancel</button>
            </div>
          ))}
        </section>
      )}
      {friends.length === 0 && outgoing.length > 0 && (
        <section className="card stack">
          <h2 className="eyebrow">Waiting on</h2>
          {outgoing.map((o) => <div key={o.user_id} className="friend-row"><Avatar name={o.display_name ?? '?'} /><b className="grow">{o.display_name}</b><button className="btn btn-ghost btn-sm" onClick={() => social.remove(o.user_id).catch((e) => toast(errMsg(e)))}>Cancel</button></div>)}
        </section>
      )}

      <section className="card stack" data-testid="my-sharing">
        <h2 className="eyebrow">What you share</h2>
        <div className="friend-row"><Avatar name={me.display_name} /><b className="grow">{me.display_name}</b><button className="btn btn-ghost btn-sm" onClick={() => setShare(true)} data-testid="edit-sharing">Edit</button></div>
        <div className="list small">
          <div className="list-row"><span className="muted">Plan</span><b>{me.share_routine ? 'Shared' : 'Private'}</b></div>
          <div className="list-row"><span className="muted">Workouts</span><b>{me.share_workouts ? 'Shared' : 'Private'}</b></div>
          <div className="list-row"><span className="muted">Photos</span><b>{myPhotos.length ? `${myPhotos.length} shared` : 'None shared'}</b></div>
        </div>
        <button className="btn btn-outline" onClick={() => setShare(true)} data-testid="choose-photos">Choose photos to share</button>
        {friends.length > 0 && <><b className="small">Your friend code</b><CodeBox code={me.friend_code ?? ''} /></>}
        <p className="small muted">Check-ins, mood, sleep, notes and meals are never shared. Removing a friend ends their access right away.</p>
      </section>

      {add !== null && <AddFriendSheet initial={add} onClose={() => setAdd(null)} />}
      {open && <FriendSheet friend={open} onClose={() => setOpen(null)} />}
      {share && <SharingSheet onClose={() => setShare(false)} go={go} />}
      {viewPhoto && (
        <Sheet title={`${nameOf(viewPhoto.user_id)} · ${formatShortDate(viewPhoto.taken_on)}`} onClose={() => setViewPhoto(null)}>
          <RemotePhoto path={viewPhoto.path} alt={`Photo shared by ${nameOf(viewPhoto.user_id)}`} className="photo-full" />
          {viewPhoto.caption && <p style={{ marginTop: 10 }}>{viewPhoto.caption}</p>}
          <div style={{ marginTop: 12 }}><CheerButton to={viewPhoto.user_id} target={`p:${viewPhoto.id}`} label="this photo" /></div>
        </Sheet>
      )}
    </div>
  );
}

function sharingSummary(p: SocialProfile | undefined, photoCount: number) {
  const parts = [p?.share_routine && 'plan', p?.share_workouts && 'workouts', photoCount ? `${photoCount} photo${photoCount > 1 ? 's' : ''}` : ''].filter(Boolean);
  return parts.length ? `Shares ${parts.join(', ')}` : 'Not sharing anything yet';
}

function FeedCard({ it, onPhoto, onOpen }: { it: FeedItem; onPhoto: (p: SharedPhoto) => void; onOpen: () => void }) {
  return (
    <article className="card feed-card" data-testid="feed-item">
      <button className="friend-row friend-btn" onClick={onOpen} aria-label={`Open ${it.name}`}>
        <Avatar name={it.name} size={34} />
        <span className="grow" style={{ textAlign: 'left' }}><b>{it.name}</b> <span className="small muted">· {formatShortDate(it.date)}</span></span>
      </button>
      {it.kind === 'workout' ? (
        <div className="stack" style={{ gap: 4 }}>
          <p><b>Finished {it.workout.name}</b>{it.workout.short ? ' (short version)' : ''}</p>
          <p className="small muted">{[it.workout.minutes ? `${it.workout.minutes} min` : null, `${it.workout.sets} set${it.workout.sets === 1 ? "" : "s"}`, it.workout.exercises.slice(0, 4).join(', ') + (it.workout.exercises.length > 4 ? '…' : '')].filter(Boolean).join(' · ')}</p>
        </div>
      ) : (
        <button className="feed-photo" onClick={() => onPhoto(it.photo)} aria-label={`View photo from ${it.name}`}>
          <RemotePhoto path={it.photo.path} alt="" />
          {it.photo.caption && <span className="small">{it.photo.caption}</span>}
        </button>
      )}
      <div><CheerButton to={it.user} target={it.key} label={it.kind === 'workout' ? `${it.name}’s ${it.workout.name}` : `${it.name}’s photo`} /></div>
    </article>
  );
}

function CodeBox({ code }: { code: string }) {
  const toast = useToast();
  const link = `${location.origin}${location.pathname}?invite=${code}#friends`;
  const share = async () => {
    const text = `Add me on PX-Fitness. My friend code is ${formatCode(code)}: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'PX-Fitness', text });
      else { await navigator.clipboard.writeText(text); toast('Invite copied'); }
    } catch { /* closed share sheet */ }
  };
  return (
    <div className="code-box">
      <span className="code tnum" data-testid="my-code">{formatCode(code)}</span>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={share} data-testid="share-invite">Share invite</button>
        <button className="btn btn-ghost btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(code); toast('Code copied'); } catch { toast('Copy isn’t available here.'); } }}>Copy</button>
      </div>
    </div>
  );
}

function AddFriendSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(initial ? formatCode(normalizeCode(initial)) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet title="Add a friend" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
          const r = await social.addFriend(code);
          toast(r.status === 'accepted' ? `You and ${r.name} are now friends` : `Request sent to ${r.name}`);
          onClose();
        } catch (e2) { setErr(errMsg(e2)); }
        setBusy(false);
      }}>
        <div className="field">
          <label className="label" htmlFor="fr-code">Their friend code</label>
          <input id="fr-code" className="input code-input" value={code} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-2345" onChange={(e) => { const n = normalizeCode(e.target.value); setCode(n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4)}` : n); }} data-testid="friend-code" />
        </div>
        {err && <p className="form-error" role="alert" data-testid="add-error">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || normalizeCode(code).length !== 8} data-testid="send-request">{busy ? 'Sending…' : 'Send request'}</button>
        <p className="small muted">They’ll see your name and can accept or decline. Nothing is shared until you’re both friends.</p>
      </form>
    </Sheet>
  );
}

function FriendSheet({ friend, onClose }: { friend: SocialProfile; onClose: () => void }) {
  const s = useSocial();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [view, setView] = useState<SharedPhoto | null>(null);
  const pics = s.photos.filter((p) => p.user_id === friend.user_id);
  const recent = friend.share_workouts ? friend.shared?.recent ?? [] : [];
  const routine = friend.share_routine ? friend.shared?.routine ?? [] : [];
  return (
    <Sheet title={friend.display_name} onClose={onClose} label={`${friend.display_name}’s profile`}>
      <div className="stack-lg" data-testid="friend-sheet">
        <section className="stack">
          <h3 className="eyebrow">Recent workouts</h3>
          {!friend.share_workouts ? <p className="small muted">{friend.display_name} isn’t sharing workouts.</p> : recent.length === 0 ? <p className="small muted">No workouts yet.</p> : recent.slice(0, 6).map((w) => (
            <div key={w.id} className="row-between small"><span><b>{w.name}</b> <span className="muted">· {formatShortDate(w.date)}{w.minutes ? ` · ${w.minutes} min` : ''}</span></span><CheerButton to={friend.user_id} target={`w:${w.id}`} label={w.name} /></div>
          ))}
        </section>
        <section className="stack">
          <h3 className="eyebrow">Their plan</h3>
          {!friend.share_routine ? <p className="small muted">{friend.display_name} isn’t sharing their plan.</p> : routine.map((t) => (
            <div key={t.name} data-testid="friend-routine"><b>{t.name}</b><p className="small muted">{t.exercises.map((e) => `${e.name} ${e.sets}× ${e.target}`).join(' · ')}</p></div>
          ))}
        </section>
        <section className="stack">
          <h3 className="eyebrow">Photos</h3>
          {pics.length === 0 ? <p className="small muted">No photos shared.</p> : (
            <div className="photo-grid">{pics.map((p) => <button key={p.id} className="photo" onClick={() => setView(p)} aria-label={`Photo from ${formatShortDate(p.taken_on)}`} data-testid="friend-photo"><RemotePhoto path={p.path} alt="" /></button>)}</div>
          )}
        </section>
        <button className="btn btn-ghost" onClick={() => setConfirm(true)} data-testid="remove-friend">Remove friend</button>
      </div>
      {view && (
        <Sheet title={formatShortDate(view.taken_on)} onClose={() => setView(null)}>
          <RemotePhoto path={view.path} alt={`Photo shared by ${friend.display_name}`} className="photo-full" />
          {view.caption && <p style={{ marginTop: 10 }}>{view.caption}</p>}
        </Sheet>
      )}
      {confirm && <ConfirmDialog danger title={`Remove ${friend.display_name}?`} body="You’ll stop seeing each other’s shared plan, workouts and photos. They aren’t notified." confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={async () => { setConfirm(false); try { await social.remove(friend.user_id); toast('Friend removed'); onClose(); } catch (e) { toast(errMsg(e)); } }} />}
    </Sheet>
  );
}

function SharingSheet({ onClose, go }: { onClose: () => void; go: (r: Route) => void }) {
  const s = useSocial();
  const toast = useToast();
  const me = s.me!;
  const [name, setName] = useState(me.display_name);
  const [busy, setBusy] = useState<string | null>(null);
  const [mine] = useState<ProgressPhoto[]>(() => localPhotos.list());
  const [confirmCode, setConfirmCode] = useState(false);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(errMsg(e)); }
    setBusy(null);
  };
  return (
    <Sheet title="What you share" onClose={onClose}>
      <div className="stack-lg" data-testid="sharing-sheet">
        <form className="row" onSubmit={(e) => { e.preventDefault(); void run('name', () => social.setSharing({ display_name: name }), 'Name updated'); }}>
          <div className="field grow"><label className="label" htmlFor="sh-name">Your name</label><input id="sh-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></div>
          <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-end' }} disabled={busy !== null || name.trim() === me.display_name}>Save</button>
        </form>
        <div>
          <div className="setting-row"><div><b>My plan</b><p className="small muted">Workout names and exercises. No weights.</p></div><Switch label="Share my plan" checked={me.share_routine} onChange={(v) => void run('routine', () => social.setSharing({ share_routine: v }))} /></div>
          <div className="setting-row"><div><b>My workouts</b><p className="small muted">Your last 12 finished workouts.</p></div><Switch label="Share my workouts" checked={me.share_workouts} onChange={(v) => void run('workouts', () => social.setSharing({ share_workouts: v }))} /></div>
        </div>
        <section className="stack">
          <b>Photos</b>
          {mine.length === 0 ? (
            <p className="small muted">You don’t have progress photos yet. <button className="link-btn" onClick={() => { onClose(); go('progress'); }}>Add one on Progress</button></p>
          ) : (
            <>
              <p className="small muted">Tap a photo to share it with friends or stop sharing. Only the ones marked Shared leave this phone.</p>
              <div className="photo-grid">
                {mine.map((p) => {
                  const shared = !!social.sharedFor(p.id);
                  return (
                    <button key={p.id} className={'photo share-pick' + (shared ? ' on' : '')} aria-pressed={shared} aria-label={`${shared ? 'Stop sharing' : 'Share'} photo from ${formatShortDate(p.date)}`} disabled={busy !== null} data-testid="share-photo"
                      onClick={() => void run(p.id, () => (shared ? social.unsharePhoto(p.id) : social.sharePhoto(p)), shared ? 'Photo is private again' : 'Photo shared with friends')}>
                      <img src={p.dataUrl} alt="" />
                      <span className="share-badge">{busy === p.id ? '…' : shared ? 'Shared' : 'Private'}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
        <section className="stack">
          <b>Friend code</b>
          <p className="small muted">Get a new code if your old one was passed around. Current friends stay friends.</p>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirmCode(true)}>Get a new code</button>
        </section>
      </div>
      {confirmCode && <ConfirmDialog title="Get a new friend code?" body="Your old code will stop working. Friends you already have aren’t affected." confirmLabel="New code" onCancel={() => setConfirmCode(false)} onConfirm={() => { setConfirmCode(false); void run('code', () => social.newCode(), 'New code ready'); }} />}
    </Sheet>
  );
}

/** Used by the Progress photo viewer. */
export function PhotoShareButton({ photo }: { photo: ProgressPhoto }) {
  const c = useCloud();
  const s = useSocial();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (c.session && !s.loaded && !s.loading) void social.load(); }, [c.session, s.loaded, s.loading]);
  if (!c.enabled || !c.session || !s.me) return null;
  const shared = !!social.sharedFor(photo.id);
  return (
    <button className={'btn btn-block ' + (shared ? 'btn-outline' : 'btn-primary')} style={{ marginTop: 12 }} disabled={busy} data-testid="photo-share-toggle"
      onClick={async () => { setBusy(true); try { if (shared) { await social.unsharePhoto(photo.id); toast('Photo is private again'); } else { await social.sharePhoto(photo); toast('Photo shared with friends'); } } catch (e) { toast(errMsg(e)); } setBusy(false); }}>
      {busy ? 'One moment…' : shared ? 'Stop sharing with friends' : 'Share with friends'}
    </button>
  );
}

