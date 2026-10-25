import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicFileUrl } from '../src/file-url.js';

test('public file URLs preserve signed queries without provider-specific host lists', () => {
  for (const host of ['sdmntprwestus2.oaiusercontent.com', 'storage.example.org']) {
    const raw = `https://${host}:443/a.epub?signature=opaque`;
    const url = publicFileUrl(raw);
    assert.equal(url.search, '?signature=opaque');
    assert.equal(url.hostname, host);
  }
});

test('URL normalization cannot hide credentials, IP literals, local names or unsafe ports', () => {
  for (const url of [
    'http://files.example/a',
    'https://files.example:8443/a',
    'https://user:pass@files.example/a',
    'https://files.example/a#fragment',
    'https://127.0.0.1/a',
    'https://2130706433/a',
    'https://0x7f000001/a',
    'https://0177.0.0.1/a',
    'https://10.0.0.1/a',
    'https://169.254.169.254/a',
    'https://[::1]/a',
    'https://[::ffff:127.0.0.1]/a',
    'https://[fc00::1]/a',
    'https://[fe80::1]/a',
    'https://[2001:db8::1]/a',
    'https://192.0.2.1/a',
    'https://localhost/a',
    'https://LOCALHOST./a',
    'https://x.localhost./a',
    'https://machine.local/a',
    'https://metadata.google.internal/a',
    'https://router.home.arpa/a',
    'https://singlelabel/a',
  ])
    assert.throws(() => publicFileUrl(url), /public HTTPS/);
});

test('deployment retains strictly-public global routing and no private network bindings', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.ok(config.compatibility_flags.includes('global_fetch_strictly_public'));
  assert.ok(!config.compatibility_flags.includes('global_fetch_private_origin'));
  assert.equal(config.vpc_services, undefined);
  assert.equal(config.services, undefined);
});
