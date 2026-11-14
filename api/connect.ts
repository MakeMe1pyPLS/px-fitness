// Coach payouts: connect the coach's own Stripe account (full Stripe Dashboard, the coach
// pays Stripe's fees, Stripe handles disputes/losses) and check whether it can take payments.
//   POST { action: 'onboard', returnTo }  → { url }  (Stripe-hosted onboarding)
//   POST { action: 'status' }             → { connected, chargesEnabled }
import { adminRest, env, fail, getUser, json, safeReturn, stripe } from './_shared';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  if (!env('STRIPE_SECRET_KEY') || !env('SUPABASE_SERVICE_ROLE_KEY')) return fail('Payments aren’t set up yet.', 503, 'not_configured');
  const user = await getUser(req);
  if (!user) return fail('Sign in first.', 401, 'signed_out');
  const body = await req.json().catch(() => ({}));

  const prof = await (await adminRest(`/social_profiles?select=is_coach&user_id=eq.${user.id}`)).json();
  if (!Array.isArray(prof) || !prof[0]?.is_coach) return fail('Only PX coaches can set up payouts.', 403, 'not_coach');

  const rows = await (await adminRest(`/coach_payouts?select=stripe_account_id,charges_enabled&coach_id=eq.${user.id}`)).json();
  let acct: string | undefined = Array.isArray(rows) ? rows[0]?.stripe_account_id : undefined;

  try {
    if (body?.action === 'status') {
      if (!acct) return json({ connected: false, chargesEnabled: false });
      const a = await stripe(`/accounts/${acct}`, null, 'GET');
      await adminRest(`/coach_payouts?coach_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ charges_enabled: !!a.charges_enabled, updated_at: new Date().toISOString() }) });
      return json({ connected: true, chargesEnabled: !!a.charges_enabled });
    }
    if (!acct) {
      const a = await stripe('/accounts', {
        email: user.email,
        controller: { stripe_dashboard: { type: 'full' }, fees: { payer: 'account' }, losses: { payments: 'stripe' } },
        metadata: { user_id: user.id },
      });
      acct = a.id as string;
      await adminRest('/coach_payouts', { method: 'POST', body: JSON.stringify({ coach_id: user.id, stripe_account_id: acct }) });
    }
    const back = safeReturn(req, body?.returnTo);
    const link = await stripe('/account_links', { account: acct, type: 'account_onboarding', refresh_url: `${back}?payouts=refresh#friends`, return_url: `${back}?payouts=done#friends` });
    return json({ url: link.url });
  } catch (e) {
    return fail(e instanceof Error ? `Stripe: ${e.message}` : 'Stripe couldn’t be reached.', 502, 'stripe_error');
  }
}
