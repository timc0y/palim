import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fixture, simpleBook, NOW } from './helpers.js';

const rejects = (code: string) => (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === code;

test('saving labelled addresses sends nothing; pending defaults and explicit sends stay blocked', async () => {
  const f = await fixture();
  const first = await f.palim.saveDestination('alice', 'bedside@kindle.com', 'Bedside');
  const second = await f.palim.saveDestination('alice', 'travel@kindle.com', 'Travel');
  assert.equal(first.confirmed, false);
  assert.equal(second.confirmed, false);
  await f.palim.store.defaultReader('alice', first.id);
  const account = await f.palim.account('alice');
  assert.equal(account.defaultDestinationId, first.id);
  assert.equal(account.destinations.find((d) => d.id === second.id)?.label, 'Travel');
  assert.equal(account.destinations.find((d) => d.id === first.id)?.confirmed, false);
  const book = await f.palim.create('alice', simpleBook);
  await assert.rejects(f.palim.send('alice', book.artifactId), rejects('READER_UNCONFIRMED'));
  await assert.rejects(
    f.palim.send('alice', book.artifactId, undefined, second.id),
    rejects('READER_UNCONFIRMED'),
  );
  assert.equal(f.sent.length, 0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM mail_attempts').get()!.n, 0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM challenges').get()!.n, 0);
});

test('saved address ownership and five-entry limit hold for pending and confirmed rows', async () => {
  const f = await fixture();
  const saved = await f.palim.saveDestination('alice', 'private@kindle.com', 'Private');
  await assert.rejects(f.palim.store.defaultReader('bob', saved.id), rejects('READER_NOT_FOUND'));
  await assert.rejects(f.palim.store.removeReader('bob', saved.id), rejects('READER_NOT_FOUND'));
  assert.ok(!(await f.palim.account('bob')).destinations.some((d) => d.id === saved.id));
  for (let i = 0; i < 3; i++)
    await f.palim.saveDestination('alice', `reader${i}@kindle.com`, `Reader ${i}`);
  await assert.rejects(
    f.palim.saveDestination('alice', 'sixth@kindle.com', 'Sixth'),
    rejects('READER_LIMIT'),
  );
  const renamed = await f.palim.saveDestination('alice', 'private@kindle.com', 'New name');
  assert.equal(renamed.id, saved.id);
  assert.equal(renamed.confirmed, false);
  const old = (await f.palim.account('alice')).destinations.find((d) => d.confirmed)!;
  assert.equal(
    (await f.palim.saveDestination('alice', old.email, 'Renamed confirmed')).confirmed,
    true,
  );
  await assert.rejects(
    f.palim.saveDestination('alice', 'not-a-kindle@example.com', 'Other'),
    rejects('KINDLE_ADDRESS'),
  );
  assert.equal(f.sent.length, 0);
});

test('confirmation promotes a saved address in place and deletion cancels its pending challenge', async () => {
  const f = await fixture();
  const saved = await f.palim.saveDestination('alice', 'pending@kindle.com', 'Current label');
  await f.palim.store.setChallenge({
    owner: 'alice',
    destination: saved.email,
    label: 'Old label',
    generation: crypto.randomUUID(),
    code_hash: 'fixture-proof',
    attempts: 0,
    expires_at: NOW + 3600,
  });
  assert.equal(await f.palim.store.confirm('alice', 'fixture-proof'), true);
  const row = await f.palim.store.reader('alice', saved.id);
  assert.equal(row.label, 'Current label');
  assert.equal(row.confirmed_at, NOW);
  await f.palim.store.setChallenge({
    owner: 'alice',
    destination: saved.email,
    label: saved.label,
    generation: crypto.randomUUID(),
    code_hash: 'next-proof',
    attempts: 0,
    expires_at: NOW + 3600,
  });
  await f.palim.store.removeReader('alice', saved.id);
  assert.equal(await f.palim.store.confirm('alice', 'next-proof'), false);
  assert.equal(f.sent.length, 0);
});

test('migration preserves existing verified IDs/defaults and permits only an explicit pending state', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001.sql', '0002-email-auth-readers.sql'])
    sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  sql.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?)').run('old-owner', 'Old', NOW);
  sql
    .prepare('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)')
    .run('old-reader', 'old-owner', 'Original', 'original@kindle.com', NOW);
  sql
    .prepare('UPDATE users SET default_destination_id=? WHERE id=?')
    .run('old-reader', 'old-owner');
  sql.exec(
    readFileSync(new URL('../migrations/0003-saved-reader-drafts.sql', import.meta.url), 'utf8'),
  );
  assert.equal(
    sql.prepare('SELECT confirmed_at FROM reader_destinations WHERE id=?').get('old-reader')!
      .confirmed_at,
    NOW,
  );
  assert.equal(
    sql.prepare('SELECT default_destination_id FROM users WHERE id=?').get('old-owner')!
      .default_destination_id,
    'old-reader',
  );
  sql
    .prepare(
      'INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,NULL)',
    )
    .run('pending', 'old-owner', 'Pending', 'pending@kindle.com');
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});

test('atomic delivery admission refuses a saved-only destination without spending mail budget', async () => {
  const f = await fixture();
  const saved = await f.palim.saveDestination('alice', 'unverified@kindle.com', 'Unverified');
  const admitted = await f.palim.store.reserveDelivery(
    {
      id: crypto.randomUUID(),
      owner: 'alice',
      send_key: 'saved-address-race',
      purpose: 'document',
      artifact_id: null,
      sha256: 'a'.repeat(64),
      destination_hash: 'b'.repeat(64),
      destination_mask: 'u***@kindle.com',
      destination_id: saved.id,
      state: 'submitting',
      provider_id: null,
      error_code: null,
      resend_of: null,
      created_at: NOW,
      updated_at: NOW,
    },
    saved.id,
  );
  assert.equal(admitted, false);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM deliveries').get()!.n, 0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM mail_attempts').get()!.n, 0);
  assert.equal(f.sent.length, 0);
});
