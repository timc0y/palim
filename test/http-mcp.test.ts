import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { makeMcp, mcpFetch } from '../src/mcp.js';
import { appFetch } from '../src/routes.js';
import { readBytes, checkOrigin, secureHeaders } from '../src/http.js';
import { fixture, simpleBook } from './helpers.js';
test('official MCP client lists the guide and three publishing tools and creates a draft', async () => {
  const f = await fixture();
  const server = makeMcp(f.env, 'alice', ['books:read', 'books:write', 'books:send']),
    client = new Client({ name: 'test-client', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    assert.match(client.getInstructions() ?? '', /no skill installation/i);
    assert.match(client.getInstructions() ?? '', /24 hours.*15 minutes/);
    assert.match(client.getInstructions() ?? '', /workspace|\/app/);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      'create_book',
      'get_delivery',
      'get_guide',
      'send_document',
    ]);
    const result = await client.callTool({ name: 'create_book', arguments: simpleBook });
    assert.notEqual(result.isError, true);
    assert.equal(f.sent.length, 0);
    const guideResult = CallToolResultSchema.parse(
      await client.callTool({ name: 'get_guide', arguments: {} }),
    );
    const guide = guideResult.content.find((item) => item.type === 'text');
    assert.ok(guide && guide.type === 'text');
    assert.equal(guide.text, client.getInstructions());
    assert.match(guide.text, /Never call create_book to forward an original/);
    const guideTool = tools.tools.find((tool) => tool.name === 'get_guide');
    assert.equal(guideTool?.annotations?.readOnlyHint, true);
    assert.equal(guideTool?.annotations?.idempotentHint, true);

    const content = CallToolResultSchema.parse(result).content.find((item) => item.type === 'text');
    assert.ok(content && content.type === 'text');
    const artifact = JSON.parse(content.text);
    f.sql.prepare('DELETE FROM reader_destinations WHERE owner=?').run('alice');
    const blocked = await client.callTool({
      name: 'send_document',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(blocked.isError, true);
    assert.match(JSON.stringify(blocked), /DESTINATION_REQUIRED/);
    assert.equal(f.sent.length, 0);
  } finally {
    await client.close();
    await server.close();
  }
});
test('missing OAuth scope fails before rendering', async () => {
  const f = await fixture();
  const server = makeMcp(f.env, 'alice', ['books:read']),
    client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const result = await client.callTool({ name: 'create_book', arguments: simpleBook });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /SCOPE_REQUIRED/);
    assert.equal(f.objects.size, 0);
  } finally {
    await client.close();
    await server.close();
  }
});
test('stateless Streamable HTTP initializes with official transport', async () => {
  const f = await fixture();
  const request = new Request('https://palim.example/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    }),
  });
  const response = await mcpFetch(request, f.env, 'alice', [
    'books:read',
    'books:write',
    'books:send',
  ]);
  assert.equal(response.status, 200);
  const result = (await response.json()) as { result: { serverInfo: { name: string } } };
  assert.equal(result.result.serverInfo.name, 'palim');
});
test('browser mutations need the exact origin and a real session', async () => {
  const f = await fixture();
  const cookie = await f.session();
  await assert.rejects(
    appFetch(
      new Request('https://palim.example/api/books', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: 'https://evil.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(simpleBook),
      }),
      f.env,
    ),
    /Palim site/,
  );
  await assert.rejects(
    appFetch(new Request('https://palim.example/api/account'), f.env),
    /Sign in/,
  );
  assert.equal(f.objects.size, 0);
});
test('authenticated browser route creates an artifact without sending', async () => {
  const f = await fixture();
  const cookie = await f.session();
  const response = await appFetch(
    new Request('https://palim.example/api/books', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'https://palim.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(simpleBook),
    }),
    f.env,
  );
  assert.equal(response.status, 201);
  assert.equal(f.sent.length, 0);
});
test('body limits work even without a Content-Length header', async () => {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(15));
      c.enqueue(new Uint8Array(15));
      c.close();
    },
  });
  await assert.rejects(readBytes(new Response(body), 20), /size/);
});
test('origin comparison rejects lookalike hosts and missing origin', () => {
  for (const origin of ['https://palim.example.evil.test', 'null', 'http://palim.example'])
    assert.throws(() =>
      checkOrigin(
        new Request('https://palim.example/api/send', { headers: { Origin: origin } }),
        'https://palim.example',
      ),
    );
});
test('sign-in return paths reject control-character and scheme-relative redirects', async () => {
  const { returnPath } = await import('../src/auth.js');
  for (const path of [
    '/\t/evil.example',
    '/\r\n/evil.example',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
  ])
    assert.equal(returnPath(path), '/app');
  assert.equal(returnPath('/app?a=1'), '/app?a=1');
});
test('ChatGPT file-input metadata declares exactly the required host fields', async () => {
  const f = await fixture();
  const server = makeMcp(f.env, 'alice', ['books:read', 'books:write', 'books:send']),
    client = new Client({ name: 'descriptor-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'send_document')!;
    assert.deepEqual(tool._meta?.['openai/fileParams'], ['file']);
    assert.equal(tool.annotations?.idempotentHint, false);
    const file = tool.inputSchema.properties?.file as {
      properties: Record<string, unknown>;
      required: string[];
    };
    assert.deepEqual(Object.keys(file.properties).sort(), [
      'download_url',
      'file_id',
      'file_name',
      'mime_type',
    ]);
    assert.deepEqual([...file.required].sort(), ['download_url', 'file_id']);
  } finally {
    await client.close();
    await server.close();
  }
});

test('HTML control forms retain same-origin Origin while private preview policy stays no-referrer', () => {
  const html = secureHeaders(
    new Response('<form method="post"></form>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  );
  assert.equal(html.headers.get('Referrer-Policy'), 'same-origin');
  const privatePreview = secureHeaders(
    new Response('private', {
      headers: { 'Content-Type': 'text/html', 'Referrer-Policy': 'no-referrer' },
    }),
  );
  assert.equal(privatePreview.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(secureHeaders(Response.json({})).headers.get('Referrer-Policy'), 'no-referrer');
  for (const origin of ['null', 'https://foreign.invalid'])
    assert.throws(() =>
      checkOrigin(
        new Request('https://palim.example/authorize', {
          method: 'POST',
          headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' },
        }),
        'https://palim.example',
      ),
    );
  assert.throws(() =>
    checkOrigin(
      new Request('https://palim.example/authorize', {
        method: 'POST',
        headers: { Origin: 'https://palim.example', 'Sec-Fetch-Site': 'cross-site' },
      }),
      'https://palim.example',
    ),
  );
});
