import React, { useEffect, useState } from 'react';
import { Icon, ToastProvider, fmtClock, store, useData, useNow, useRoute, type Route } from './components/core';
import { activeSession } from './lib/planner';
import { Landing } from './screens/Landing';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Complete, Workout } from './screens/Workout';
import { Progress } from './screens/Progress';
import { Insights } from './screens/Insights';
import { You } from './screens/You';
import { DietHome, MealsView, SavedView } from './screens/diet/DietHome';
import { MealPrepView } from './screens/diet/MealPrep';
import { BudgetView, GroceryView } from './screens/diet/GroceryBudget';
import { NearMeView } from './screens/diet/NearMe';
import { PrefsView } from './screens/diet/Prefs';
import { Coaching } from './screens/coach/Coaching';
import { BizClients, BizDesk, BizPayments, BizSchedule, BizSetup } from './screens/coach/Business';
import { BRAND } from './brand';

const COACH_TABS: { id: Route; label: string; icon: keyof typeof Icon }[] = [
  { id: 'biz', label: 'Desk', icon: 'desk' },
  { id: 'biz-clients', label: 'Clients', icon: 'people' },
  { id: 'biz-schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'biz-pay', label: 'Payments', icon: 'money' },
  { id: 'biz-setup', label: 'Setup', icon: 'gear' },
];

const TABS: { id: Route; label: string; icon: keyof typeof Icon }[] = [
  { id: 'home', label: 'Today', icon: 'today' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'diet', label: 'Meals', icon: 'diet' },
  { id: 'insights', label: 'Insights', icon: 'insight' },
  { id: 'you', label: 'You', icon: 'you' },
];

function LivePill({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const s = activeSession(data)!;
  const now = useNow(1000);
  return (
    <button className="live-pill" onClick={() => go('workout')} aria-label={`Return to workout ${s.name}`}>
      <span className="pulse" aria-hidden />{s.name}<span className="tnum" style={{ opacity: 0.7 }}>{fmtClock((now - new Date(s.startedAt).getTime()) / 1000)}</span>
    </button>
  );
}

function Shell() {
  const data = useData();
  const hasProfile = !!data.profile;
  const [route, go] = useRoute(hasProfile ? 'home' : 'welcome');
  const [completeId, setCompleteId] = useState<string | null>(null);
  const active = activeSession(data);

  // Guard: app screens need a profile.
  const coachView = data.coach.viewAsCoach;
  const isBiz = route.startsWith('biz');
  // Coach tools don't need a client profile; client screens do. Coaching (booking) is public.
  const appRoute: Route = isBiz ? (coachView ? route : 'home') : !hasProfile && !['welcome', 'onboarding', 'coach'].includes(route) ? 'welcome' : coachView && !['coach', 'welcome', 'onboarding'].includes(route) ? 'biz' : route;

  useEffect(() => {
    document.documentElement.dataset.motion = data.settings.reducedMotion === 'on' ? 'reduced' : '';
  }, [data.settings.reducedMotion]);

  useEffect(() => {
    const titles: Partial<Record<Route, string>> = { coach: 'Coaching', biz: 'Business desk', 'biz-clients': 'Clients', 'biz-schedule': 'Schedule', 'biz-pay': 'Payments', 'biz-setup': 'Setup', diet: 'Meals', 'diet-prep': 'Meal prep', 'diet-grocery': 'Grocery list', 'diet-near': 'Food near me', 'diet-budget': 'Food budget', 'diet-prefs': 'Nutrition preferences', 'diet-meals': 'Today’s meals', 'diet-saved': 'Saved meals', home: 'Today', workout: 'Workout', progress: 'Progress', insights: 'Insights', you: 'You', onboarding: 'Set up' };
    document.title = titles[appRoute] ? `${titles[appRoute]} · ${BRAND.name}` : `${BRAND.name} — ${BRAND.short}`;
  }, [appRoute]);

  if (completeId) return <Complete id={completeId} go={(r) => { setCompleteId(null); go(r); }} />;
  if (appRoute === 'welcome') return <Landing hasProfile={hasProfile} onStart={() => go('onboarding')} onOpen={() => go('home')} onBook={() => go('coach')} onCoach={() => { store.setCoach({ viewAsCoach: true }); go('biz'); }} />;
  if (appRoute === 'onboarding') return hasProfile ? <Landing hasProfile onStart={() => go('home')} onOpen={() => go('home')} /> : <Onboarding onDone={() => go('home')} onExit={() => go('welcome')} />;
  if (appRoute === 'workout') return <Workout go={go} onComplete={(id) => setCompleteId(id)} />;
  const tabs = coachView ? COACH_TABS : TABS;

  return (
    <>
      {data.settings.sampleData && <div className="banner" role="note"><span>Sample data: made up for demo purposes</span><button className="btn btn-ghost btn-sm" onClick={() => go('you')}>Manage</button></div>}
      {(store.lastError || !store.persistent) && <div className="banner warn" role="alert">{store.lastError ?? 'This browser is blocking storage. Data will be lost when you close the page.'}</div>}
      <div className="app">
        <main id="main">
          {appRoute === 'home' && <Home go={go} />}
          {appRoute === 'progress' && <Progress go={go} />}
          {appRoute === 'insights' && <Insights go={go} />}
          {appRoute === 'you' && <You go={go} />}
          {appRoute === 'coach' && <Coaching go={go} />}
          {appRoute === 'biz' && <BizDesk go={go} />}
          {appRoute === 'biz-clients' && <BizClients />}
          {appRoute === 'biz-schedule' && <BizSchedule />}
          {appRoute === 'biz-pay' && <BizPayments />}
          {appRoute === 'biz-setup' && <BizSetup go={go} />}
          {appRoute === 'diet' && <DietHome go={go} />}
          {appRoute === 'diet-meals' && <MealsView go={go} />}
          {appRoute === 'diet-prep' && <MealPrepView go={go} />}
          {appRoute === 'diet-budget' && <BudgetView go={go} />}
          {appRoute === 'diet-grocery' && <GroceryView go={go} />}
          {appRoute === 'diet-near' && <NearMeView go={go} />}
          {appRoute === 'diet-prefs' && <PrefsView go={go} />}
          {appRoute === 'diet-saved' && <SavedView go={go} />}
        </main>
      </div>
      {active && !coachView && <LivePill go={go} />}

      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {(() => { const idx = tabs.findIndex((t) => appRoute === t.id || (t.id === 'diet' && appRoute.startsWith('diet'))); return idx >= 0 && (hasProfile || coachView) ? <span className="nav-ind" aria-hidden style={{ width: `calc(100% / ${tabs.length} - 40px)`, transform: `translateX(calc(${idx} * (100% + 40px) + 20px))` }} /> : null; })()}
          {(hasProfile || coachView ? tabs : []).map((t) => {
            const I = Icon[t.icon];
            return (
              <a key={t.id} href={'#' + t.id} aria-current={appRoute === t.id || (t.id === 'diet' && appRoute.startsWith('diet')) ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
                <I size={22} />{t.label}
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}
