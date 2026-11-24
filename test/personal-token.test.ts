import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appFetch } from '../src/routes.js';
import { mcpFetch } from '../src/mcp.js';
import { tokenOwner } from '../src/personal-token.js';
import { fixture } from './helpers.js';

test('account tokens are isolated, replaced and revoked through signed-in same-origin settings', async () => {
  const { env, session, sql } = await fixture();
  const alice = await session('alice');
  const bob = await session('bob');
  const change = (cookie: string, method: string, origin = env.ORIGIN) =>
    appFetch(
      new Request(env.ORIGIN + '/api/mcp-token', { method, headers: { origin, cookie } }),
      env,
    );
  const account = async (cookie: string) =>
    (await (
      await appFetch(new Request(env.ORIGIN + '/api/account', { headers: { cookie } }), env)
    ).json()) as { hasMcpToken: boolean };

  assert.equal((await account(alice)).hasMcpToken, false);
  await assert.rejects(change('', 'POST'));
  await assert.rejects(change(alice, 'POST', 'https://other.invalid'));

  const firstRes = await change(alice, 'POST');
  assert.equal(firstRes.status, 201);
  const firstPayload = (await firstRes.json()) as { token: string; hasMcpToken: boolean };
  const first = firstPayload.token;
  assert.equal(firstPayload.hasMcpToken, true);
  assert.equal((await account(alice)).hasMcpToken, true);
  assert.equal(await tokenOwner(first, env), 'alice');
  assert.notEqual(
    sql.prepare('SELECT mcp_token_digest FROM users WHERE id=?').get('alice')!.mcp_token_digest,
    first,
  );

  await change(bob, 'DELETE');
  assert.equal(await tokenOwner(first, env), 'alice');

  const second = ((await (await change(alice, 'POST')).json()) as { token: string }).token;
  assert.equal(await tokenOwner(first, env), null);
  assert.equal(await tokenOwner(second, env), 'alice');

  sql.prepare('UPDATE users SET disabled=1 WHERE id=?').run('alice');
  assert.equal(await tokenOwner(second, env), null);
  sql.prepare('UPDATE users SET disabled=0 WHERE id=?').run('alice');

  const revoked = (await (await change(alice, 'DELETE')).json()) as {
    revoked: boolean;
    hasMcpToken: boolean;
  };
  assert.equal(revoked.revoked, true);
  assert.equal(revoked.hasMcpToken, false);
  assert.equal((await account(alice)).hasMcpToken, false);
  assert.equal(await tokenOwner(second, env), null);
});

test('personal MCP token resolves owner for /mcp tools and never authenticates browser routes', async () => {
  const f = await fixture();
  const alice = await f.session('alice');

  const created = await appFetch(
    new Request(f.env.ORIGIN + '/api/mcp-token', {
      method: 'POST',
      headers: { origin: f.env.ORIGIN, cookie: alice },
    }),
    f.env,
  );
  const { token } = (await created.json()) as { token: string };
  const owner = await tokenOwner(token, f.env);
  assert.equal(owner, 'alice');

  const mcpPost = (ownerId: string, body: unknown, extraHeaders: Record<string, string> = {}) =>
    mcpFetch(
      new Request(f.env.ORIGIN + '/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      }),
      f.env,
      ownerId,
      ['books:read', 'books:write', 'books:send'],
    );

  const tools = await mcpPost(owner, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  assert.equal(tools.status, 200);
  const toolsJson = (await tools.json()) as { result: { tools: { name: string }[] } };
  assert.deepEqual(toolsJson.result.tools.map((t) => t.name).sort(), [
    'create_book',
    'get_artifact',
    'get_delivery',
    'get_guide',
    'import_image',
    'list_destinations',
    'send_document',
  ]);

  const createdBook = await mcpPost(owner, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'create_book',
      arguments: {
        title: 'Token draft',
        language: 'en',
        chapters: [{ title: 'Start', markdown: 'A book created with a personal MCP token.' }],
      },
    },
  });
  assert.equal(createdBook.status, 200);
  const bookResult = (await createdBook.json()) as {
    result: { isError?: boolean; structuredContent: { artifactId: string } };
  };
  assert.notEqual(bookResult.result.isError, true);
  assert.equal(
    f.sql
      .prepare('SELECT owner FROM artifacts WHERE id=?')
      .get(bookResult.result.structuredContent.artifactId)?.owner,
    'alice',
  );
  assert.equal(f.sent.length, 0);

  const foreignOrigin = await mcpPost(
    owner,
    { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
    { Origin: 'https://evil.example' },
  );
  assert.equal(foreignOrigin.status, 403);

  await assert.rejects(
    appFetch(
      new Request(f.env.ORIGIN + '/api/account', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      f.env,
    ),
    /Sign in/,
  );

  assert.equal(await tokenOwner('palim_' + '0'.repeat(64), f.env), null);
});
