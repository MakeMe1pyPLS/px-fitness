import React, { useEffect, useState } from 'react';
import { BRAND } from '../brand';
import { Icon, store, useCloud } from '../components/core';
import { AuthSheet } from '../components/Account';

// The opening plays once per browser session and never blocks input: the
// overlay ignores pointer events and is skipped entirely under reduced motion.
function useIntro() {
  const [show] = useState(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      if (sessionStorage.getItem('kova:intro')) return false;
      sessionStorage.setItem('kova:intro', '1');
    } catch { /* storage blocked: still fine to play */ }
    return true;
  });
  const [done, setDone] = useState(!show);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setDone(true), 1600);
    return () => clearTimeout(t);
  }, [show]);
  return !done;
}

export function Landing({ onStart, hasProfile, onOpen, onBook, onCoach }: { onStart: () => void; hasProfile: boolean; onOpen: () => void; onBook?: () => void; onCoach?: () => void }) {
  const intro = useIntro();
  const c = useCloud();
  const [signin, setSignin] = useState(false);
  const canSignIn = c.enabled && !c.session && !hasProfile;
  return (
    <div className="landing">
      {intro && (
        <div className="intro" aria-hidden>
          <div className="intro-word">{BRAND.monogram}<i>.</i></div>
        </div>
      )}
      <div className="landing-inner">
        <header className="landing-nav">
          <span className="wordmark" aria-label={BRAND.name}><i aria-hidden />{BRAND.wordmark}</span>
          {hasProfile ? <button className="btn btn-outline btn-sm" onClick={onOpen}>Open app</button> : canSignIn ? <button className="btn btn-outline btn-sm" onClick={() => setSignin(true)} data-testid="landing-signin">Sign in</button> : <button className="btn btn-outline btn-sm" onClick={onStart}>Get started</button>}
        </header>

        <main>
          <section className="hero">
            <span className="eyebrow" style={{ color: 'var(--night-ink-2)' }}>Your fitness, your pace</span>
            <h1 className="hero-title">
              <span className="hero-line"><span>Build strength</span></span>
              <span className="hero-line"><span>for the life</span></span>
              <span className="hero-line"><span className="ember">you live.</span></span>
            </h1>
            <p className="hero-sub">{BRAND.tagline}</p>
            <div className="hero-cta">
              <button className="btn btn-primary btn-lg" onClick={hasProfile ? onOpen : onStart} data-testid="cta-start">
                {hasProfile ? 'Open today' : 'Build my plan'} <Icon.arrow />
              </button>
              {onBook && <button className="btn btn-outline btn-lg" onClick={onBook} data-testid="cta-book">Book a session</button>}
            </div>
            {!hasProfile && <span className="small" style={{ color: 'var(--night-ink-2)' }}>About a minute to set up. No account needed.</span>}
            {signin && <AuthSheet onClose={() => setSignin(false)} then={() => { if (store.get().profile) onOpen(); }} />}
            <div className="strip-demo" aria-hidden>
              {['d', '', 's', 'd', '', 'x', ''].map((c, i) => <div key={i} className={c} style={{ animationDelay: `${600 + i * 60}ms` }} />)}
            </div>
          </section>

          <section className="features" aria-label="What you get">
            <div className="feature"><span className="n">01</span><h3>Coaching that fits</h3><p>Pick one, two or three sessions a week. More sessions cost less each, and your coach plans the week with you.</p></div>
            <div className="feature"><span className="n">02</span><h3>Log between sets</h3><p>Last time’s numbers are already filled in. Tap to confirm a set, and the rest timer starts on its own.</p></div>
            <div className="feature"><span className="n">03</span><h3>Meals on a budget</h3><p>Meal prep, a grocery list with real average prices, and food near you that fits your goal and what you can spend.</p></div>
            <div className="feature"><span className="n">04</span><h3>Check-ins that listen</h3><p>A quick chat about sleep, energy and time. The plan flexes with you, and patterns show up with the evidence behind them.</p></div>
          </section>
        </main>

        <footer className="landing-foot">
          <span>{BRAND.name} · {BRAND.short} Fitness guidance, not medical advice.</span>
          <span className="row" style={{ gap: 12 }}>Prototype data stays on this device.{onCoach && <button className="link" style={{ color: 'var(--night-ink)', minHeight: 0 }} onClick={onCoach} data-testid="cta-coach">Coach login (preview)</button>}</span>
        </footer>
      </div>
    </div>
  );
}
