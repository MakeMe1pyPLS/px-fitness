import React, { useMemo, useState } from 'react';
import { Icon, store, useData, useToast, type Route } from '../../components/core';
import { ATTRIBUTION, coarse, directionsUrl, geocode, mapsSearchUrl, orderingTips, osmUrl, PlacesError, searchPlaces, type Place, type PlaceKind } from '../../lib/places';
import { SubHead } from './DietHome';

const KIND_LABEL: Record<PlaceKind, string> = { grocery: 'Grocery', discount: 'Discount grocery', market: 'Market', restaurant: 'Restaurant', fast_food: 'Quick service', cafe: 'Café' };
type Status = { s: 'idle' } | { s: 'loading' } | { s: 'error'; kind: PlacesError['kind'] | 'geo'; msg: string } | { s: 'done'; at: string };

export function NearMeView({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const toast = useToast();
  const loc = data.nutrition.location;
  const miles = (data.profile?.unit ?? 'lb') === 'lb';
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>({ s: 'idle' });
  const [places, setPlaces] = useState<Place[]>([]);
  const [type, setType] = useState<'all' | 'grocery' | 'food'>('all');
  const [radius, setRadius] = useState(miles ? 3.2 : 3);
  const [veg, setVeg] = useState<'any' | 'vegetarian' | 'vegan'>(data.nutrition.prefs?.pattern === 'vegan' ? 'vegan' : data.nutrition.prefs?.pattern === 'vegetarian' ? 'vegetarian' : 'any');
  const [takeaway, setTakeaway] = useState(false);
  const [cuisine, setCuisine] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [askGeo, setAskGeo] = useState(false);

  const run = async (at: { lat: number; lon: number }, r = radius, t = type) => {
    setStatus({ s: 'loading' });
    try {
      const res = await searchPlaces(at.lat, at.lon, r, t === 'all' ? ['grocery', 'food'] : [t]);
      setPlaces(res);
      setStatus({ s: 'done', at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    } catch (e) {
      const err = e as PlacesError;
      setStatus({ s: 'error', kind: err.kind ?? 'server', msg: err.message });
    }
  };

  const searchText = async () => {
    setStatus({ s: 'loading' });
    try {
      const g = await geocode(q);
      store.setLocation(g);
      run(g);
    } catch (e) {
      const err = e as PlacesError;
      // Keep the typed place so map links still work.
      store.setLocation({ label: q.trim(), lat: NaN, lon: NaN });
      setStatus({ s: 'error', kind: err.kind ?? 'server', msg: err.message });
    }
  };

  const useDevice = () => {
    setAskGeo(false);
    if (!('geolocation' in navigator)) { setStatus({ s: 'error', kind: 'geo', msg: 'This browser can’t share location. Enter a city or ZIP instead.' }); return; }
    setStatus({ s: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (pos) => { const g = { label: 'Near you (approx.)', lat: coarse(pos.coords.latitude), lon: coarse(pos.coords.longitude) }; store.setLocation(g); run(g); },
      () => setStatus({ s: 'error', kind: 'geo', msg: 'Location wasn’t shared. That’s fine: enter a city or ZIP instead.' }),
      { maximumAge: 600000, timeout: 10000, enableHighAccuracy: false },
    );
  };

  const cuisines = useMemo(() => [...new Set(places.flatMap((p) => p.cuisine))].sort(), [places]);
  const filtered = places.filter((p) => {
    if (p.distanceKm > radius) return false;
    if (veg === 'vegetarian' && !(p.vegetarian || p.vegan) && p.kind !== 'grocery' && p.kind !== 'discount' && p.kind !== 'market') return false;
    if (veg === 'vegan' && !p.vegan && p.kind !== 'grocery' && p.kind !== 'discount' && p.kind !== 'market') return false;
    if (takeaway && !p.takeaway) return false;
    if (cuisine && !p.cuisine.includes(cuisine)) return false;
    return true;
  });
  const dist = (km: number) => (miles ? `${(km / 1.609).toFixed(1)} mi` : `${km.toFixed(1)} km`);
  const where = loc?.label || q || 'me';
  const hasCoords = loc && Number.isFinite(loc.lat);

  return (
    <div className="page">
      <SubHead title="Find food near me" go={go} />
      <section className="card stack">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) searchText(); }}>
          <input className="input grow" placeholder="City, ZIP or postcode" aria-label="City, ZIP or postcode" value={q} onChange={(e) => setQ(e.target.value)} data-testid="loc-input" autoComplete="postal-code" />
          <button className="btn btn-ink" disabled={!q.trim() || status.s === 'loading'} data-testid="loc-search">Search</button>
        </form>
        {!askGeo ? <button className="btn btn-outline" onClick={() => setAskGeo(true)} data-testid="use-location"><Icon.pin /> Use my location</button> : (
          <div className="why-box small stack" style={{ gap: 8 }}>
            <p>Your device location is used once to search nearby, rounded to about 1 km. No location history is saved. You can always type a city instead.</p>
            <div className="row"><button className="btn btn-ink btn-sm" onClick={useDevice} data-testid="geo-allow">Continue</button><button className="btn btn-ghost btn-sm" onClick={() => setAskGeo(false)}>Not now</button></div>
          </div>
        )}
        {loc && <p className="small muted">Location: <b>{loc.label}</b>{hasCoords ? '' : ' (not found on the map)'} · <button className="link" style={{ minHeight: 0, padding: 0 }} onClick={() => { store.setLocation(null); setPlaces([]); setStatus({ s: 'idle' }); }}>Clear</button></p>}
        {hasCoords && status.s !== 'loading' && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => run(loc!)}>Search again here</button>}
      </section>

      <section className="stack" aria-label="Filters">
        <div className="seg" role="group" aria-label="Place type">
          {([['all', 'All'], ['grocery', 'Groceries'], ['food', 'Restaurants']] as const).map(([id, t]) => <button key={id} aria-pressed={type === id} onClick={() => { setType(id); if (hasCoords) run(loc!, radius, id); }}>{t}</button>)}
        </div>
        <div className="chips">
          {(miles ? [1.6, 3.2, 8, 16] : [1, 3, 5, 10]).map((r) => <button key={r} className="chip" aria-pressed={radius === r} onClick={() => { setRadius(r); if (hasCoords && r > radius) run(loc!, r); }}>{miles ? `${Math.round(r / 1.609)} mi` : `${r} km`}</button>)}
        </div>
        <div className="chips">
          <button className="chip" aria-pressed={veg === 'vegetarian'} onClick={() => setVeg(veg === 'vegetarian' ? 'any' : 'vegetarian')}>Vegetarian</button>
          <button className="chip" aria-pressed={veg === 'vegan'} onClick={() => setVeg(veg === 'vegan' ? 'any' : 'vegan')}>Vegan</button>
          <button className="chip" aria-pressed={takeaway} onClick={() => setTakeaway(!takeaway)}>Takeout</button>
          <button className="chip" disabled title="Hours in OpenStreetMap can be out of date, so “open now” isn’t offered.">Open now</button>
          {cuisines.length > 0 && <select className="input" style={{ width: 'auto', minHeight: 44 }} aria-label="Cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)}><option value="">Any cuisine</option>{cuisines.map((c) => <option key={c}>{c}</option>)}</select>}
        </div>
        {(veg !== 'any' || takeaway) && <p className="small muted">Diet and takeout filters only match restaurants that list them in OpenStreetMap. Many don’t, so some good options may be hidden. Grocery stores stay in the list.</p>}
      </section>

      {status.s === 'loading' && <div className="stack" aria-busy="true" aria-label="Searching">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>}

      {status.s === 'error' && (
        <section className="card stack" role="alert" data-testid="near-error">
          <b>{status.kind === 'blocked' ? 'Live search isn’t available here' : status.kind === 'not_found' ? 'Location not found' : status.kind === 'geo' ? 'Location not shared' : 'Search didn’t work'}</b>
          <p className="small">{status.kind === 'blocked' ? 'This preview can’t connect to outside services. In the deployed app, search uses OpenStreetMap. Meanwhile, these searches open in your maps app:' : status.msg}</p>
          {(status.kind === 'blocked' || status.kind === 'server' || status.kind === 'rate_limited' || status.kind === 'offline') && (q || loc?.label) && <MapLinks where={where} />}
        </section>
      )}

      {status.s === 'done' && (
        <>
          <div className="row-between">
            <p className="small muted" data-testid="near-count">{filtered.length} place{filtered.length === 1 ? '' : 's'} · updated {status.at}</p>
            <div className="seg" role="group" aria-label="View"><button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button><button aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button></div>
          </div>
          {filtered.length === 0 ? (
            <div className="card stack"><p>No matching places in OpenStreetMap within {dist(radius)}.</p><p className="small muted">Try a wider radius or fewer filters. Coverage varies by area.</p><MapLinks where={where} /></div>
          ) : view === 'map' ? <RelativeMap places={filtered} radius={radius} dist={dist} /> : (
            <div className="stack">
              {filtered.slice(0, 40).map((p) => {
                const saved = data.nutrition.places.some((x) => x.id === p.id);
                return (
                  <article key={p.id} className="card card-tight stack" style={{ gap: 6 }} data-testid="place">
                    <div className="row-between" style={{ alignItems: 'flex-start' }}>
                      <div><b>{p.name}</b><div className="small muted">{KIND_LABEL[p.kind]}{p.cuisine.length ? ` · ${p.cuisine.slice(0, 3).join(', ')}` : ''} · {dist(p.distanceKm)}</div></div>
                      <button className="icon-btn" aria-pressed={saved} aria-label={saved ? `Unsave ${p.name}` : `Save ${p.name}`} style={{ color: saved ? 'var(--ember-deep)' : undefined }} onClick={() => { store.togglePlace({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, address: p.address }); toast(saved ? 'Removed' : 'Saved to favorites'); }}><Icon.star filled={saved} /></button>
                    </div>
                    {p.address && <span className="small">{p.address}</span>}
                    <div className="row wrap" style={{ gap: 6 }}>
                      {p.vegan && <span className="badge badge-moss">Vegan options listed</span>}
                      {!p.vegan && p.vegetarian && <span className="badge badge-moss">Vegetarian options listed</span>}
                      {p.takeaway && <span className="badge">Takeout</span>}
                      {p.delivery && <span className="badge">Delivery</span>}
                    </div>
                    {p.hoursText && <span className="small muted">Listed hours (may be out of date): {p.hoursText}</span>}
                    <span className="small muted">Prices and menu nutrition aren’t available for this place.</span>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <a className="btn btn-outline btn-sm" href={directionsUrl(p)} target="_blank" rel="noopener noreferrer">Directions</a>
                      <a className="btn btn-ghost btn-sm" href={osmUrl(p)} target="_blank" rel="noopener noreferrer">View on map</a>
                      {p.website && <a className="btn btn-ghost btn-sm" href={p.website} target="_blank" rel="noopener noreferrer">Website</a>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="small muted">{ATTRIBUTION}. Listings come from community-maintained map data and may be incomplete.</p>
        </>
      )}

      {status.s === 'idle' && !loc && <div className="card"><p className="muted">Search a city or ZIP to find grocery stores, markets and restaurants. Location is optional, and the rest of the app works without it.</p></div>}

      <section className="card stack" aria-labelledby="tips-h">
        <h2 id="tips-h" className="eyebrow">Ordering out, for your goal</h2>
        <p className="small muted">Menu nutrition isn’t available from this map data, so here’s general guidance instead. Where a chain publishes nutrition, its website or app is the reliable source.</p>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{orderingTips(data.profile?.goal).map((t) => <li key={t}>{t}</li>)}</ul>
      </section>

      {data.nutrition.places.length > 0 && (
        <section className="card" aria-labelledby="fav-h">
          <h2 id="fav-h" className="eyebrow" style={{ marginBottom: 6 }}>Saved places</h2>
          <div className="list">{data.nutrition.places.map((p) => (
            <div key={p.id} className="list-row"><span><b>{p.name}</b><br /><span className="small muted">{KIND_LABEL[p.kind as PlaceKind] ?? p.kind}{p.address ? ` · ${p.address}` : ''}</span></span>
              <span className="row"><a className="btn btn-ghost btn-sm" href={directionsUrl(p)} target="_blank" rel="noopener noreferrer">Go</a><button className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => store.togglePlace(p)}><Icon.trash /></button></span></div>
          ))}</div>
        </section>
      )}
    </div>
  );
}

function MapLinks({ where }: { where: string }) {
  return (
    <div className="row wrap" style={{ gap: 8 }} data-testid="map-links">
      {['grocery stores', 'discount grocery', 'healthy restaurants', 'meal prep delivery', 'farmers market'].map((w) => <a key={w} className="btn btn-outline btn-sm" href={mapsSearchUrl(w, where)} target="_blank" rel="noopener noreferrer">{w[0].toUpperCase() + w.slice(1)}</a>)}
    </div>
  );
}

/** Lightweight map: places plotted by bearing and distance from you. No tiles needed. */
function RelativeMap({ places, radius, dist }: { places: Place[]; radius: number; dist: (km: number) => string }) {
  const [sel, setSel] = useState<Place | null>(null);
  const R = 140;
  return (
    <div className="card stack">
      <svg viewBox="-150 -150 300 300" className="chart" role="img" aria-label={`Map of ${places.length} places within ${dist(radius)}`} style={{ maxWidth: 360, margin: '0 auto' }}>
        {[1, 0.5].map((f) => <circle key={f} r={R * f} fill="none" stroke="var(--line)" strokeDasharray={f === 1 ? undefined : '3 4'} />)}
        <text x="0" y={-R - 4} textAnchor="middle">N</text>
        <text x={R * 0.5 + 4} y="-4">{dist(radius / 2)}</text>
        <PlacePins places={places} R={R} radius={radius} onSel={setSel} sel={sel} />
        <circle r="6" fill="var(--ember)" stroke="var(--paper)" strokeWidth="2" />
      </svg>
      <p className="small muted">Your search point is at the center (approximate). Green: groceries and markets. Dark: restaurants. Tap a dot for details.</p>
      {sel && <p className="small"><b>{sel.name}</b> · {KIND_LABEL[sel.kind]} · {dist(sel.distanceKm)} · <a href={directionsUrl(sel)} target="_blank" rel="noopener noreferrer">Directions</a></p>}
    </div>
  );
}

function PlacePins({ places, R, radius, onSel, sel }: { places: Place[]; R: number; radius: number; onSel: (p: Place) => void; sel: Place | null }) {
  // Plot by offset from the saved (coarse) search origin.
  const data = useData();
  const o = data.nutrition.location;
  if (!o || !Number.isFinite(o.lat)) return null;
  return (
    <>
      {places.slice(0, 60).map((p) => {
        const dx = (p.lon - o.lon) * 111.32 * Math.cos((o.lat * Math.PI) / 180);
        const dy = (p.lat - o.lat) * 110.57;
        const x = (dx / radius) * R;
        const y = (-dy / radius) * R;
        const groc = p.kind === 'grocery' || p.kind === 'discount' || p.kind === 'market';
        return (
          <g key={p.id} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} onClick={() => onSel(p)} style={{ cursor: 'pointer' }} role="button" aria-label={p.name} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSel(p)}>
            <circle r={sel?.id === p.id ? 8 : 5.5} fill={groc ? 'var(--moss)' : 'var(--ink)'} stroke="var(--paper)" strokeWidth="1.5" />
          </g>
        );
      })}
    </>
  );
}
