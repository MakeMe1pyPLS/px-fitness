# PX-Fitness (PX × Kova merge)

A mobile-first training and nutrition app that adapts to the user's goals, schedule, energy and budget, and explains every suggestion. See `docs/MOTION.md` (motion system), `docs/PX-COLLABORATION.md` (how PX and Kova were merged), `docs/DISCOVERY.md` (research and strategy) and `docs/NUTRITION.md` (goals, Diet Plan, data sources, third-party services).

## Run it

```bash
npm install
npm run build   # → dist/index.html (single self-contained file)
npm test        # 59 unit tests (training, nutrition, coaching, check-in bot, spring physics)
npm run e2e     # 62 browser journeys: journeys (20) + diet (18) + px (13) + motion (11) (needs: npx playwright install chromium)
npm run dev     # unminified build with source maps
```

Open `dist/index.html` directly, or host it anywhere (Vercel, Netlify, S3).

## Where things live

| Path | What |
|---|---|
| `src/lib/` | All domain logic, framework-free and unit-tested |
| `src/lib/insights.ts` | Pattern rules and their thresholds (`MIN_GROUP`, `STRONG_GROUP`) |
| `src/lib/store.ts` | The only persistence code; swap in Supabase sync here |
| `src/styles/app.css` | Design tokens (color, type, space, motion) and components |
| `src/brand.ts` | Product name and tagline |
| `supabase/migrations/` | Cloud schema with row-level security (not yet connected) |

## Principles enforced in code

- No fabricated data. Sample data is opt-in, replaces everything only after a confirmation, and shows a persistent banner.
- Insights need at least 3 days per comparison group, show their raw counts, and include a correlation caveat.
- A missed or skipped day never raises intensity and is never described as a failure.
- Fitness guidance, not medical advice. Pain, injury and illness copy points users to professionals.
