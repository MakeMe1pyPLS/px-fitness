import React, { useState } from 'react';
import { ConfirmDialog, Icon, Sheet, store, useData, useToast, type Route } from '../../components/core';
import { budgetSummary, formatQty, groceryCost, packagesFor, priceOf, weeklyAmount } from '../../lib/nutrition';
import { ingredient, PRICE_SOURCE } from '../../lib/foods';
import { formatShortDate, toDateKey } from '../../lib/dates';
import type { AppData, Budget, GroceryItem } from '../../lib/types';
import { SubHead } from './DietHome';
import { money } from './shared';

const ORDER = ['Produce', 'Protein', 'Dairy & eggs', 'Grains & bread', 'Frozen', 'Pantry', 'Added by you'];
const STAPLES = new Set(['olive-oil', 'seasoning', 'soy-sauce']);

export function GroceryView({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const toast = useToast();
  const [add, setAdd] = useState('');
  const [priceFor, setPriceFor] = useState<GroceryItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const list = data.nutrition.grocery;
  const cost = groceryCost(data, list.filter((g) => !g.checked));
  const fullCost = groceryCost(data, list);
  const b = budgetSummary(data);
  const unit = data.profile?.unit ?? 'lb';
  const active = data.nutrition.plans.find((p) => p.status === 'active');
  const groups = ORDER.map((c) => [c, list.filter((g) => g.category === c)] as const).filter(([, g]) => g.length);

  return (
    <div className="page">
      <SubHead title="Grocery list" go={go} />
      <section className="card stack">
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="metric"><b className="tnum" data-testid="grocery-total">{money(data, fullCost.total)}</b><span>est. total</span></div>
          <div className="metric"><b className="tnum">{money(data, cost.total)}</b><span>left to buy</span></div>
        </div>
        {b && b.groceryBudget > 0 && <p className="small">Weekly grocery budget {money(data, b.groceryBudget)}; {money(data, Math.max(0, b.groceryBudget - b.spentGrocery))} not yet spent this week. {fullCost.total > b.groceryBudget - b.spentGrocery ? <b>This list is estimated to run over.</b> : 'This list should fit.'}</p>}
        <p className="small muted">Totals count whole packages. Prices are estimates: BLS U.S. averages (Sep 2026) where available, otherwise labeled estimates. Tap any price to set your store’s. Stock and prices at a specific store aren’t known.{fullCost.unknown ? ` ${fullCost.unknown} added item(s) have no price.` : ''}</p>
      </section>

      <form className="row" onSubmit={(e) => { e.preventDefault(); store.addGrocery(add); setAdd(''); }}>
        <input className="input grow" placeholder="Add an item" aria-label="Add an item" value={add} onChange={(e) => setAdd(e.target.value)} data-testid="grocery-add" />
        <button className="btn btn-ink" disabled={!add.trim()}>Add</button>
      </form>

      {!list.length && <div className="card"><p className="muted">Your list is empty. Create a plan in <button className="link" onClick={() => go('diet-prep')}>Meal Prep</button> or add items from any recipe.</p></div>}

      {groups.map(([cat, items]) => (
        <section key={cat} className="card" aria-labelledby={`gc-${cat}`}>
          <h2 id={`gc-${cat}`} className="eyebrow" style={{ marginBottom: 6 }}>{cat}</h2>
          <ul className="grocery">
            {items.map((g) => {
              const pk = g.ingredientId && g.grams ? packagesFor(data, g.ingredientId, g.grams) : null;
              return (
                <li key={g.id} data-checked={g.checked}>
                  <label className="g-main">
                    <input type="checkbox" className="big-check" checked={g.checked} onChange={() => store.toggleGrocery(g.id)} aria-label={`${g.name}${g.checked ? ', bought' : ''}`} data-testid="grocery-check" />
                    <span className="grow">
                      <b>{g.name}</b>
                      <span className="small muted" style={{ display: 'block' }}>
                        {g.ingredientId && g.grams ? `Need ${formatQty(g.ingredientId, g.grams, unit)}` : ''}{pk ? ` · buy ${pk.count} × ${pk.label}` : ''}{g.note ? ` · ${g.note}` : ''}
                        {g.ingredientId && STAPLES.has(g.ingredientId) ? ' · pantry staple, you may have it' : ''}
                      </span>
                    </span>
                  </label>
                  {pk ? (
                    <button className="price-btn tnum" onClick={() => setPriceFor(g)} aria-label={`Price of ${g.name}: ${money(data, pk.cost)}, ${pk.sourceLabel}. Edit`} data-testid={`price-${g.ingredientId}`}>
                      {money(data, pk.cost)}<span className={'src src-' + pk.source}>{pk.source === 'bls' ? 'BLS' : pk.source === 'you' ? 'yours' : 'est.'}</span>
                    </button>
                  ) : g.manual ? <button className="icon-btn" aria-label={`Remove ${g.name}`} onClick={() => store.removeGrocery(g.id)}><Icon.trash /></button> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {list.length > 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-outline grow" onClick={() => store.clearCheckedGrocery()}>Remove bought items</button>
          {active && <button className="btn btn-outline grow" onClick={() => setConfirm(true)}>Rebuild from plan</button>}
          {cost.total > 0 && list.some((g) => g.checked) && <button className="btn btn-ink grow" onClick={() => { store.addSpend({ date: toDateKey(new Date()), amount: Math.round(groceryCost(data, list.filter((g) => g.checked)).total * 100) / 100, kind: 'grocery', note: 'Estimated from checked items' }); toast('Logged as an estimate. Edit it in Food budget with your receipt total.'); }}>Log checked as spent</button>}
        </div>
      )}
      {priceFor && <PriceSheet data={data} item={priceFor} onClose={() => setPriceFor(null)} />}
      {confirm && <ConfirmDialog title="Rebuild from plan?" body="Quantities are recalculated from your meal plan. Checked items and items you added stay." confirmLabel="Rebuild" onCancel={() => setConfirm(false)} onConfirm={() => { store.regenerateGrocery(); setConfirm(false); toast('List rebuilt'); }} />}
    </div>
  );
}

function PriceSheet({ data, item, onClose }: { data: AppData; item: GroceryItem; onClose: () => void }) {
  const id = item.ingredientId!;
  const p = priceOf(data, id);
  const ing = ingredient(id);
  const [price, setPrice] = useState(String(p.price));
  const [size, setSize] = useState(String(Math.round(p.pkgGrams)));
  return (
    <Sheet title={`Price: ${ing.name}`} onClose={onClose}>
      <div className="stack-lg">
        <p className="small muted">Current: {money(data, p.price)} for {ing.pkg.label} ({Math.round(p.pkgGrams)} g). Source: {p.sourceLabel}.</p>
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow"><label className="label" htmlFor="pp">Price you pay</label><input id="pp" className="input tnum" type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="price-input" /></div>
          <div className="field grow"><label className="label" htmlFor="ps">Package size (g)</label><input id="ps" className="input tnum" type="number" inputMode="numeric" min={1} value={size} onChange={(e) => setSize(e.target.value)} /></div>
        </div>
        <p className="small muted">1 lb = 454 g · 1 oz = 28 g</p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {data.nutrition.prices[id] ? <button className="btn btn-ghost" onClick={() => { store.setPrice(id, null); onClose(); }}>Reset to {ing.pkg.source === 'bls' ? 'BLS average' : 'estimate'}</button> : <span />}
          <button className="btn btn-ink" disabled={!(Number(price) >= 0) || !(Number(size) > 0)} onClick={() => { store.setPrice(id, Number(price), Number(size)); onClose(); }} data-testid="price-save">Save price</button>
        </div>
        <p className="small muted">Default sources: {PRICE_SOURCE.bls} ({'"BLS"'}) or {PRICE_SOURCE.estimate.toLowerCase()} ({'"est."'}).</p>
      </div>
    </Sheet>
  );
}

export function BudgetView({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const toast = useToast();
  const cur = data.nutrition.budget;
  const [b, setB] = useState<Budget>(cur ?? { amount: 75, period: 'week', scope: 'groceries', eatingOutShare: 0.2, currency: 'USD' });
  const [spend, setSpend] = useState({ amount: '', kind: 'grocery' as 'grocery' | 'eating_out', note: '' });
  const s = budgetSummary(data);
  const set = (p: Partial<Budget>) => setB((x) => ({ ...x, ...p }));
  const ws = data.nutrition.spending.slice().sort((a, b2) => b2.date.localeCompare(a.date)).slice(0, 20);
  return (
    <div className="page">
      <SubHead title="Food budget" go={go} />
      {s && (
        <section className="card stack" aria-label="This week">
          <h2 className="eyebrow">This week</h2>
          <div className="budget-bar" aria-hidden><i style={{ width: `${Math.min(100, (s.spent / Math.max(1, s.weekly)) * 100)}%` }} />{s.plannedGrocery > 0 && <em style={{ left: `${Math.min(100, (s.spent / Math.max(1, s.weekly)) * 100)}%`, width: `${Math.min(100, (s.plannedGrocery / Math.max(1, s.weekly)) * 100)}%` }} />}</div>
          <div className="metrics">
            <div className="metric"><b className="tnum">{money(data, s.weekly)}</b><span>budget</span></div>
            <div className="metric"><b className="tnum">{money(data, s.spent)}</b><span>spent (logged)</span></div>
            <div className="metric"><b className="tnum" data-testid="budget-remaining">{money(data, s.remaining)}</b><span>remaining</span></div>
          </div>
          <div className="list small">
            {s.plannedGrocery > 0 && <div className="list-row"><span>Planned groceries (active meal plan)</span><b className="tnum">{money(data, s.plannedGrocery)}</b></div>}
            {s.groceryBudget > 0 && <div className="list-row"><span>Grocery budget</span><b className="tnum">{money(data, s.groceryBudget)}</b></div>}
            {s.outBudget > 0 && <div className="list-row"><span>Eating-out budget · spent</span><b className="tnum">{money(data, s.outBudget)} · {money(data, s.spentOut)}</b></div>}
            <div className="list-row"><span>Per day · per meal{(data.nutrition.prefs?.people ?? 1) > 1 ? ' · per person' : ''}</span><b className="tnum">{money(data, s.perDay)} · {money(data, s.perMeal)}{(data.nutrition.prefs?.people ?? 1) > 1 ? ` · ${money(data, s.perPerson)}` : ''}</b></div>
          </div>
          {s.overspendWeeks >= 2 && <p className="small why-box">Logged grocery spending went over budget in {s.overspendWeeks} of the last 4 weeks. Meal Prep will start with a budget-saver plan.</p>}
        </section>
      )}

      <section className="card stack-lg" aria-label="Set budget">
        <h2 className="eyebrow">{cur ? 'Edit budget' : 'Set a budget'}</h2>
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow"><label className="label" htmlFor="ba">Amount</label><input id="ba" className="input tnum" type="number" inputMode="decimal" min={0} value={b.amount} onChange={(e) => set({ amount: Math.max(0, Number(e.target.value)) })} data-testid="budget-amount" /></div>
          <div className="field"><div className="label">Per</div><div className="seg" role="group" aria-label="Period">{(['day', 'week', 'month'] as const).map((p) => <button key={p} aria-pressed={b.period === p} onClick={() => set({ period: p })} data-testid={`period-${p}`}>{p}</button>)}</div></div>
        </div>
        <div className="field"><div className="label">Covers</div><div className="chips" role="radiogroup" aria-label="Budget covers">{([['groceries', 'Groceries only'], ['eating_out', 'Eating out only'], ['combined', 'Both']] as const).map(([id, t]) => <button key={id} role="radio" aria-checked={b.scope === id} className="chip" onClick={() => set({ scope: id })}>{t}</button>)}</div></div>
        {b.scope === 'combined' && (
          <div className="field"><label className="label" htmlFor="bs">Eating-out share: {Math.round(b.eatingOutShare * 100)}%</label><input id="bs" type="range" min={0} max={0.8} step={0.05} value={b.eatingOutShare} onChange={(e) => set({ eatingOutShare: Number(e.target.value) })} /></div>
        )}
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow"><label className="label" htmlFor="bm">Max per meal <span className="muted">(optional)</span></label><input id="bm" className="input tnum" type="number" inputMode="decimal" min={0} value={b.perMeal ?? ''} onChange={(e) => set({ perMeal: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })} /></div>
          <div className="field"><label className="label" htmlFor="bc">Currency</label><select id="bc" className="input" value={b.currency} onChange={(e) => set({ currency: e.target.value as Budget['currency'] })}>{['USD', 'CAD', 'GBP', 'EUR'].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        {b.currency !== 'USD' && <p className="small why-box">Default prices are U.S. figures. Edit prices on your grocery list to get accurate totals in {b.currency}.</p>}
        <p className="small muted">{b.amount > 0 ? `That’s about ${money({ ...data, nutrition: { ...data.nutrition, budget: b } }, weeklyAmount(b))} a week.` : ''}</p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {cur ? <button className="btn btn-ghost" onClick={() => { store.setBudget(null); toast('Budget removed'); }}>Remove budget</button> : <span />}
          <button className="btn btn-ink" disabled={!(b.amount > 0)} onClick={() => { store.setBudget(b); toast('Budget saved'); }} data-testid="budget-save">Save budget</button>
        </div>
      </section>

      <section className="card stack" aria-label="Spending">
        <h2 className="eyebrow">Log spending</h2>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); const a = Number(spend.amount); if (!(a > 0)) return; store.addSpend({ date: toDateKey(new Date()), amount: a, kind: spend.kind, note: spend.note.trim() || undefined }); setSpend({ ...spend, amount: '', note: '' }); toast('Spending logged'); }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input tnum" style={{ width: 110 }} type="number" inputMode="decimal" min={0} step="0.01" placeholder="Amount" aria-label="Amount spent" value={spend.amount} onChange={(e) => setSpend({ ...spend, amount: e.target.value })} data-testid="spend-amount" />
            <div className="seg" role="group" aria-label="Spending type"><button type="button" aria-pressed={spend.kind === 'grocery'} onClick={() => setSpend({ ...spend, kind: 'grocery' })}>Groceries</button><button type="button" aria-pressed={spend.kind === 'eating_out'} onClick={() => setSpend({ ...spend, kind: 'eating_out' })}>Eating out</button></div>
          </div>
          <input className="input" placeholder="Note (optional)" aria-label="Note" value={spend.note} onChange={(e) => setSpend({ ...spend, note: e.target.value })} />
          <button className="btn btn-outline" disabled={!(Number(spend.amount) > 0)} data-testid="spend-add">Add</button>
        </form>
        {ws.length > 0 && <div className="list small">{ws.map((x) => <div key={x.id} className="list-row"><span>{formatShortDate(x.date)} · {x.kind === 'grocery' ? 'Groceries' : 'Eating out'}{x.note ? ` · ${x.note}` : ''}</span><span className="row"><b className="tnum">{money(data, x.amount)}</b><button className="icon-btn" aria-label="Delete entry" onClick={() => store.removeSpend(x.id)}><Icon.trash /></button></span></div>)}</div>}
      </section>
    </div>
  );
}
