# Kova: Stage 1 Discovery Report

_Prepared Oct 27, 2026. "Kova" is a placeholder name; change it in `src/brand.ts`._

## 1. What exists

Nothing yet. No repository or prior build was provided, so this is a fresh start. The build environment couldn't download packages, which ruled out installing Next.js or Supabase directly. The app is plain **React 19 + TypeScript**, bundled with esbuild into a single HTML file. All of the app logic is framework-free TypeScript in `src/lib/`, and it moves into Next.js unchanged.

## 2. Working now (verified)

- Onboarding (6 steps, about a minute) that generates a plan from goal, experience, equipment, days and minutes
- Today screen with a one-tap start, a short version, a no-guilt skip with reasons, and a visible "why" behind every suggestion
- Workout logging: last time's numbers prefilled, one tap per set, an automatic rest timer, swap or add exercises, edit mistakes. The session survives a refresh or reload.
- Daily check-in (energy, mood, stress, soreness, sleep, available time, note), every field optional and editable
- Progress: consistency (planned vs done), weekly volume, personal bests, per-exercise trend (estimated 1RM labelled as an estimate), editable history
- Insights engine: six transparent rules, minimum-sample gates, evidence counts, accept / not now / "this isn't right", plus outcome tracking (plan adherence 14 days before vs after)
- Settings: edit profile (rebuilds the plan), per-rule opt-out, reduced motion, export as JSON, delete check-ins, delete everything, labelled sample data
- Tests: 21 unit tests on the logic and 20 end-to-end browser journeys at iPhone size, all passing

## 3. Incomplete / not built yet

- **Accounts and cloud sync.** Data lives only in the browser on one device. A Supabase schema with row-level security is ready in `supabase/migrations/` but not connected.
- No push reminders, wearable or Apple Health import, or nutrition
- No exercise demo videos or illustrations. There's a one-line form cue per exercise.
- Template editing outside a workout, custom exercises, and supersets aren't built
- Schedule changes aren't versioned, so changing training days re-labels past days against the new schedule
- The font (Archivo) loads from Google Fonts. Self-host it for production.

## 4. Competitors (verified Oct 2026; prices are US list prices from third-party reviews, so check in-store before quoting)

| App | Core strength | Price | Gap we can exploit |
|---|---|---|---|
| **Strong** | Fastest pure logger, clean export | $29.99/yr, $99.99 lifetime | No programming, no recovery or readiness awareness |
| **Hevy** | Generous free tier, social feed, Hevy Trainer | $23.99/yr, $74.99 lifetime | Free tier caps routines and history; ignores recovery data |
| **Fitbod** | Auto-generated workouts | $15.99/mo or $95.99/yr, no free tier | Prescribes but doesn't explain; no HRV, sleep or readiness inputs |
| **Freeletics** | Bodyweight AI coach | Roughly $35/mo or $100/yr (sources vary) | Bodyweight-centric |
| **Strava** | Community, segments | $11.99/mo or $79.99/yr | Cardio-first; free log limited to 30 days |
| **Nike Training Club** | Free trainer-led library | Free | No individualized programming |
| **WHOOP / Oura** | Recovery and readiness scores | WHOOP $199–359/yr; Oura $349–399 ring + ~$70/yr | Hardware-gated scores; don't build or log strength sessions |
| **MyFitnessPal** | Nutrition logging | ~$80/yr Premium | Recent reviews skew negative after features moved behind the paywall and a redesign added taps |
| **Apple Fitness+** | Guided classes | $9.99/mo or $79.99/yr | Apple-only; not adaptive to schedule |

**Takeaway:** the market splits into loggers (fast but passive), generators (prescriptive and opaque) and wearables (readiness scores, expensive hardware). None of them connect how the user says they feel with whether they actually train, then adapt the plan in plain language.

## 5. Differentiation

Research on exercise dropout points the same way. In the STRRIDE trials, about two-thirds of dropouts happened in the first month, during the ramp-up period, and lack of time was the most common reason (40%) (ACSM, 2022). So the product optimizes for **adherence through flexibility**, not intensity:

1. **The short version is first-class.** Every session has a roughly 15–20-minute version that counts fully.
2. **Skipping is data, not failure.** Reasons feed the insights. There's no streak to lose and no shame copy (an e2e test checks for this).
3. **Check-in → suggestion → explanation.** Low energy or little time changes today's suggestion, and the card says exactly which inputs caused it.
4. **Honest insights.** Each comparison group needs at least 3 days, and a pattern is called "consistent" only at 6 or more. Raw counts are always shown, every pattern carries a correlation caveat, and the user can say "this isn't right".
5. **Closed loop.** Accepted suggestions are measured (adherence 2 weeks before vs after) and shown back to the user.

## 6. Architecture

```
src/lib/        framework-free domain logic (tested)
  types.ts      data model
  planner.ts    plan generation, rotation, short version
  stats.ts      outcomes, consistency, volume, PRs
  insights.ts   rule engine + outcome tracking
  store.ts      versioned local-first store (single persistence seam)
src/components/ design-system primitives, charts, sheets
src/screens/    Landing, Onboarding, Home, Workout, Progress, Insights, You
```

**Production path:** Next.js (App Router) on Vercel + Supabase (Auth + Postgres + RLS). Keep local-first writes for logging speed and offline gyms, and sync in the background through `store.ts`. Start with rules plus basic statistics; consider a model only once there are enough users and an evaluation set.

## 7. Visual & motion direction

- **Type:** one variable family (Archivo) used at two widths: condensed heavy for numbers and headlines, normal width for reading
- **Color:** chalk and ink surfaces, a single ember accent, moss for "consistent". The workout screen switches to dark "focus mode" for readability at arm's length.
- **Signature element:** the week strip (trained, planned, skipped, bonus), which is also the opening visual on the landing page
- **Motion tokens:** 120 / 220 / 380 / 700 ms with out, in-out and spring curves. Motion is used only for state changes (set ticks, sheet entry, ring and chart draw, a completion burst). It respects the OS reduced-motion setting and has an in-app override. The intro plays once per session, never blocks input, and is skipped under reduced motion.
- **Design references:** the supplied design sites could not be fetched from this environment (access blocked). 60fps.design and beUI were reviewed through secondary sources. 60fps is a curated library of app UI animation recordings filtered by interaction pattern, and beUI is an open-source set of Motion + Tailwind components with reduced-motion support. The timing tokens and the spring-on-confirm pattern follow common practice from those sources. Nothing was copied.

## 8. Next priorities

1. Move into a Next.js repo, add Supabase auth and sync (migration ready), and deploy on Vercel
2. Test with 5–10 real users for 2 weeks and measure time-to-first-set and planned-vs-done
3. Template editor, custom exercises, supersets
4. Opt-in reminders at the user's actual training time (the time-of-day insight already detects it)
5. Optional Apple Health / Health Connect import, with permission

### Sources
- [SensAI: Fitness app pricing 2026](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison) · [Hevy vs Strong 2026](https://www.sensai.fit/blog/hevy-vs-strong-2026) · [Fitbod review 2026](https://www.sensai.fit/blog/fitbod-review-2026). These come from a competing vendor, so they're used for prices and features only.
- [Oura vs WHOOP (Oct 2026)](https://www.sensai.fit/blog/oura-vs-whoop-2026)
- [Strava pricing 2026](https://www.runnerspicks.com/blog/strava-pricing-is-it-worth-it/)
- [Freeletics review 2026](https://www.corahealth.app/fr/compare/freeletics)
- [Nike Training Club review 2026](https://www.garagegymreviews.com/equipment/nike-training-club)
- [MyFitnessPal reviews analysis 2026](https://unstar.app/blog/is-myfitnesspal-premium-worth-it-paywall-app-reviews-2026) · [MFP pricing](https://content.fitbudd.com/post/myfitnesspal-app-cost)
- [Apple Fitness+ 2026 pricing](https://www.documentarytube.com/?p=263722)
- [ACSM: STRRIDE adherence findings](https://www.acsm.org/blog-detail/acsm-blog/2022/04/19/what-makes-an-exercise-program-stick-the-strride-randomized-trials)
- [60fps.design overview](https://www.abduzeedo.com/60fps-curated-library-ui-animation-design) · [beUI overview](https://index.dodopayments.com/beui)
