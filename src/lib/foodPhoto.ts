// Photo calorie scan: client helpers. The estimate itself comes from
// api/food-photo.ts; everything here is about making it safe to show and edit.

export interface ScanItem { name: string; grams: number; kcal: number; p: number; c: number; f: number; confidence: 'low' | 'medium' | 'high' }
export interface ScanResult { notFood: boolean; mealName: string; items: ScanItem[]; caveat: string; demo?: boolean }

const num = (v: unknown, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Validate and clamp whatever the server returned. Never trust it blindly. */
export function parseScan(raw: unknown): ScanResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 12).map((x) => {
    const i = (x ?? {}) as Record<string, unknown>;
    const conf = i.confidence === 'high' || i.confidence === 'medium' ? i.confidence : 'low';
    return { name: String(i.name ?? 'Food').slice(0, 50), grams: Math.round(num(i.grams, 2000)), kcal: Math.round(num(i.kcal, 4000)), p: r1(num(i.protein_g, 300)), c: r1(num(i.carbs_g, 500)), f: r1(num(i.fat_g, 300)), confidence: conf } as ScanItem;
  }).filter((i) => i.grams > 0);
  return { notFood: o.not_food === true, mealName: String(o.meal_name ?? '').slice(0, 60), items, caveat: String(o.caveat ?? '').slice(0, 160), demo: o.demo === true };
}

/** Change an item's grams; calories and macros scale with it. */
export function regram(i: ScanItem, grams: number): ScanItem {
  const g = Math.max(0, Math.min(2000, Math.round(grams)));
  const f = i.grams > 0 ? g / i.grams : 0;
  return { ...i, grams: g, kcal: Math.round(i.kcal * f), p: r1(i.p * f), c: r1(i.c * f), f: r1(i.f * f) };
}

export function totals(items: ScanItem[]) {
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  return { kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) };
}

/** Shrink a camera photo to ~1024 px JPEG so uploads are fast and cheap. */
export async function downscale(file: Blob, max = 1024): Promise<{ base64: string; mediaType: string; preview: string }> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const preview = canvas.toDataURL('image/jpeg', 0.8);
  return { base64: preview.split(',')[1], mediaType: 'image/jpeg', preview };
}
