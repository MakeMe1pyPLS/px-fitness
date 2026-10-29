// Stripe → PX-Fitness. The ONLY place that marks an account as paid.
// Verifies Stripe's signature, then mirrors the subscription status into Supabase.
// Stripe dashboard → Developers → Webhooks → endpoint: https://<site>/api/stripe-webhook
// Events: checkout.session.completed, customer.subscription.created,
//         customer.subscription.updated, customer.subscription.deleted
import { adminRest, env, fail, json, verifyStripeSignature } from './_shared';

export const config = { runtime: 'edge' };

interface StripeSub { id: string; customer: string; status: string; cancel_at_period_end: boolean; current_period_end?: number; items?: { data?: { current_period_end?: number }[] }; metadata?: { user_id?: string } }

export function subRow(sub: StripeSub, userId: string) {
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end; // newer API versions keep it on the item
  return {
    user_id: userId,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

async function userIdFor(customer: string, metaUserId?: string): Promise<string | null> {
  if (metaUserId) return metaUserId;
  const rows = await (await adminRest(`/subscriptions?select=user_id&stripe_customer_id=eq.${encodeURIComponent(customer)}`)).json();
  return Array.isArray(rows) && rows[0]?.user_id ? rows[0].user_id : null;
}

async function upsert(row: Record<string, unknown>) {
  const res = await adminRest('/subscriptions?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  const raw = await req.text();
  const ok = await verifyStripeSignature(raw, req.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET'));
  if (!ok) return fail('Bad signature', 400);

  const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;
  try {
    if (event.type === 'checkout.session.completed') {
      const userId = (obj.client_reference_id as string) || (obj.metadata as { user_id?: string })?.user_id;
      if (userId && obj.customer) await upsert({ user_id: userId, stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription ?? null, updated_at: new Date().toISOString() });
    } else if (event.type.startsWith('customer.subscription.')) {
      const sub = obj as unknown as StripeSub;
      const userId = await userIdFor(sub.customer, sub.metadata?.user_id);
      if (!userId) return json({ received: true, note: 'unknown customer' });
      const row = subRow(sub, userId);
      if (event.type === 'customer.subscription.deleted') row.status = 'canceled';
      await upsert(row);
    }
  } catch (e) {
    // 500 makes Stripe retry later.
    return fail(e instanceof Error ? e.message : 'Webhook failed', 500);
  }
  return json({ received: true });
}
