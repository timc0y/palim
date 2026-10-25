import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fixture, simpleBook, NOW } from './helpers.js';
import { appFetch } from '../src/routes.js';
import { Palim } from '../src/service.js';
import { SendSchema } from '../src/schema.js';
const rejects = (code: string) => (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === code;

test('save/default send no mail; newly saved addresses deliver without a Kindle code', async () => {
  const f = await fixture();
  const first = await f.palim.saveDestination('alice', 'bedside@kindle.com', 'Bedside');
  const second = await f.palim.saveDestination('alice', 'travel@kindle.com', 'Travel');
  await f.palim.store.defaultReader('alice', first.id);
  const account = await f.palim.account('alice');
  assert.equal(account.defaultDestinationId, first.id);
  assert.equal(account.destinations.find((d) => d.id === second.id)?.label, 'Travel');
  assert.ok(!('confirmed' in first) && !('pendingDestination' in account));
  assert.equal(f.sent.length, 0);
  const book = await f.palim.create('alice', simpleBook);
  await f.palim.send('alice', book.artifactId);
  await f.palim.send('alice', book.artifactId, undefined, second.id);
  assert.deepEqual(
    f.sent.map((p) => p.to),
    [first.email, second.email],
  );
  assert.ok(f.sent.every((p) => p.from.email === account.sender));
  assert.equal(f.sql.prepare('SELECT count(*) n FROM challenges').get()!.n, 0);
});

test('saved addresses remain private and bounded to five, including concurrent saves', async () => {
  const f = await fixture();
  const saved = await f.palim.saveDestination('alice', 'private@kindle.com', 'Private');
  for (const action of [
    () => f.palim.store.defaultReader('bob', saved.id),
    () => f.palim.store.removeReader('bob', saved.id),
  ])
    await assert.rejects(action(), rejects('READER_NOT_FOUND'));
  assert.ok(!(await f.palim.account('bob')).destinations.some((d) => d.id === saved.id));
  const outcomes = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      f.palim.saveDestination('alice', `reader${i}@kindle.com`, `Reader ${i}`),
    ),
  );
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal((await f.palim.account('alice')).destinations.length, 5);
  const renamed = await f.palim.saveDestination('alice', saved.email, 'Renamed');
  assert.equal(renamed.id, saved.id);
  assert.equal(renamed.label, 'Renamed');
  await assert.rejects(
    f.palim.saveDestination('alice', 'other@example.com', 'Other'),
    rejects('KINDLE_ADDRESS'),
  );
  assert.equal(f.sent.length, 0);
});

test('personal sender is opaque, stable, atomic and separate per account', async () => {
  const f = await fixture();
  const a = await f.palim.account('alice'),
    b = await f.palim.account('bob');
  assert.match(a.sender, /^p-[0-9a-f]{32}@palim\.example$/);
  assert.notEqual(a.sender, b.sender);
  assert.notEqual(a.sender, f.env.SENDER);
  assert.ok(!JSON.stringify(a).includes(b.sender));
  await f.palim.store.upsertUser('alice', 'New name');
  await f.palim.saveDestination('alice', 'new@kindle.com', 'New');
  assert.equal((await f.palim.account('alice')).sender, a.sender);
  f.sql.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?)').run('legacy', 'Legacy', NOW);
  const aliases = await Promise.all(Array.from({ length: 12 }, () => f.palim.account('legacy')));
  assert.equal(new Set(aliases.map((a) => a.sender)).size, 1);
  const book = await f.palim.create('bob', simpleBook);
  await f.palim.send('bob', book.artifactId);
  assert.equal(f.sent[0]!.from.email, b.sender);
  assert.equal(
    (
      await f.palim.store.delivery(
        'bob',
        f.sql.prepare("SELECT id FROM deliveries WHERE owner='bob'").get()!.id as string,
      )
    ).sender,
    b.sender,
  );
  assert.equal(
    SendSchema.safeParse({ artifactId: book.artifactId, sender: a.sender }).success,
    false,
  );
});

test('invalid sender configuration fails closed with no shared fallback', async () => {
  const f = await fixture(),
    book = await f.palim.create('alice', simpleBook);
  for (const value of ['', 'reading@localhost', 'bad\r\n@palim.example']) {
    const p = new Palim({ ...f.env, SENDER: value }, () => NOW);
    await assert.rejects(p.send('alice', book.artifactId), rejects('SENDER_UNAVAILABLE'));
  }
  assert.equal(f.sent.length, 0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM mail_attempts').get()!.n, 0);
});

test('retired verification endpoints are absent and cannot mail or redeem old codes', async () => {
  const f = await fixture(),
    cookie = await f.session();
  for (const path of ['/api/destination', '/api/confirm'])
    await assert.rejects(
      appFetch(
        new Request(f.env.ORIGIN + path, {
          method: 'POST',
          headers: { Origin: f.env.ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'unused@kindle.com', code: '0000000000' }),
        }),
        f.env,
      ),
      rejects('NOT_FOUND'),
    );
  assert.equal(f.sent.length, 0);
});

test('personal-sender migration preserves saved/default addresses and historical evidence', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001.sql', '0002-email-auth-readers.sql', '0003-saved-reader-drafts.sql'])
    sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  sql.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?)').run('old', 'Old', NOW);
  sql
    .prepare('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)')
    .run('reader', 'old', 'Saved', 'saved@kindle.com', null);
  sql.prepare('UPDATE users SET default_destination_id=? WHERE id=?').run('reader', 'old');
  sql
    .prepare(
      'INSERT INTO challenges(owner,destination,generation,code_hash,attempts,expires_at) VALUES(?,?,?,?,?,?)',
    )
    .run('old', 'saved@kindle.com', 'generation', 'hash', 0, NOW + 3600);
  sql.exec(
    readFileSync(
      new URL('../migrations/0004-personal-document-senders.sql', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(
    sql.prepare('SELECT default_destination_id FROM users').get()!.default_destination_id,
    'reader',
  );
  assert.equal(sql.prepare('SELECT label FROM reader_destinations').get()!.label, 'Saved');
  assert.equal(sql.prepare('SELECT count(*) n FROM challenges').get()!.n, 1);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
  assert.throws(() => sql.prepare('UPDATE users SET sender_alias=?').run('chosen'));
});

test('atomic delivery admission binds owned address and persisted personal sender', async () => {
  const f = await fixture(),
    saved = await f.palim.saveDestination('alice', 'saved@kindle.com', 'Saved');
  const alice = await f.palim.store.user('alice'),
    bob = await f.palim.store.user('bob');
  const row = {
    id: crypto.randomUUID(),
    owner: 'alice',
    send_key: 'atomic',
    purpose: 'document' as const,
    artifact_id: null,
    sha256: 'a'.repeat(64),
    destination_hash: 'b'.repeat(64),
    destination_mask: 's***@kindle.com',
    destination_id: saved.id,
    state: 'submitting' as const,
    provider_id: null,
    error_code: null,
    resend_of: null,
    created_at: NOW,
    updated_at: NOW,
    sender: (await f.palim.account('alice')).sender,
  };
  assert.equal(await f.palim.store.reserveDelivery(row, saved.id, bob.sender_alias), false);
  await f.palim.store.removeReader('alice', saved.id);
  assert.equal(await f.palim.store.reserveDelivery(row, saved.id, alice.sender_alias), false);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM mail_attempts').get()!.n, 0);
});
