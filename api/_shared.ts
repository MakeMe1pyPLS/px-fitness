// Shared server helpers for the Vercel functions. Files starting with "_" are
// not exposed as routes.
//
// Environment variables (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL                public, project API URL
//   SUPABASE_ANON_KEY           public anon key
//   SUPABASE_SERVICE_ROLE_KEY   SECRET: only the Stripe webhook and checkout use it
//   STRIPE_SECRET_KEY           SECRET: sk_test_... while testing
//   STRIPE_WEBHOOK_SECRET       SECRET: whsec_... from the webhook endpoint
//   ANTHROPIC_API_KEY           SECRET: for the AI check-in
//   PX_PRICE_CENTS              optional, defaults to 2500 ($25.00)

export const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined) ?? '';

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const fail = (error: string, status: number, code = '') => json({ error, code }, status);

/** Verify the caller's Supabase token by asking Supabase who it belongs to. */
export async function getUser(req: Request): Promise<{ id: string; email: string; token: string } | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !env('SUPABASE_URL')) return null;
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: env('SUPABASE_ANON_KEY'), authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ? { id: u.id, email: u.email ?? '', token } : null;
}

/** Service-role REST call. Bypasses row-level security, so only use it for server-owned tables. */
export async function adminRest(path: string, init: RequestInit = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return fetch(`${env('SUPABASE_URL')}/rest/v1${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers as Record<string, string>) },
  });
}

/** Stripe's API takes form-encoded nested keys: a[b][0][c]=x */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => {
      if (item !== null && typeof item === 'object') parts.push(formEncode(item as Record<string, unknown>, `${key}[${i}]`));
      else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
    });
    else if (typeof v === 'object') parts.push(formEncode(v as Record<string, unknown>, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join('&');
}

export async function stripe(path: string, params: Record<string, unknown> | null = null, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params && method !== 'GET' ? formEncode(params) : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `Stripe error ${res.status}`);
  return body;
}

/** Only redirect back to our own site. */
export function safeReturn(req: Request, returnTo: unknown): string {
  const origin = new URL(req.url).origin;
  try {
    const u = new URL(String(returnTo || origin));
    return u.origin === origin ? u.origin + u.pathname : origin + '/';
  } catch { return origin + '/'; }
}

// ── Stripe webhook signature (works in the edge runtime, no SDK) ────────────
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(now - Number(t)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}
