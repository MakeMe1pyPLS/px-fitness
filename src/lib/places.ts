// Nearby food discovery using OpenStreetMap (free, no API key).
//  - Geocoding: Nominatim (end-user triggered searches only, per its usage policy)
//  - Places:    Overpass API
// OpenStreetMap has names, locations, cuisine, some diet tags and listed hours.
// It has NO prices, menus or nutrition, and hours may be out of date, so the
// UI never claims "open now" or menu nutrition from this data.
// For production, route these calls through a small server proxy with caching
// (see docs) so the app can switch providers without an app update.

export const PROVIDERS = {
  geocode: 'https://nominatim.openstreetmap.org/search',
  overpass: 'https://overpass-api.de/api/interpreter',
};
export const ATTRIBUTION = 'Place data © OpenStreetMap contributors, ODbL';

export type PlaceKind = 'grocery' | 'discount' | 'market' | 'restaurant' | 'fast_food' | 'cafe';

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  distanceKm: number;
  cuisine: string[];
  vegetarian: boolean | null; // null = not tagged
  vegan: boolean | null;
  takeaway: boolean | null;
  delivery: boolean | null;
  hoursText?: string; // as listed in OSM, unverified
  address?: string;
  website?: string;
  brand?: string;
}

export class PlacesError extends Error {
  constructor(public kind: 'offline' | 'blocked' | 'not_found' | 'rate_limited' | 'server', msg: string) { super(msg); }
}

/** Round to ~1 km so a precise location is never stored. */
export const coarse = (n: number) => Math.round(n * 100) / 100;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function getJSON(url: string, init?: RequestInit) {
  let res: Response;
  try { res = await fetch(url, init); }
  catch { throw new PlacesError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'blocked', 'Couldn’t reach the place search service.'); }
  if (res.status === 429) throw new PlacesError('rate_limited', 'The free place search is busy. Try again in a minute.');
  if (!res.ok) throw new PlacesError('server', `Place search returned an error (${res.status}).`);
  return res.json();
}

export async function geocode(q: string): Promise<{ label: string; lat: number; lon: number }> {
  const query = q.trim();
  if (!query) throw new PlacesError('not_found', 'Enter a city, ZIP or postcode.');
  const url = `${PROVIDERS.geocode}?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`;
  const data = await getJSON(url, { headers: { Accept: 'application/json' } });
  if (!Array.isArray(data) || !data.length) throw new PlacesError('not_found', `No location found for “${query}”.`);
  const top = data[0];
  const label = String(top.display_name ?? query).split(',').slice(0, 3).join(',').trim();
  return { label, lat: coarse(Number(top.lat)), lon: coarse(Number(top.lon)) };
}

const DISCOUNT_BRANDS = /aldi|lidl|save a lot|grocery outlet|food 4 less|winco|market basket|dollar general|walmart|costco|sam's club/i;

export function buildQuery(lat: number, lon: number, radiusM: number, kinds: ('food' | 'grocery')[]): string {
  const around = `(around:${radiusM},${lat},${lon})`;
  const parts: string[] = [];
  if (kinds.includes('grocery')) parts.push(`nwr["shop"~"^(supermarket|greengrocer|grocery|wholesale)$"]${around};`, `nwr["amenity"="marketplace"]${around};`);
  if (kinds.includes('food')) parts.push(`nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"]${around};`);
  return `[out:json][timeout:20];(${parts.join('')});out center tags 200;`;
}

export function parseOverpass(json: unknown, origin: { lat: number; lon: number }): Place[] {
  const els = (json as { elements?: Record<string, any>[] })?.elements ?? [];
  const out: Place[] = [];
  for (const e of els) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!t.name || lat === undefined || lon === undefined) continue;
    const kind: PlaceKind = t.amenity === 'marketplace' ? 'market'
      : t.shop ? (DISCOUNT_BRANDS.test(`${t.name} ${t.brand ?? ''}`) ? 'discount' : 'grocery')
      : t.amenity === 'fast_food' ? 'fast_food' : t.amenity === 'cafe' ? 'cafe' : 'restaurant';
    const yes = (v?: string) => (v === undefined ? null : v === 'yes' || v === 'only');
    const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') + (t['addr:city'] ? `, ${t['addr:city']}` : '');
    out.push({
      id: `${e.type}/${e.id}`,
      name: t.name,
      kind,
      lat, lon,
      distanceKm: haversineKm(origin, { lat, lon }),
      cuisine: (t.cuisine ?? '').split(';').map((s: string) => s.trim().replace(/_/g, ' ')).filter(Boolean),
      vegetarian: yes(t['diet:vegetarian']),
      vegan: yes(t['diet:vegan']),
      takeaway: yes(t.takeaway),
      delivery: yes(t.delivery),
      hoursText: t.opening_hours,
      address: addr.trim().replace(/^,\s*/, '') || undefined,
      website: t.website ?? t['contact:website'],
      brand: t.brand,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function searchPlaces(lat: number, lon: number, radiusKm: number, kinds: ('food' | 'grocery')[]): Promise<Place[]> {
  const body = 'data=' + encodeURIComponent(buildQuery(lat, lon, Math.round(radiusKm * 1000), kinds));
  const json = await getJSON(PROVIDERS.overpass, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return parseOverpass(json, { lat, lon });
}

export function directionsUrl(p: { lat: number; lon: number; name: string }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
}
export function osmUrl(p: { lat: number; lon: number }) {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=18/${p.lat}/${p.lon}`;
}
/** A maps search link: works even when live search is unavailable. */
export function mapsSearchUrl(what: string, where: string) {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${what} near ${where}`)}`;
}

/** General guidance when menu nutrition is unavailable, tailored to the goal. */
export function orderingTips(goal?: string): string[] {
  const base = ['Build the plate around a clear protein: grilled chicken, fish, beans, tofu, eggs or lean meat.', 'Add vegetables or a salad, and pick one main starch (rice, potatoes, bread or tortillas).', 'Ask for sauces and dressings on the side so you control the amount.'];
  if (goal === 'lose_fat') return [...base, 'Broth soups, salads with protein and grilled dishes tend to be filling for fewer calories. Fried dishes and creamy sauces add up quickly.'];
  if (goal === 'gain_weight' || goal === 'build_muscle' || goal === 'lean_muscle') return [...base, 'Rice bowls, burritos, pasta with meat and double-protein options make it easier to get enough food and protein.'];
  if (goal === 'endurance') return [...base, 'Before long sessions, carb-forward dishes like rice, pasta or potatoes are easy fuel.'];
  return base;
}
