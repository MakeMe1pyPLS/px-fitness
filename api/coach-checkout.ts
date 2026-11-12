// A linked client pays their coach for sessions. Direct charge on the coach's Stripe account:
// the money lands with the coach, Stripe's fee comes from the coach's side, no platform cut.
//   POST { offerId, note?, returnTo } → { url }
import { adminRest, env, fail, getUser, json, safeReturn, stripe } from './_shared';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  if (!env('STRIPE_SECRET_KEY') || !env('SUPABASE_SERVICE_ROLE_KEY')) return fail('Payments aren’t set up yet.', 503, 'not_configured');
  const user = await getUser(req);
  if (!user) return fail('Sign in first.', 401, 'signed_out');
  const body = await req.json().catch(() => ({}));
  const offerId = String(body?.offerId ?? '');
  if (!/^[0-9a-f-]{36}$/.test(offerId)) return fail('Pick a session to pay for.', 400, 'bad_offer');

  const offers = await (await adminRest(`/coach_offers?select=*&id=eq.${offerId}&active=eq.true`)).json();
  const offer = Array.isArray(offers) ? offers[0] : null;
  if (!offer) return fail('That option isn’t available anymore.', 404, 'no_offer');

  const links = await (await adminRest(`/coach_links?select=status&client_id=eq.${user.id}&coach_id=eq.${offer.coach_id}`)).json();
  if (!Array.isArray(links) || links[0]?.status !== 'accepted') return fail('Connect with this coach first.', 403, 'not_linked');

  const pay = await (await adminRest(`/coach_payouts?select=stripe_account_id,charges_enabled&coach_id=eq.${offer.coach_id}`)).json();
  const acct = Array.isArray(pay) ? pay[0] : null;
  if (!acct?.stripe_account_id || !acct.charges_enabled) return fail('Your coach hasn’t finished setting up payments yet.', 409, 'coach_not_ready');

  const note = String(body?.note ?? '').slice(0, 200);
  const back = safeReturn(req, body?.returnTo);
  try {
    const session = await stripe('/checkout/sessions', {
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: offer.price_cents, product_data: { name: offer.name, description: offer.sessions > 1 ? `${offer.sessions} coaching sessions` : 'Coaching session' } } }],
      customer_email: user.email || undefined,
      metadata: { px_kind: 'coaching', coach_id: offer.coach_id, client_id: user.id, offer_name: offer.name, note },
      payment_intent_data: { metadata: { px_kind: 'coaching', coach_id: offer.coach_id, client_id: user.id } },
      success_url: `${back}?coachpay=success#friends`,
      cancel_url: `${back}?coachpay=cancel#friends`,
    }, 'POST', acct.stripe_account_id);
    return json({ url: session.url });
  } catch (e) {
    return fail(e instanceof Error ? `Checkout couldn’t start: ${e.message}` : 'Checkout couldn’t start.', 502, 'stripe_error');
  }
}
