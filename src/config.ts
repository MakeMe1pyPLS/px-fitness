// Public, browser-safe settings. Secrets (Stripe secret key, Supabase service
// role key, Anthropic key) live ONLY in Vercel environment variables and are
// read by the functions in /api. Never put them here.
//
// When supabaseUrl is empty, accounts and the paywall are hidden and the app
// runs fully on-device, exactly like before.

export const CLOUD = {
  supabaseUrl: __PX_SUPABASE_URL__,
  supabaseAnonKey: __PX_SUPABASE_ANON_KEY__,
  plan: { name: 'PX Plus', priceLabel: '$25/month' },
  aiDailyLimit: 30,
};

export const cloudEnabled = () => !!(CLOUD.supabaseUrl && CLOUD.supabaseAnonKey);
