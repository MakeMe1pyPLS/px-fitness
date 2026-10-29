// Builds the app into one self-contained HTML file (dist/index.html):
// JS and CSS are inlined so it can be hosted anywhere, opened offline, or
// published as a single page.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const outFile = process.env.PX_OUT || 'dist/index.html';
// Public Supabase settings (safe in the browser). Set in Vercel as
// PX_SUPABASE_URL / PX_SUPABASE_ANON_KEY. Empty = accounts hidden.
const pub = (k) => JSON.stringify(process.env[k] || '');
const result = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  format: 'iife',
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  write: false,
  outdir: 'dist',
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"', __PX_SUPABASE_URL__: pub('PX_SUPABASE_URL'), __PX_SUPABASE_ANON_KEY__: pub('PX_SUPABASE_ANON_KEY') },
  logLevel: 'warning',
});

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#090909" />
<meta name="description" content="PX-Fitness: personal coaching, training, meals and check-ins in one place." />
<title>PX-Fitness — Train for your life.</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet" />
<style>${css}</style>
</head>
<body>
<noscript>PX-Fitness needs JavaScript to run.</noscript>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;

mkdirSync(outFile.replace(/\/[^/]*$/, ''), { recursive: true });
writeFileSync(outFile, html);
console.log(`${outFile}  ${(html.length / 1024).toFixed(0)} KB`);
