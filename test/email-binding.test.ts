import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { prepareEmail } from '../src/mail.js';
import { sha256 } from '../src/xml.js';
import { pdf } from './helpers.js';

test('real local Cloudflare email binding stores binary attachment bytes, not Base64 text', async () => {
  const original = pdf();
  const payload = await prepareEmail({
    bytes: original,
    expectedHash: await sha256(original),
    type: 'application/pdf',
    filename: 'fixture.pdf',
    from: 'sender@example.invalid',
    to: 'fixture@kindle.com',
    receiptId: 'synthetic-local-contract',
  });
  assert.ok(payload.attachments[0]!.content instanceof Uint8Array);
  const root = await mkdtemp(join(tmpdir(), 'palim-email-contract-'));
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: '2026-07-01',
    defaultProjectTmpPath: root,
    email: { send_email: [{ name: 'EMAIL' }] },
    script: `export default {async fetch(request,env){
      const mode=new URL(request.url).searchParams.get('mode');
      const message=${JSON.stringify({ ...payload, attachments: [] })};
      message.attachments=[{filename:'fixture.pdf',type:'application/pdf',disposition:'attachment',
        content:mode==='binary'?new Uint8Array(${JSON.stringify([...original])}):${JSON.stringify(Buffer.from(original).toString('base64'))}}];
      await env.EMAIL.send(message); return new Response('captured locally');
    }};`,
  });
  async function attachments(dir: string): Promise<Buffer[]> {
    const found: Buffer[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...(await attachments(path)));
      else if (entry.name.endsWith('.pdf')) found.push(await readFile(path));
    }
    return found;
  }
  try {
    assert.equal((await mf.dispatchFetch('https://fixture.invalid/?mode=binary')).status, 200);
    let files = await attachments(root);
    assert.equal(files.length, 1);
    assert.deepEqual(files[0], Buffer.from(original));
    assert.equal((await mf.dispatchFetch('https://fixture.invalid/?mode=string')).status, 200);
    files = await attachments(root);
    assert.equal(files.length, 2);
    assert.ok(
      files.some((bytes) => bytes.equals(Buffer.from(Buffer.from(original).toString('base64')))),
    );
  } finally {
    await mf.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
