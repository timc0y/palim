import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('wrangler.jsonc', root), 'utf8'));
if (!config.account_id) throw new Error('Set the intended Cloudflare account in wrangler.jsonc.');
const result = spawnSync(
  process.execPath,
  [
    new URL('node_modules/wrangler/bin/wrangler.js', root).pathname,
    'pages',
    'deploy',
    '--branch',
    'main',
    ...process.argv.slice(2),
  ],
  {
    cwd: new URL('pages/', root),
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.account_id },
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
