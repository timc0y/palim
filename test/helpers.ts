import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Env } from '../src/types.js';
import type { EmailPayload } from '../src/mail.js';
import { Palim } from '../src/service.js';
import { authRoute } from '../src/auth.js';

export const NOW = Date.parse('2026-10-25T12:00:00Z') / 1000;
/** Real SQLite exercises the same SQL; only the asynchronous D1 transport is adapted. */
export function database() {
  const sql = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  const prepare = (query: string) => {
    let values: (string | number | null | Uint8Array)[] = [];
    const run = () => {
      const stmt = sql.prepare(query);
      const before = Number(sql.prepare('SELECT total_changes() n').get()!.n);
      const results = stmt.columns().length ? stmt.all(...values) : (stmt.run(...values), []);
      return {
        success: true,
        results,
        meta: {
          changes: Number(sql.prepare('SELECT total_changes() n').get()!.n) - before,
          last_row_id: 0,
        },
      };
    };
    const statement = {
      bind(...args: (string | number | null | Uint8Array)[]) {
        values = args;
        return statement;
      },
      async first<T>() {
        return (sql.prepare(query).get(...values) ?? null) as T | null;
      },
      async all<T>() {
        return {
          success: true,
          results: sql.prepare(query).all(...values) as T[],
          meta: { changes: 0 },
        };
      },
      async run() {
        return run();
      },
      _run: run,
    };
    return statement;
  };
  const adapter = {
    prepare,
    async exec(query: string) {
      sql.exec(query);
      return { count: 0, duration: 0 };
    },
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec('BEGIN');
      try {
        const results = statements.map((s) => s._run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  // The tests implement only the D1 operations used by Palim, backed by actual SQLite.
  return { sql, db: adapter as unknown as D1Database };
}
export async function fixture() {
  const { sql, db } = database();
  const objects = new Map<string, Uint8Array>();
  const sent: EmailPayload[] = [];
  let time = NOW;
  const bucket = {
    async put(key: string, value: Uint8Array | string) {
      objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : value.slice());
      return {};
    },
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        size: bytes.length,
        body: new Blob([new Uint8Array(bytes).buffer]).stream(),
        async arrayBuffer() {
          return bytes.slice().buffer;
        },
      };
    },
    async delete(keys: string | string[]) {
      for (const key of typeof keys === 'string' ? [keys] : keys) objects.delete(key);
    },
  };
  // These are explicit test doubles for external storage and email, never production feature flags.
  const env = {
    DB: db,
    BOOKS: bucket as unknown as R2Bucket,
    ORIGIN: 'https://palim.example',
    SENDER: 'reading@palim.example',
    SIGNING_SECRET: 'synthetic-test-signing-key-not-a-real-credential-2026',
    AUTH_SECRET: 'synthetic-test-auth-key-not-a-real-credential-2026',
    EMAIL: {
      async send(payload: EmailPayload) {
        sent.push(payload);
        return { messageId: `message-${sent.length}` };
      },
    },
  } as Env;
  const palim = new Palim(env, () => time);
  await palim.store.upsertUser('alice', 'Alice');
  await palim.store.upsertUser('bob', 'Bob');
  for (const [owner, email, id] of [
    ['alice', 'alice@kindle.com', '00000000-0000-4000-8000-000000000001'],
    ['bob', 'bob@kindle.com', '00000000-0000-4000-8000-000000000002'],
  ] as const) {
    sql
      .prepare(
        'INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)',
      )
      .run(id, owner, 'My reader', email, NOW);
    sql.prepare('UPDATE users SET default_destination_id=? WHERE id=?').run(id, owner);
  }
  return {
    sql,
    env,
    palim,
    objects,
    sent,
    setTime(n: number) {
      time = n;
    },
    async session(owner = 'alice') {
      const email = `${owner}@example.invalid`,
        now = Date.now();
      sql
        .prepare(
          'INSERT OR IGNORE INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)',
        )
        .run(owner, owner, email, now, now);
      const captured: EmailPayload[] = [];
      const authEnv = {
        ...env,
        EMAIL: {
          async send(payload: EmailPayload) {
            captured.push(payload);
            return { messageId: 'synthetic-login' };
          },
        },
      };
      const req = (path: string, value: unknown) =>
        new Request(env.ORIGIN + path, {
          method: 'POST',
          headers: {
            Origin: env.ORIGIN,
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.0.2.10',
          },
          body: JSON.stringify(value),
        });
      await authRoute(
        req('/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }),
        authEnv,
      );
      const code = /code is ([0-9]+)/.exec(captured[0]!.text)![1];
      const response = await authRoute(
        req('/auth/sign-in/email-otp', { email, otp: code }),
        authEnv,
      );
      if (!response?.ok) throw new Error('Fixture login failed: ' + (await response?.text()));
      return response.headers
        .getSetCookie()
        .find((c) => c.startsWith('__Host-palim='))!
        .split(';')[0]!;
    },
  };
}
export const simpleBook = {
  title: 'A useful guide',
  creator: 'The author',
  language: 'en',
  chapters: [
    {
      title: 'One thing',
      markdown: 'A useful explanation with **emphasis** and a concrete example.',
    },
  ],
};
export const pdf = () =>
  new TextEncoder().encode(
    '%PDF-1.7\n% Synthetic forwarding fixture\n1 0 obj<</Type/Catalog>>endobj\n%%EOF',
  );
