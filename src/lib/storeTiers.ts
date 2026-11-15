// Grocery price tiers by chain. These are broad, well-known reputations of each
// chain's typical pricing in the U.S., NOT live prices: shelf prices vary by
// item, region and week. The UI says exactly that and never shows a percentage
// saving it can't back up. Unknown stores get no tier rather than a guess.

import type { Place } from './places';

export type Tier = 'budget' | 'bulk' | 'standard' | 'premium';

const RULES: [Tier, RegExp][] = [
  ['bulk', /\b(costco|sam'?s club|bj'?s wholesale|bjs wholesale)\b/i],
  ['budget', /\b(aldi|lidl|save[- ]?a[- ]?lot|grocery outlet|winco|food 4 less|foods co|price ?rite|market basket|smart ?& ?final|walmart|cash saver|fiesta mart|el super|aldi süd|aldi nord|piggly wiggly|save mart|ruler foods|shop ?'?n ?save)\b/i],
  ['premium', /\b(whole foods|sprouts|the fresh market|fresh market|erewhon|earth fare|natural grocers|mom'?s organic|gelson'?s|bristol farms|eataly)\b/i],
  ['standard', /\b(kroger|giant|weis|safeway|albertsons|publix|h-?e-?b|meijer|food lion|stop ?& ?shop|shoprite|hy-?vee|target|harris teeter|wegmans|vons|ralphs|fred meyer|king soopers|jewel|acme|tops|price chopper|hannaford|winn-?dixie|ingles|giant eagle|schnucks|dillons|smith'?s|fry'?s|qfc|pavilions|randalls|tom thumb|lowes foods|bi-?lo|food city|redner'?s|karns|trader joe'?s)\b/i],
];

export function tierOf(p: Pick<Place, 'name' | 'brand' | 'kind'>): Tier | null {
  const s = `${p.name} ${p.brand ?? ''}`;
  for (const [t, re] of RULES) if (re.test(s)) return t;
  return null;
}

export const TIER_LABEL: Record<Tier, string> = {
  budget: 'Usually budget-friendly',
  bulk: 'Bulk · membership',
  standard: 'Standard prices',
  premium: 'Usually pricier',
};

export const TIER_NOTE: Record<Tier, string> = {
  budget: 'Known for low everyday prices and store brands.',
  bulk: 'Lower unit prices in big packs; needs a paid membership. Best for large households or long preps.',
  standard: 'Typical supermarket prices; store brands and weekly sales help.',
  premium: 'Known for higher prices; fine for specific items.',
};

// Extra "distance" (km) each tier costs in the ranking: a discount grocer a few
// km farther still ranks first, but not one across town.
const PENALTY: Record<Tier | 'none', number> = { budget: 0, bulk: 2, standard: 4, none: 4.5, premium: 8 };

/** Grocery-type places only, ranked by budget-friendliness with distance as the tie-breaker. */
export function rankForBudget(places: Place[], opts: { people?: number; days?: number } = {}): (Place & { tier: Tier | null })[] {
  const bulkOk = (opts.people ?? 1) >= 3 || (opts.days ?? 0) >= 6;
  const score = (p: { tier: Tier | null; distanceKm: number }) => p.distanceKm + (p.tier === 'bulk' && !bulkOk ? 4 : PENALTY[p.tier ?? 'none']);
  return places
    .filter((p) => p.kind === 'grocery' || p.kind === 'discount' || p.kind === 'market')
    .map((p) => ({ ...p, tier: tierOf(p) ?? (p.kind === 'discount' ? ('budget' as Tier) : null) }))
    .sort((a, b) => score(a) - score(b));
}

/** One-line advice tying the plan's estimated grocery total to the budget. */
export function shopAdvice(estimate: number, budgetForDays: number | null, cheapest?: { name: string; tier: Tier | null }) {
  if (budgetForDays === null) return cheapest?.tier === 'budget' ? `${cheapest.name} is usually the budget-friendly pick nearby.` : null;
  if (estimate <= budgetForDays) return 'This plan fits your budget at typical supermarket prices.';
  if (cheapest?.tier === 'budget') return `This plan is over budget at typical prices. ${cheapest.name} is usually cheaper, and store brands close more of the gap.`;
  return 'This plan is over budget at typical prices. Try the Budget saver plan, store brands, or swaps to beans and eggs.';
}
