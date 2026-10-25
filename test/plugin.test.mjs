import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { packagePlugin } from '../scripts/package-plugin.mjs';

test('one Codex plugin contains one connection and branding, without obsolete skills', async () => {
  const built = await packagePlugin();
  const zip = await JSZip.loadAsync(built.bytes);
  const manifest = JSON.parse(await zip.file('.codex-plugin/plugin.json').async('text'));
  const config = JSON.parse(await zip.file('.mcp.json').async('text'));
  assert.equal(config.mcpServers.palim.url, 'https://palim-timc0y.pages.dev/mcp');
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.equal(manifest.skills, undefined);
  assert.equal(manifest.extensions?.['com.openai']?.onboardingSkill, undefined);
  const extension = { interface: manifest.interface };
  for (const path of [extension.interface.logo, extension.interface.composerIcon])
    assert.ok(zip.file(path.slice(2)), `Packaged resource is missing: ${path}`);
  assert.ok(
    Object.keys(zip.files).every(
      (path) => !path.startsWith('skills/') && !path.startsWith('hooks/'),
    ),
  );
  assert.equal(Object.keys(zip.files).length, 5);
  assert.ok(
    Object.keys(zip.files).every(
      (path) =>
        !path.startsWith('/') &&
        !path.includes('..') &&
        !/(?:^|\/)(?:\.env|node_modules|src|\.local|\.git)(?:\/|$)/.test(path),
    ),
  );
  assert.deepEqual(Object.keys(config.mcpServers), ['palim']);
  assert.equal(config.mcpServers.palim.headers, undefined);
  assert.equal(config.mcpServers.palim.clientSecret, undefined);
  assert.equal((await packagePlugin()).sha256, built.sha256);
});

test('self-hosted bundles change only the actual endpoint and reject unsafe origins', async () => {
  const built = await packagePlugin('https://reading.operator.invalid');
  const zip = await JSZip.loadAsync(built.bytes);
  const config = JSON.parse(await zip.file('.mcp.json').async('text'));
  assert.equal(config.mcpServers.palim.url, 'https://reading.operator.invalid/mcp');
  for (const bad of [
    'http://reading.invalid',
    'https://user:secret@reading.invalid',
    'https://reading.invalid/path',
    'https://reading.invalid?token=secret',
    'https://your-palim.example',
    'https://localhost',
  ])
    await assert.rejects(packagePlugin(bad), /real HTTPS origin/);
});
