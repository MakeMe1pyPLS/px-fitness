# Accounts, sync and PX Plus ($25/month)

## What it does
- **Accounts (free):** email + password. A person's app data is backed up to their
  account and follows them to other devices. Progress photos stay on the device.
- **PX Plus ($25/month):** unlocks the AI check-in coach. Everything else stays free.
- **Who decides "paid":** only the Stripe webhook (`api/stripe-webhook.ts`) writes the
  `subscriptions` table. The AI endpoint checks it on the server
  (`use_ai_credit()` in Postgres) before every reply, with a daily cap (30 by default).

## How the pieces fit
| Piece | Where | Secret? |
|---|---|---|
| Sign in, backup, plan status | `src/lib/cloud.ts` (browser → Supabase, row-level security) | No (anon key is public) |
| Start checkout / billing portal | `api/checkout.ts`, `api/portal.ts` | Uses Stripe secret + Supabase service role |
| Mark accounts paid / canceled | `api/stripe-webhook.ts` (signature-checked) | Uses webhook secret + service role |
| AI coach | `api/checkin.ts` | Uses Anthropic key |
| Database | `supabase/migrations/0001_accounts_paywall.sql` | — |

If `PX_SUPABASE_URL` isn't set at build time, accounts and the paywall are hidden and
the app runs fully on-device like before.

## Setup checklist
1. **Supabase:** project created, migration applied.
   Auth → URL Configuration → Site URL = the live site URL (so email links come back to the app).
2. **Vercel env vars** (Project → Settings → Environment Variables):
   - Public: `PX_SUPABASE_URL`, `PX_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - Secret: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`
   - Optional: `PX_PRICE_CENTS` (default 2500), `PX_AI_DAILY_LIMIT` (default 30)
3. **Stripe (test mode first):** Developers → Webhooks → add endpoint
   `https://<site>/api/stripe-webhook` with events `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
   Settings → Billing → Customer portal: turn on cancel + update payment method.
4. Redeploy. Test with card `4242 4242 4242 4242`, any future date, any CVC.
5. Going live: swap in the live Stripe secret key and a live-mode webhook secret.

## Tested
- Unit: sync decisions, email-link parsing, auth error wording, Stripe form encoding,
  webhook signature (valid/tampered/stale/wrong secret), subscription row mapping,
  redirect safety.
- Browser (`e2e/cloud.mjs`, fake Supabase/Stripe/AI): sign-up, backup, auto-backup,
  free users never hit the AI, checkout → Plus on, AI check-in saves data, crisis text
  never leaves the device, daily-limit fallback, wrong password, new-phone restore,
  conflict choice, confirmation/reset/expired links, sign-out, no sideways scroll.
- **Not yet tested against the real services.** Do one full test-mode purchase after setup.

# Friends tab

Free for anyone with an account. Appears in the menu only when accounts are switched on.

- **Adding friends:** each person gets a private 8-character code (no I/O/0/1). Share it or an
  invite link (`?invite=CODE#friends`). Nobody is searchable. Requests must be accepted;
  if two people send each other requests, they become friends automatically.
- **Sharing (all off by default):** plan (workout names and exercises, no weights), recent
  workouts (last 12 finished: name, date, minutes, exercises, sets), and photos picked one at
  a time. Check-ins, mood, sleep, notes, effort, meals and coaching are never shared.
- **Cheers:** friends can cheer each other's workouts and photos.
- **Ending it:** removing a friend, unsharing a photo, or deleting it on the phone ends access
  immediately. New friend codes stop old ones from working.
- **Where the rules live:** `supabase/migrations/0002_friends.sql` (row-level security, private
  `friend-photos` storage bucket, friends-only reads).

## Tested
- `supabase/tests/security_test.sh` runs both migrations on a real Postgres 16 with a Supabase
  stand-in and tries 43 things that should be blocked or allowed (strangers reading profiles or
  photos, uploading into someone else's folder, accepting your own request, marking yourself
  paid, beating the AI cap, access after unfriending). All pass.
- `e2e/friends.mjs`: two people go through setup, invite link, request, accept, feed, cheers,
  profile, unshare, unfriend. 14/14 pass.
- Not yet run against the real Supabase project.
