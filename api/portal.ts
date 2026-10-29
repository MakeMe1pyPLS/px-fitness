// Opens Stripe's billing portal so subscribers can update their card or cancel.
import { adminRest, env, fail, getUser, json, safeReturn, stripe } from './_shared';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  if (!env('STRIPE_SECRET_KEY') || !env('SUPABASE_SERVICE_ROLE_KEY')) return fail('Payments aren’t set up yet.', 503, 'not_configured');
  const user = await getUser(req);
  if (!user) return fail('Sign in first.', 401, 'signed_out');
  const body = await req.json().catch(() => ({}));
  const rows = await (await adminRest(`/subscriptions?select=stripe_customer_id&user_id=eq.${user.id}`)).json();
  const customer = Array.isArray(rows) ? rows[0]?.stripe_customer_id : null;
  if (!customer) return fail('No billing account yet.', 404, 'no_customer');
  try {
    const s = await stripe('/billing_portal/sessions', { customer, return_url: `${safeReturn(req, body?.returnTo)}#you` });
    return json({ url: s.url });
  } catch (e) {
    return fail(e instanceof Error ? `Billing couldn’t open: ${e.message}` : 'Billing couldn’t open.', 502, 'stripe_error');
  }
}
