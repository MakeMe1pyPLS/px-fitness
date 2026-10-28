# PX-Fitness × Kova: how the two builds fit together

**Goal:** one app under the client's PX-Fitness brand. PX brings the coach business, the voice and the dark brand. Kova brings the training engine, nutrition and insights. The merged app is published at the same preview link.

## Who brings what
| PX-Fitness (client) brings | Kova (our build) brings |
|---|---|
| Brand: PX name, “Train for your life.”, dark #090909 look, warm copy (“No pressure to be perfect”) | Workout engine: plans by goal and discipline, fast set logging, rest timer, resume after a refresh |
| Coaching tiers ($80 / $60 / $50 per session) and booking | Insights engine (evidence-gated patterns, outcome tracking) |
| Business desk: clients, weekly programming, schedule, inquiries, payments | Diet Plan: meal prep, grocery list with BLS prices, budget, food near me |
| Coach profile, hours, Calendly and Meet links | Detailed check-in data model |
| Progress photos and milestones | Test suites (57 unit + 51 browser journeys), accessibility and contrast checks |
| Privacy stance: data on device, “don’t enter medical records” | Goal and discipline selector, data migrations |

## What the merge adds that neither had
1. **Chat check-in.** PX's “How are you feeling today?” (Low, Okay, Good, Great) opens a short conversation that fills Kova's structured check-in (energy, sleep, time, soreness, stress) from taps or plain text. It remembers what the user said and asks about it next time; users can view and delete those notes. On-device safety handling covers crisis language (shows 988, stops, saves nothing), pain (cautious advice) and disordered-eating language. It's scripted today, and `api/checkin.ts` is ready for AI.
2. **Separate client and coach views.** PX mixed owner tools into the client app. Coach tools now live in a separate “coach view” with its own navigation.
3. **Booking that feeds the desk.** A client's request becomes an inquiry on the coach's desk, which converts to a client with one tap. (On one device in the prototype; across devices once accounts exist.)
4. **PX fixes:** the 4-week estimate now shows real figures ($320 / $480 / $600); a “draft rates” note appears until the coach confirms prices; calendar events use Google's add-event link, so no OAuth is needed; link fields are validated; testimonials and shared plans with sample copy were left out rather than shown as fake.

## Not done yet (needs a backend)
- Accounts and sync, so client requests and check-ins actually reach the coach across devices (Supabase migrations 0001–0003 are ready, including coach and inquiry tables with row-level security)
- Notifications for new inquiries
- Card payments (Stripe), today a manual log
- Shared plans and community (PX previews) need accounts and moderation
- Real testimonials, collected with consent
- A privacy policy before launch

## AI check-in cost (when switched on)
Claude Haiku 5.5: $0.10 per million input tokens and $0.50 per million output tokens (prompts under 100K). A daily check-in costs roughly $0.08 per user per month. See the subscription notes from the earlier discussion.
