import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { fixture, pdf, simpleBook, NOW } from './helpers.js';
import { buildBook } from '../src/book.js';
import { prepareEmail, messageBudget, canEmail } from '../src/mail.js';
import { LIMITS } from '../src/schema.js';
import { sha256 } from '../src/xml.js';

test('original EPUB is stored and forwarded byte for byte without authoring', async () => {
  const f = await fixture();
  const original = (await buildBook(simpleBook)).bytes;
  const uploaded = await f.palim.upload('alice', original, 'Original.epub');
  const receipt = await f.palim.send('alice', uploaded.artifactId);
  assert.equal(receipt.state, 'submitted');
  assert.equal(f.sent.length, 1);
  const attached = Buffer.from(f.sent[0]!.attachments[0]!.content, 'base64');
  assert.deepEqual(attached, Buffer.from(original));
  assert.equal(await sha256(attached), uploaded.sha256);
  assert.equal(receipt.kindleReceipt, 'unverified');
});
test('PDF follows the same byte-preserving path', async () => {
  const f = await fixture();
  const bytes = pdf();
  const a = await f.palim.upload('alice', bytes, 'Manual.pdf');
  await f.palim.send('alice', a.artifactId);
  assert.deepEqual(Buffer.from(f.sent[0]!.attachments[0]!.content, 'base64'), Buffer.from(bytes));
});
test('creating a draft never sends an email', async () => {
  const f = await fixture();
  const a = await f.palim.create('alice', simpleBook);
  assert.equal(a.generated, true);
  assert.ok(a.previewUrl);
  assert.ok(a.sourceUrl);
  assert.equal(f.sent.length, 0);
});
test('repeat and concurrent requests submit only once', async () => {
  const f = await fixture();
  const a = await f.palim.upload('alice', pdf(), 'manual.pdf');
  const receipts = await Promise.all(
    Array.from({ length: 8 }, () => f.palim.send('alice', a.artifactId)),
  );
  assert.equal(f.sent.length, 1);
  assert.equal(new Set(receipts.map((r) => r.deliveryId)).size, 1);
});
test('timeout is unknown and ordinary retry does not send again', async () => {
  const f = await fixture();
  let calls = 0;
  f.env.EMAIL.send = async () => {
    calls++;
    throw new Error('secret provider details');
  };
  const a = await f.palim.upload('alice', pdf(), 'a.pdf');
  const first = await f.palim.send('alice', a.artifactId),
    second = await f.palim.send('alice', a.artifactId);
  assert.equal(first.state, 'unknown');
  assert.equal(second.deliveryId, first.deliveryId);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(first), /secret provider/);
});
test('known boundary rejection stays rejected; no automatic resend', async () => {
  const f = await fixture();
  f.env.EMAIL.send = async () => {
    throw Object.assign(new Error('hidden'), { code: 'E_SENDER_NOT_VERIFIED' });
  };
  const a = await f.palim.upload('alice', pdf(), 'a.pdf');
  assert.equal((await f.palim.send('alice', a.artifactId)).state, 'rejected');
});
test('explicit resend gets a separate receipt, repeated same resend stays idempotent', async () => {
  const f = await fixture();
  const a = await f.palim.upload('alice', pdf(), 'a.pdf');
  const first = await f.palim.send('alice', a.artifactId),
    second = await f.palim.send('alice', a.artifactId, first.deliveryId),
    again = await f.palim.send('alice', a.artifactId, first.deliveryId);
  assert.notEqual(second.deliveryId, first.deliveryId);
  assert.equal(again.deliveryId, second.deliveryId);
  assert.equal(f.sent.length, 2);
});
test('no reader means no send', async () => {
  const f = await fixture();
  f.sql.prepare('UPDATE users SET default_destination_id=NULL WHERE id=?').run('alice');
  const a = await f.palim.upload('alice', pdf(), 'a.pdf');
  await assert.rejects(f.palim.send('alice', a.artifactId), /save a Kindle/);
  assert.equal(f.sent.length, 0);
});
test('tenant isolation covers sending, files and receipts', async () => {
  const f = await fixture();
  const a = await f.palim.upload('alice', pdf(), 'a.pdf');
  await assert.rejects(f.palim.send('bob', a.artifactId), /belongs to another/);
  await assert.rejects(f.palim.store.artifact('bob', a.artifactId));
  const r = await f.palim.send('alice', a.artifactId);
  await assert.rejects(f.palim.store.delivery('bob', r.deliveryId), /No accessible/);
  assert.equal(f.sent.length, 1);
});
test('tampered storage is detected before email submission', async () => {
  const f = await fixture();
  const a = await f.palim.upload('alice', pdf(), 'a.pdf');
  const row = await f.palim.store.artifact('alice', a.artifactId);
  f.objects.set(row.object_key, new Uint8Array([1, 2, 3]));
  await assert.rejects(f.palim.send('alice', a.artifactId), /recorded hash/);
  assert.equal(f.sent.length, 0);
});
test('encoded email budget is conservative and enforced before submission', async () => {
  assert.ok(messageBudget(3 * 1024 * 1024) < LIMITS.message);
  assert.equal(canEmail(4 * 1024 * 1024), false);
  const f = await fixture();
  const bytes = new Uint8Array(4 * 1024 * 1024);
  bytes.set(pdf());
  const a = await f.palim.upload('alice', bytes, 'large.pdf');
  assert.equal(a.emailEligible, false);
  await assert.rejects(f.palim.send('alice', a.artifactId), /too large/);
  assert.equal(f.sent.length, 0);
  assert.equal((await f.palim.store.artifact('alice', a.artifactId)).bytes, bytes.length);
});
test('source file and artifact signatures are private and short lived', async () => {
  const f = await fixture();
  const a = await f.palim.create('alice', simpleBook);
  const url = new URL(a.downloadUrl);
  assert.equal((await f.palim.download(new Request(url), a.artifactId, 'file')).status, 200);
  url.searchParams.set('owner', 'bob');
  await assert.rejects(f.palim.download(new Request(url), a.artifactId, 'file'), /invalid/);
  f.setTime(NOW + 901);
  await assert.rejects(
    f.palim.download(new Request(a.downloadUrl), a.artifactId, 'file'),
    /expired/,
  );
});
test('render quota is atomic under concurrent requests', async () => {
  const f = await fixture();
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => f.palim.store.admit('alice', 'render')),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
  assert.equal(
    f.sql.prepare("SELECT COUNT(*) n FROM operations WHERE owner='alice' AND kind='render'").get()!
      .n,
    2,
  );
});
test('send quota stops a fourth distinct send even in a race', async () => {
  const f = await fixture();
  const files = [];
  for (let i = 0; i < 4; i++) {
    const bytes = new TextEncoder().encode(new TextDecoder().decode(pdf()) + i);
    files.push(await f.palim.upload('alice', bytes, `${i}.pdf`));
  }
  const outcomes = await Promise.allSettled(files.map((a) => f.palim.send('alice', a.artifactId)));
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal(f.sent.length, 3);
});
test('expired files are inaccessible before cleanup and removed by cleanup', async () => {
  const f = await fixture();
  const a = await f.palim.create('alice', simpleBook);
  assert.equal(f.objects.size, 3);
  f.setTime(NOW + 86401);
  await assert.rejects(f.palim.store.artifact('alice', a.artifactId), /expired/);
  await f.palim.cleanup();
  assert.equal(f.objects.size, 0);
});
test('delete removes source, preview and original without removing delivery evidence', async () => {
  const f = await fixture();
  const a = await f.palim.create('alice', simpleBook);
  const r = await f.palim.send('alice', a.artifactId);
  await f.palim.remove('alice', a.artifactId);
  assert.equal(f.objects.size, 0);
  assert.equal((await f.palim.store.delivery('alice', r.deliveryId)).state, 'submitted');
});
test('mail filenames cannot inject headers', async () => {
  const bytes = pdf();
  const payload = await prepareEmail({
    bytes,
    expectedHash: await sha256(bytes),
    type: 'application/pdf',
    filename: 'a\r\nBcc:evil@example.com.pdf',
    from: 'reader@example.com',
    to: 'alice@kindle.com',
    receiptId: 'test',
  });
  assert.doesNotMatch(payload.attachments[0]!.filename, /[\r\n]/);
  assert.equal(payload.to, 'alice@kindle.com');
});
test('host file import refuses arbitrary URLs without fetching', async () => {
  const f = await fixture();
  for (const url of [
    'http://files.example/a',
    'https://evil.example/a',
    'https://user:pass@files.example/a',
    'http://127.0.0.1/a',
  ])
    await assert.rejects(
      f.palim.importHostFile('alice', { download_url: url, filename: 'a.epub' }),
      /not configured/,
    );
});
test('stale in-flight records are reported unknown, never assumed failed', async () => {
  const f = await fixture();
  const a = await f.palim.upload('alice', pdf(), 'a.pdf');
  const r = await f.palim.send('alice', a.artifactId);
  f.sql.prepare("UPDATE deliveries SET state='submitting' WHERE id=?").run(r.deliveryId);
  f.setTime(NOW + 121);
  assert.equal((await f.palim.store.delivery('alice', r.deliveryId)).state, 'unknown');
  await f.palim.send('alice', a.artifactId);
  assert.equal(f.sent.length, 1);
});
test('host-file download is denied before network work when upload allowance is spent', async () => {
  const f = await fixture();
  for (let i = 0; i < 6; i++) await f.palim.store.admit('alice', 'upload');
  await assert.rejects(
    f.palim.importHostFile('alice', {
      download_url: 'https://files.example/approved.epub',
      filename: 'approved.epub',
    }),
    /allowance/,
  );
});
