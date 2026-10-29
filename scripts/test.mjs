// Bundles the unit tests with esbuild and runs them with node's built-in runner.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/logic.test.ts', 'tests/nutrition.test.ts', 'tests/px.test.ts', 'tests/cloud.test.ts'], bundle: true, platform: 'node', format: 'esm', outdir: '.test-build', outExtension: { '.js': '.mjs' }, logLevel: 'warning', external: ['node:*'], define: { __PX_SUPABASE_URL__: '""', __PX_SUPABASE_ANON_KEY__: '""' } });
const r = spawnSync(process.execPath, ['--test', '.test-build/logic.test.mjs', '.test-build/nutrition.test.mjs', '.test-build/px.test.mjs', '.test-build/cloud.test.mjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
