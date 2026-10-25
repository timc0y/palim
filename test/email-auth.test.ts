import test from 'node:test';
import assert from 'node:assert/strict';
import { authRoute, session } from '../src/auth.js';
import { authentication } from '../src/login.js';
import { Store } from '../src/store.js';
import { fixture, simpleBook, NOW } from './helpers.js';
const req = (path: string, value: unknown, cookie = '') =>
  new Request('https://palim.example' + path, {
    method: 'POST',
    headers: {
      Origin: 'https://palim.example',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.50',
      Cookie: cookie,
    },
    body: JSON.stringify(value),
  });
const send = (email = 'new@example.invalid') =>
  req('/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
const code = (text: string) => /code is (\d{6})/.exec(text)![1]!;
test('Better Auth encrypts codes, sets secure host-only session, consumes code and revokes logout', async () => {
  const f = await fixture();
  assert.equal((await authRoute(send(), f.env))?.status, 200);
  const otp = code(f.sent[0]!.text);
  assert.ok(
    !String(f.sql.prepare('SELECT value FROM auth_verifications').get()!.value).includes(otp),
  );
  const response = (await authRoute(
    req('/auth/sign-in/email-otp', { email: 'new@example.invalid', otp }),
    f.env,
  ))!;
  assert.equal(response.status, 200);
  const header = response.headers.getSetCookie().find((c) => c.startsWith('__Host-palim='))!;
  for (const attr of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/'])
    assert.ok(header.includes(attr));
  assert.ok(!/Domain=/i.test(header));
  const cookie = header.split(';')[0]!;
  assert.ok(await session(new Request(f.env.ORIGIN, { headers: { Cookie: cookie } }), f.env));
  assert.equal(
    (await authRoute(req('/auth/sign-in/email-otp', { email: 'new@example.invalid', otp }), f.env))
      ?.ok,
    false,
  );
  assert.equal((await authRoute(req('/auth/logout', {}, cookie), f.env))?.status, 303);
  assert.equal(
    await session(new Request(f.env.ORIGIN, { headers: { Cookie: cookie } }), f.env),
    null,
  );
});
test('throttled resend preserves old code without using another mail slot', async () => {
  const f = await fixture();
  await authRoute(send(), f.env);
  const before = f.sql.prepare('SELECT value FROM auth_verifications').get()!.value;
  await authRoute(send(), f.env);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sql.prepare('SELECT value FROM auth_verifications').get()!.value, before);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM mail_attempts').get()!.n, 1);
  assert.equal(
    (
      await authRoute(
        req('/auth/sign-in/email-otp', {
          email: 'new@example.invalid',
          otp: code(f.sent[0]!.text),
        }),
        f.env,
      )
    )?.status,
    200,
  );
});
test('auth fails closed for missing secret, foreign origin, unused endpoints and non sign-in purposes', async () => {
  const f = await fixture();
  assert.throws(() => authentication({ ...f.env, AUTH_SECRET: '' }), /authentication secret/);
  await assert.rejects(
    authRoute(
      new Request(send(), {
        headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' },
      }),
      f.env,
    ),
    /Palim site/,
  );
  for (const path of [
    '/auth/email-otp/request-password-reset',
    '/auth/email-otp/change-email',
    '/auth/email-otp/check-verification-otp',
    '/auth/get-session',
  ])
    await assert.rejects(authRoute(req(path, {}), f.env), /No such/);
  await assert.rejects(
    authRoute(
      req('/auth/email-otp/send-verification-otp', {
        email: 'new@example.invalid',
        type: 'forget-password',
      }),
      f.env,
    ),
    /valid inbox/,
  );
  assert.equal(f.sent.length, 0);
});
test('expired, exhausted and concurrently redeemed OTPs issue no extra sessions', async () => {
  for (const mode of ['expired', 'exhausted', 'concurrent']) {
    const f = await fixture();
    await authRoute(send(), f.env);
    const otp = code(f.sent[0]!.text);
    if (mode === 'expired')
      f.sql.prepare('UPDATE auth_verifications SET expiresAt=?').run(Date.now() - 1000);
    if (mode === 'exhausted')
      for (let i = 0; i < 3; i++)
        assert.equal(
          (
            await authRoute(
              req('/auth/sign-in/email-otp', {
                email: 'new@example.invalid',
                otp: otp === '000000' ? '111111' : '000000',
              }),
              f.env,
            )
          )?.ok,
          false,
        );
    const result = await Promise.all([
      authRoute(req('/auth/sign-in/email-otp', { email: 'new@example.invalid', otp }), f.env),
      authRoute(req('/auth/sign-in/email-otp', { email: 'new@example.invalid', otp }), f.env),
    ]);
    assert.equal(result.filter((r) => r?.ok).length, mode === 'concurrent' ? 1 : 0);
  }
});
test('disabled identity loses access through its existing session', async () => {
  const f = await fixture();
  const cookie = await f.session();
  f.sql.prepare("UPDATE users SET disabled=1 WHERE id='alice'").run();
  await assert.rejects(
    session(new Request(f.env.ORIGIN, { headers: { Cookie: cookie } }), f.env),
    /Sign in/,
  );
});
test('saved readers are private and prior delivery intent stays frozen after default change or removal', async () => {
  const f = await fixture(),
    alice = (await f.palim.store.readers('alice'))[0]!,
    bob = (await f.palim.store.readers('bob'))[0]!;
  assert.deepEqual(
    (await f.palim.account('alice')).destinations.map((d) => d.email),
    ['alice@kindle.com'],
  );
  for (const op of [
    () => f.palim.store.defaultReader('alice', bob.id),
    () => f.palim.store.removeReader('alice', bob.id),
  ])
    await assert.rejects(op(), /confirmed readers/);
  const a = await f.palim.create('alice', simpleBook);
  await assert.rejects(f.palim.send('alice', a.artifactId, undefined, bob.id), /confirmed readers/);
  const first = await f.palim.send('alice', a.artifactId);
  assert.equal(first.destinationId, alice.id);
  const second = crypto.randomUUID();
  f.sql
    .prepare('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)')
    .run(second, 'alice', 'Other Kindle', 'other@kindle.com', NOW);
  await f.palim.store.defaultReader('alice', second);
  assert.equal((await f.palim.send('alice', a.artifactId)).deliveryId, first.deliveryId);
  await f.palim.store.removeReader('alice', alice.id);
  assert.equal((await f.palim.send('alice', a.artifactId)).deliveryId, first.deliveryId);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0]!.to, 'alice@kindle.com');
  assert.equal(
    (await f.palim.send('alice', a.artifactId, undefined, second)).destinationId,
    second,
  );
  assert.equal(f.sent[1]!.to, 'other@kindle.com');
});
test('shared ledger admits just one login or document at final global slot', async () => {
  const f = await fixture(),
    now = Math.floor(Date.now() / 1000);
  f.setTime(now);
  for (let i = 0; i < 79; i++)
    f.sql
      .prepare(
        "INSERT INTO mail_attempts(id,purpose,recipient_hash,created_at) VALUES(?,'document','hash',?)",
      )
      .run('used-' + i, now);
  const a = await f.palim.create('alice', simpleBook);
  const result = await Promise.allSettled([
    new Store(f.env.DB).claimLogin('login-hash'),
    f.palim.send('alice', a.artifactId),
  ]);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM mail_attempts').get()!.n, 80);
  if (result[0]!.status === 'fulfilled' && result[0].value) assert.equal(f.sent.length, 0);
  else assert.equal(f.sent.length, 1);
});

test('browser explicit recipient and MCP default share one original receipt even when concurrent', async () => {
  for (const explicitFirst of [true, false]) {
    const f = await fixture();
    const a = await f.palim.create('alice', simpleBook),
      id = (await f.palim.store.readers('alice'))[0]!.id;
    const requests = explicitFirst ? [id, undefined] : [undefined, id];
    const receipts = await Promise.all(
      requests.map((d) => f.palim.send('alice', a.artifactId, undefined, d)),
    );
    assert.equal(receipts[0]!.deliveryId, receipts[1]!.deliveryId);
    assert.equal(f.sent.length, 1);
    const other = crypto.randomUUID();
    f.sql
      .prepare(
        'INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)',
      )
      .run(other, 'alice', 'Other reader', 'other@kindle.com', NOW);
    await f.palim.store.defaultReader('alice', other);
    assert.equal((await f.palim.send('alice', a.artifactId)).deliveryId, receipts[0]!.deliveryId);
    assert.equal(f.sent.length, 1);
  }
});
