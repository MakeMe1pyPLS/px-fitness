// Photo calorie estimate (Vercel edge function). PX Plus subscribers only.
//
// Same gate as the AI check-in: signed in → active subscription + daily AI
// allowance (use_ai_credit, one call) → Claude vision. The photo is sent to
// Anthropic for this one request and is not stored by PX.
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY (server-side only).
// Cost reference: the app downsizes photos to ~1024 px, roughly 1–1.5K input
// tokens, plus ~400 output tokens: a small fraction of a cent per photo on
// Claude Haiku 5.5.
//
// Estimates are estimates: portion size from a photo is hard to judge, so the
// app shows every item with editable grams before anything is logged.
import { env, fail, getUser, json } from './_shared';

export const config = { runtime: 'edge' };

const SYSTEM = `You estimate the food in a photo for a fitness app's food log. Identify each separate food or drink you can see, estimate its edible weight in grams from visual cues (plate size, utensils, hands, packaging), and give calories and macros for that weight using typical USDA values. Be realistic, not optimistic: include visible oils, sauces and dressings. If a packaged product's nutrition label is readable, use it. If the photo isn't food, set not_food to true and return no items. Never comment on the person's body, weight or choices. Always call record_food.`;

const TOOL = {
  name: 'record_food',
  description: 'Record the foods identified in the photo with estimated portions and nutrition.',
  input_schema: {
    type: 'object',
    properties: {
      not_food: { type: 'boolean' },
      meal_name: { type: 'string', maxLength: 60, description: 'Short name for the whole plate, e.g. "Chicken burrito bowl".' },
      items: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 50 },
            grams: { type: 'number', minimum: 1, maximum: 2000 },
            kcal: { type: 'number', minimum: 0, maximum: 4000 },
            protein_g: { type: 'number', minimum: 0, maximum: 300 },
            carbs_g: { type: 'number', minimum: 0, maximum: 500 },
            fat_g: { type: 'number', minimum: 0, maximum: 300 },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
        },
      },
      caveat: { type: 'string', maxLength: 160, description: 'One short note on what was hard to judge, or empty.' },
    },
    required: ['not_food', 'items'],
  },
};

const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return fail('Photo scanning isn’t switched on yet.', 503, 'not_configured');
  const user = await getUser(req);
  if (!user) return fail('Sign in to scan food photos.', 401, 'signed_out');

  let body: { image?: string; mediaType?: string; note?: string };
  try { body = await req.json(); } catch { return fail('Bad JSON', 400); }
  const image = String(body.image ?? '');
  const mediaType = String(body.mediaType ?? 'image/jpeg');
  if (!MEDIA.has(mediaType) || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return fail('Send a JPEG, PNG or WebP photo.', 400, 'bad_image');
  if (image.length > 3_000_000) return fail('That photo is too large. Try again.', 413, 'too_large');

  const credit = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/use_ai_credit`, {
    method: 'POST',
    headers: { apikey: env('SUPABASE_ANON_KEY'), authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ daily_limit: Number(env('PX_AI_DAILY_LIMIT') || 30) }),
  }).then((r) => r.json()).catch(() => null);
  if (!credit) return fail('Couldn’t check your plan. Try again.', 502, 'plan_check_failed');
  if (!credit.allowed) {
    if (credit.reason === 'daily_limit') return fail('That’s today’s AI limit. You can still log the meal by hand.', 429, 'daily_limit');
    return fail('Photo scanning is part of PX Plus.', 402, 'not_subscribed');
  }

  const note = String(body.note ?? '').slice(0, 200);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 700,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'record_food' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: note ? `The person added: "${note}"` : 'Estimate this meal.' },
        ],
      }],
    }),
  });
  if (!res.ok) return fail('The photo scan is busy. Try again in a moment.', 502, 'ai_error');
  const data = await res.json();
  const tool = (data.content ?? []).find((b: { type: string; name?: string }) => b.type === 'tool_use' && b.name === 'record_food');
  if (!tool) return fail('Couldn’t read that photo. Try another angle.', 502, 'ai_error');
  return json(tool.input);
}
