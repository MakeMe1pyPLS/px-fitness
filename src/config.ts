// Public, browser-safe settings. Secrets (Stripe secret key, Supabase service
// role key, Anthropic key) live ONLY in Vercel environment variables and are
// read by the functions in /api. Never put them here.
//
// When supabaseUrl is empty, accounts and the paywall are hidden and the app
// runs fully on-device, exactly like before.

import { DEMO_BASE, demoRequested, installDemo } from './lib/demo';

/** True while real accounts aren't set up yet. Demo mode is only possible then. */
export const realCloudConfigured = !!(__PX_SUPABASE_URL__ && __PX_SUPABASE_ANON_KEY__);
/** Demo mode: preview accounts + Friends with sample people, all in this browser. */
export const DEMO = !realCloudConfigured && demoRequested();
// Runs before anything else reads the session or calls the backend.
if (DEMO) installDemo();

export const CLOUD = {
  supabaseUrl: DEMO ? DEMO_BASE : __PX_SUPABASE_URL__,
  supabaseAnonKey: DEMO ? 'demo' : __PX_SUPABASE_ANON_KEY__,
  plan: { name: 'PX Plus', priceLabel: '$25/month' },
  aiDailyLimit: 30,
};

export const cloudEnabled = () => !!(CLOUD.supabaseUrl && CLOUD.supabaseAnonKey);
