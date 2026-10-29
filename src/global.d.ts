declare module '*.css';
// Vercel functions read env vars from process.env; declared here so the browser code doesn't need Node types.
declare const process: { env: Record<string, string | undefined> };
// Injected by scripts/build.mjs from PX_SUPABASE_URL / PX_SUPABASE_ANON_KEY.
declare const __PX_SUPABASE_URL__: string;
declare const __PX_SUPABASE_ANON_KEY__: string;
