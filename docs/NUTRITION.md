# Kova: Goals & Diet Plan (Phase 2)

## How it fits the existing app
- **One profile, one goal.** `Profile.goal` (primary), `secondaryGoals`, `disciplines` and `primaryDiscipline` drive both the workout planner (`planner.ts` blueprints per discipline) and the nutrition engine (`nutrition.ts`). Changing goals rebuilds the workout plan, keeps all history, and appends to `goalHistory`.
- **Diet Plan tab** (5th nav item) with subviews: Today's meals, Meal plan, Meal prep, Food budget, Grocery list, Find food near me, Preferences, Saved meals.
- **Works without a workout plan:** the nutrition code reads only the goal and preferences. Training days only add meal-timing tips. Food is never increased or reduced based on estimated calories burned.
- **Schema v2** migrates v1 data automatically (old goal ids are mapped, and an empty nutrition object is added).

## Data sources: what's real and what's an estimate
| Data | Source | How it's shown |
|---|---|---|
| Ingredient prices (rice, pasta, bread, chicken, beef, eggs, milk, cheddar, bananas, potatoes, tomatoes, dried beans) | BLS Average Price Data, U.S. city average, **Sep 2026** | "BLS" tag |
| Other ingredient prices | Typical U.S. supermarket price | "est." tag; tap to set your own ("yours") |
| Nutrition per ingredient | Typical values in line with USDA FoodData Central generic entries | Always labeled "estimate" |
| Energy target | Mifflin-St Jeor × activity factor, goal-adjusted (deficit ≤ 500 kcal and never below the resting estimate; surplus ≤ 500) | Shown only if the user enters age, height and weight; never for under-18s |
| Protein range | 1.6–2.2 g/kg (strength, muscle or fat-loss goals), otherwise 1.2–1.6 g/kg | Shown with its basis |
| Places | OpenStreetMap: Nominatim (geocoding) + Overpass (places), free, no key | Attribution shown; no prices, menus or nutrition; hours labeled "may be out of date"; no "open now" |

Nothing is fabricated. With no data source available, the app says so and offers map-search links instead.

## Third-party services
| Service | Cost | Key | Limits / notes |
|---|---|---|---|
| OpenStreetMap Nominatim | Free | None | ≤1 request/s across all users; requests must be user-triggered. **Before launch, put it behind a small server proxy with caching** (e.g. a Vercel function) so the provider can be switched without an app update, as the usage policy asks. |
| Overpass API | Free | None | Shared public servers; same proxy and cache advice. |
| *Optional upgrade:* Google Places, Foursquare or Yelp | Paid per request | Server-side key | Adds ratings, price level, current hours and photos. Keys must stay server-side. |
| *Optional upgrade:* chain menu nutrition (e.g. Nutritionix) | Paid | Server-side key | The only reliable way to show restaurant item nutrition. |
| *Optional upgrade:* live grocery prices (Kroger API, Instacart) | Varies | Server-side key | Store-specific prices and stock. |

## Food safety built into the recipes
Recipes say to refrigerate cooked food within 2 hours, keep it 3–4 days, and reheat to 165 °F / 74 °C. Rice gets a stricter cool-within-1-hour rule. Plans longer than 4 days favor freezer-friendly dishes, with freeze and thaw guidance. Chicken and beef steps include safe internal temperatures.

## Learning from feedback (persisted, inspectable, resettable)
Suggestion responses (accepted, shuffled, rejected), ratings, saved meals, meals eaten in the last 3 days, ingredients the user swaps often, a pattern of picking quick meals, cuisine preferences, and grocery overspending in 2+ recent weeks (which preselects the budget plan) all feed `recommend()`. Users can see counts and clear everything in Preferences → Food data.

## Tests
- `tests/nutrition.test.ts`: 26 unit tests (allergies, diet swaps, dislikes, kitchen, targets safety, serving scaling, consolidation, package vs portion cost, substitutions, budget math, budget steering, recency and rejection, ratings, quick-meal learning, goal-shaped suggestions, discipline-shaped plans, migrations, OSM parsing, units).
- `e2e/diet.mjs`: 18 browser journeys covering all 17 checks in the brief at phone size, plus tablet and desktop. Place search is tested against **mocked** responses (this build environment has no internet), plus real blocked-network, geolocation-allowed and geolocation-denied paths.
