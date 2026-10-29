import React, { useEffect, useState } from 'react';
import { ConfirmDialog, Sheet, cloud, useCloud, useToast } from './core';
import { CLOUD } from '../config';
import { CloudError, isActive } from '../lib/cloud';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const errMsg = (e: unknown) => (e instanceof CloudError || e instanceof Error ? e.message : 'Something went wrong. Please try again.');

// ── Sign in / create account / reset ──────────────────────────────────────
export function AuthSheet({ onClose, initial = 'signin', then }: { onClose: () => void; initial?: 'signin' | 'signup'; then?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initial);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<null | 'confirm' | 'reset'>(null);
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email address.');
    if (mode !== 'reset' && pw.length < 8) return setErr('Use a password with at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'signin') { await cloud.signIn(email, pw); toast('Signed in'); onClose(); then?.(); }
      else if (mode === 'signup') {
        const r = await cloud.signUp(email, pw);
        if (r === 'signed_in') { toast('Account created'); onClose(); then?.(); } else setSent('confirm');
      } else { await cloud.sendReset(email); setSent('reset'); }
    } catch (e2) { setErr(errMsg(e2)); }
    setBusy(false);
  };

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset password';
  if (sent) return (
    <Sheet title="Check your email" onClose={onClose}>
      <p data-testid="auth-sent">{sent === 'confirm' ? `We sent a confirmation link to ${email.trim()}. Tap it to finish creating your account, then come back here.` : `If there’s an account for ${email.trim()}, a reset link is on its way.`}</p>
      <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={onClose}>OK</button>
    </Sheet>
  );
  return (
    <Sheet title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        {mode === 'signup' && <p className="small muted">Back up your training on your account so it follows you to any device.</p>}
        <div className="field">
          <label className="label" htmlFor="auth-email">Email</label>
          <input id="auth-email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email" required />
        </div>
        {mode !== 'reset' && (
          <div className="field">
            <label className="label" htmlFor="auth-pw">Password</label>
            <input id="auth-pw" className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} data-testid="auth-password" minLength={8} required />
            {mode === 'signup' && <p className="small muted">At least 8 characters.</p>}
          </div>
        )}
        {err && <p className="form-error" role="alert" data-testid="auth-error">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy} data-testid="auth-submit">{busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
        <div className="row-between small">
          {mode === 'signin' ? <button type="button" className="link-btn" onClick={() => { setMode('signup'); setErr(null); }} data-testid="auth-to-signup">Create an account</button> : <button type="button" className="link-btn" onClick={() => { setMode('signin'); setErr(null); }}>I have an account</button>}
          {mode === 'signin' && <button type="button" className="link-btn" onClick={() => { setMode('reset'); setErr(null); }}>Forgot password?</button>}
        </div>
      </form>
    </Sheet>
  );
}

export function NewPasswordSheet({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Sheet title="Choose a new password" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) return setErr('Use a password with at least 8 characters.');
        setBusy(true);
        try { await cloud.updatePassword(pw); toast('Password updated'); onClose(); } catch (e2) { setErr(errMsg(e2)); }
        setBusy(false);
      }}>
        <div className="field">
          <label className="label" htmlFor="new-pw">New password</label>
          <input id="new-pw" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>Save password</button>
      </form>
    </Sheet>
  );
}

// ── Upgrade ───────────────────────────────────────────────────────────────
export function UpgradeSheet({ onClose, reason }: { onClose: () => void; reason?: string }) {
  const c = useCloud();
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const checkout = async () => {
    setErr(null);
    setBusy(true);
    try { location.assign(await cloud.startCheckout()); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };

  if (auth) return <AuthSheet initial="signup" onClose={() => setAuth(false)} />;
  return (
    <Sheet title={CLOUD.plan.name} onClose={onClose} label="Upgrade to PX Plus">
      <div className="stack" data-testid="upgrade-sheet">
        {reason && <p className="small">{reason}</p>}
        <div className="plan-price"><span className="display">{CLOUD.plan.priceLabel.split('/')[0]}</span><span className="muted">/month</span></div>
        <ul className="plan-list">
          <li><b>AI check-in coach.</b> Talk through how you’re feeling in your own words. It asks follow-ups and saves your check-in for you.</li>
          <li>Up to {CLOUD.aiDailyLimit} AI coach messages a day.</li>
          <li>Cancel anytime from Billing on the You tab.</li>
        </ul>
        <p className="small muted">Everything else stays free: workouts, progress, meals, insights and the quick check-in.</p>
        {err && <p className="form-error" role="alert" data-testid="upgrade-error">{err}</p>}
        {c.session
          ? <button className="btn btn-primary btn-block" onClick={checkout} disabled={busy} data-testid="upgrade-checkout">{busy ? 'Opening checkout…' : `Continue to payment`}</button>
          : <button className="btn btn-primary btn-block" onClick={() => setAuth(true)} data-testid="upgrade-signin">Create an account to continue</button>}
        <p className="small muted">Payments are handled securely by Stripe. PX-Fitness never sees your card number.</p>
      </div>
    </Sheet>
  );
}

// ── Sync conflict (shown app-wide) ────────────────────────────────────────
export function SyncConflict() {
  const c = useCloud();
  const [busy, setBusy] = useState(false);
  if (!c.conflict) return null;
  const pick = async (k: 'account' | 'device') => { setBusy(true); await cloud.resolveConflict(k); setBusy(false); };
  return (
    <Sheet title="Which data should we keep?" onClose={() => undefined} label="Choose data to keep">
      <div className="stack" data-testid="sync-conflict">
        <p>This device and your account both have training data. Pick one to keep. The other copy will be replaced.</p>
        {c.sync === 'conflict' && c.syncError && <p className="form-error" role="alert">{c.syncError} Try again.</p>}
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => pick('account')} data-testid="keep-account">Use my account’s data<span className="small" style={{ display: 'block', opacity: 0.8 }}>Last saved {fmtDate(c.conflict.remoteUpdatedAt)}</span></button>
        <button className="btn btn-outline btn-block" disabled={busy} onClick={() => pick('device')} data-testid="keep-device">Keep this device’s data</button>
      </div>
    </Sheet>
  );
}

// ── Account card on the You tab ───────────────────────────────────────────
export function AccountCard() {
  const c = useCloud();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | 'signin' | 'signup' | 'upgrade'>(null);
  const [confirm, setConfirm] = useState<null | 'signout' | 'wipe'>(null);
  const [busy, setBusy] = useState(false);
  if (!c.enabled) return null;

  const plus = isActive(c.sub);
  const billing = async () => {
    setBusy(true);
    try { location.assign(await cloud.openPortal()); } catch (e) { toast(errMsg(e)); setBusy(false); }
  };
  const syncLabel = c.sync === 'syncing' ? 'Saving…' : c.sync === 'error' ? (c.syncError ?? 'Couldn’t sync') : c.syncedAt ? `Backed up ${new Date(c.syncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not backed up yet';

  return (
    <section className="card stack" data-testid="account-card">
      <h2 className="eyebrow">Account</h2>
      {!c.session ? (
        <>
          <p className="small muted">Your data is saved on this device only. Create a free account to back it up and use it on other devices.</p>
          <div className="row"><button className="btn btn-primary grow" onClick={() => setSheet('signup')} data-testid="account-signup">Create account</button><button className="btn btn-outline grow" onClick={() => setSheet('signin')} data-testid="account-signin">Sign in</button></div>
        </>
      ) : (
        <>
          <div className="list small">
            <div className="list-row"><span className="muted">Signed in as</span><b data-testid="account-email" style={{ overflowWrap: 'anywhere', textAlign: 'right' }}>{c.session.user.email}</b></div>
            <div className="list-row"><span className="muted">Backup</span><span data-testid="sync-status" className={c.sync === 'error' ? 'text-warn' : ''} style={{ textAlign: 'right' }}>{syncLabel}</span></div>
            <div className="list-row"><span className="muted">Plan</span><b data-testid="plan-status">{c.subLoading && !c.sub ? 'Checking…' : plus ? `${CLOUD.plan.name}` : 'Free'}</b></div>
            {plus && c.sub?.current_period_end && <div className="list-row"><span className="muted">{c.sub.cancel_at_period_end ? 'Ends' : 'Renews'}</span><span>{fmtDate(c.sub.current_period_end)}</span></div>}
          </div>
          {c.sync === 'error' && <button className="btn btn-outline btn-sm" onClick={() => cloud.push().catch(() => toast('Still can’t reach the server.'))}>Try backup again</button>}
          {plus
            ? <button className="btn btn-outline" onClick={billing} disabled={busy} data-testid="manage-billing">Billing & cancel</button>
            : <button className="btn btn-primary" onClick={() => setSheet('upgrade')} data-testid="account-upgrade">Get {CLOUD.plan.name} · {CLOUD.plan.priceLabel}</button>}
          <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => setConfirm('signout')} data-testid="account-signout">Sign out</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm('wipe')}>Delete cloud backup</button></div>
          <p className="small muted">Progress photos stay on this device and aren’t backed up.</p>
        </>
      )}
      {(sheet === 'signin' || sheet === 'signup') && <AuthSheet initial={sheet} onClose={() => setSheet(null)} />}
      {sheet === 'upgrade' && <UpgradeSheet onClose={() => setSheet(null)} />}
      {confirm === 'signout' && <ConfirmDialog title="Sign out?" body="Your data stays on this device. Sign back in anytime to keep backing it up." confirmLabel="Sign out" onCancel={() => setConfirm(null)} onConfirm={async () => { setConfirm(null); await cloud.signOut(); toast('Signed out'); }} />}
      {confirm === 'wipe' && <ConfirmDialog danger title="Delete cloud backup?" body="This removes the copy saved to your account. Data on this device isn’t touched, and it will back up again the next time you make a change." confirmLabel="Delete backup" onCancel={() => setConfirm(null)} onConfirm={async () => { setConfirm(null); try { await cloud.deleteCloudData(); toast('Cloud backup deleted'); } catch (e) { toast(errMsg(e)); } }} />}
    </section>
  );
}

/** Handles ?checkout=success / cancel after Stripe sends the user back. */
export function useCheckoutReturn() {
  const toast = useToast();
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const r = q.get('checkout');
    if (!r) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (r === 'cancel') { toast('Checkout canceled. You weren’t charged.'); return; }
    toast('Payment received. Turning on PX Plus…');
    void cloud.waitForActive().then((ok) => toast(ok ? 'PX Plus is on. The AI coach is ready in your check-in.' : 'Payment went through, but PX Plus is still activating. Check again in a minute.'));
  }, [toast]);
}
