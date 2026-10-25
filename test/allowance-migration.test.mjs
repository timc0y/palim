import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

test('allowance ceiling migration preserves account values and dependent records', () => {
  const db = new DatabaseSync(':memory:');
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(directory)
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if (name.startsWith('0006')) break;
    db.exec(readFileSync(new URL(name, directory), 'utf8'));
  }
  db.exec(`INSERT INTO users(id,name,created_at,daily_send_limit) VALUES
    ('owner','Owner',1,10),('other','Other',1,3);
    INSERT INTO operations(id,owner,kind,created_at) VALUES('kept','owner','upload',1);`);
  db.exec(readFileSync(new URL('0006-account-send-ceiling.sql', directory), 'utf8'));
  assert.deepEqual(
    db
      .prepare('SELECT daily_send_limit FROM users ORDER BY id')
      .all()
      .map((r) => r.daily_send_limit),
    [3, 10],
  );
  db.prepare('UPDATE users SET daily_send_limit=20 WHERE id=?').run('owner');
  assert.equal(
    db.prepare('SELECT daily_send_limit FROM users WHERE id=?').get('other').daily_send_limit,
    3,
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM operations').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.throws(() => db.exec("UPDATE users SET daily_send_limit=21 WHERE id='owner'"), /CHECK/);
  db.close();
});
