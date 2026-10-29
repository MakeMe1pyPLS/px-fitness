// Starts a Stripe Checkout for the PX Plus monthly plan.
// The browser never sees the price logic or keys; it only gets a checkout URL.
import { adminRest, env, fail, getUser, json, safeReturn, stripe } from './_shared';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  if (!env('STRIPE_SECRET_KEY') || !env('SUPABASE_SERVICE_ROLE_KEY')) return fail('Payments aren’t set up yet.', 503, 'not_configured');
  const user = await getUser(req);
  if (!user) return fail('Sign in first.', 401, 'signed_out');

  const body = await req.json().catch(() => ({}));
  const back = safeReturn(req, body?.returnTo);

  // Reuse the Stripe customer if this user already has one.
  const rows = await (await adminRest(`/subscriptions?select=status,stripe_customer_id&user_id=eq.${user.id}`)).json();
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (existing && ['active', 'trialing'].includes(existing.status)) return fail('You’re already subscribed.', 409, 'already_active');

  try {
    let customer = existing?.stripe_customer_id as string | undefined;
    if (!customer) {
      const c = await stripe('/customers', { email: user.email, metadata: { user_id: user.id } });
      customer = c.id as string;
      await adminRest('/subscriptions?on_conflict=user_id', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: user.id, stripe_customer_id: customer, updated_at: new Date().toISOString() }),
      });
    }
    const cents = Number(env('PX_PRICE_CENTS') || 2500);
    const session = await stripe('/checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents, recurring: { interval: 'month' }, product_data: { name: 'PX Plus', description: 'AI check-in coach for PX-Fitness' } } }],
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
      allow_promotion_codes: true,
      success_url: `${back}?checkout=success#you`,
      cancel_url: `${back}?checkout=cancel#you`,
    });
    return json({ url: session.url });
  } catch (e) {
    return fail(e instanceof Error ? `Checkout couldn’t start: ${e.message}` : 'Checkout couldn’t start.', 502, 'stripe_error');
  }
}
