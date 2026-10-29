// AI check-in endpoint (Vercel edge function). PX Plus subscribers only.
//
// Order of checks: signed in → active subscription + daily allowance (one
// database call, use_ai_credit) → Anthropic. Free users keep the scripted
// engine in src/lib/checkinBot.ts. Safety checks run on the device first, and
// crisis messages are never sent here. Check-in text isn't stored server-side.
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY (server-side).
// Cost reference: Claude Haiku 5.5 is $0.10 / $0.50 per million input/output
// tokens (prompts under 100K). A 5-turn check-in is roughly 20K in / 1K out, so
// about a quarter of a cent. Enforce a per-user daily cap before calling.
//
// Tested against mocks only; run one real check-in after adding the key.
import { env, fail, getUser, json } from './_shared';

export const config = { runtime: 'edge' };

const SYSTEM = `You are the PX-Fitness check-in assistant. Ask one short, warm question at a time about mood, energy, sleep, time available for training today, and soreness or stress. Never diagnose, never give medical advice, never comment on body weight or appearance. If the user mentions pain or injury, suggest skipping what hurts and seeing a professional if it persists. Keep replies under 35 words. When you have enough, call record_checkin with only what the user actually said, then give a one-line wrap-up.`;

const TOOL = {
  name: 'record_checkin',
  description: 'Save the structured check-in. Only include fields the user stated or clearly implied.',
  input_schema: {
    type: 'object',
    properties: {
      mood: { type: 'integer', minimum: 1, maximum: 5 },
      energy: { type: 'integer', minimum: 1, maximum: 5 },
      stress: { type: 'integer', minimum: 1, maximum: 5 },
      soreness: { type: 'integer', minimum: 1, maximum: 5 },
      sleepHours: { type: 'number', minimum: 0, maximum: 14 },
      availableMinutes: { type: 'integer', minimum: 0, maximum: 240 },
      remember: { type: 'string', maxLength: 200, description: 'One short thing worth asking about next time, in the user’s words, or empty.' },
    },
  },
};

interface Body { messages: { role: 'user' | 'assistant'; content: string }[]; context: { name?: string; recall?: string; todaySession?: string; opener?: string } }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return fail('The AI coach isn’t switched on yet.', 503, 'not_configured');
  const user = await getUser(req);
  if (!user) return fail('Sign in to use the AI coach.', 401, 'signed_out');
  const credit = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/use_ai_credit`, {
    method: 'POST',
    headers: { apikey: env('SUPABASE_ANON_KEY'), authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ daily_limit: Number(env('PX_AI_DAILY_LIMIT') || 30) }),
  }).then((r) => r.json()).catch(() => null);
  if (!credit) return fail('Couldn’t check your plan. Try again.', 502, 'plan_check_failed');
  if (!credit.allowed) {
    if (credit.reason === 'daily_limit') return fail('That’s today’s AI coach limit. The quick check-in still works.', 429, 'daily_limit');
    return fail('The AI coach is part of PX Plus.', 402, 'not_subscribed');
  }
  let body: Body;
  try { body = await req.json(); } catch { return fail('Bad JSON', 400); }
  const messages = (body.messages ?? []).slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 600) }));
  if (!messages.length) return fail('No messages', 400);

  const c = body.context ?? {};
  const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);
  const ctx = `Context (from the app, not the user): name=${clip(c.name, 40)}; ${c.recall ? `you already said to them: "${clip(c.recall, 200)}"; ` : ''}today's session: ${clip(c.todaySession, 60) || 'rest day'}; the app opened by asking: "${clip(c.opener, 120)}".`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 300,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: ctx }],
      tools: [TOOL],
      messages,
    }),
  });
  if (!res.ok) return fail('The AI coach is busy. Try again in a moment.', 502, 'ai_error');
  const data = await res.json();
  const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join(' ').trim();
  const tool = (data.content ?? []).find((b: { type: string; name?: string }) => b.type === 'tool_use' && b.name === 'record_checkin');
  return json({ reply: text, checkin: tool?.input ?? null, done: !!tool });
}
