// AI check-in endpoint (Vercel serverless function). NOT CONNECTED YET.
//
// The app currently uses the scripted engine in src/lib/checkinBot.ts. When
// the client approves AI costs, deploy this and point the chat at /api/checkin.
// Safety checks still run on the device before anything is sent here.
//
// Env: ANTHROPIC_API_KEY (server-side only; never ship it to the browser).
// Cost reference: Claude Haiku 5.5 is $0.10 / $0.50 per million input/output
// tokens (prompts under 100K). A 5-turn check-in is roughly 20K in / 1K out, so
// about a quarter of a cent. Enforce a per-user daily cap before calling.
//
// Untested in this build environment (no network access). Test before launch.

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

interface Body { messages: { role: 'user' | 'assistant'; content: string }[]; context: { name?: string; recall?: string; todaySession?: string } }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI check-in is not configured' }, { status: 503 });
  // TODO before launch: authenticate the user (Supabase JWT) and enforce a per-user daily limit.
  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }
  const messages = (body.messages ?? []).slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 600) }));
  if (!messages.length) return Response.json({ error: 'No messages' }, { status: 400 });

  const ctx = `Context (from the app, not the user): name=${body.context?.name ?? ''}; ${body.context?.recall ? `last time they mentioned: ${body.context.recall}; ` : ''}today's session: ${body.context?.todaySession ?? 'rest day'}.`;
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
  if (!res.ok) return Response.json({ error: 'AI service error', status: res.status }, { status: 502 });
  const data = await res.json();
  const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join(' ').trim();
  const tool = (data.content ?? []).find((b: { type: string; name?: string }) => b.type === 'tool_use' && b.name === 'record_checkin');
  return Response.json({ reply: text, checkin: tool?.input ?? null, done: !!tool, usage: data.usage });
}
