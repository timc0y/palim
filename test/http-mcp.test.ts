import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { makeMcp, mcpFetch } from '../src/mcp.js';
import { appFetch } from '../src/routes.js';
import { readBytes, checkOrigin, secureHeaders } from '../src/http.js';
import { fixture, simpleBook } from './helpers.js';
test('official MCP client lists the guide and publishing tools and creates a draft', async () => {
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
      'import_image',
      'list_destinations',
      'send_document',
    ]);
    const createTool = tools.tools.find((tool) => tool.name === 'create_book')!;
    assert.match(createTool.description ?? '', /Minimal|Example/i);
    assert.match(createTool.description ?? '', /Never sends mail/);
    const destinationsTool = tools.tools.find((tool) => tool.name === 'list_destinations')!;
    assert.equal(destinationsTool.annotations?.readOnlyHint, true);
    assert.equal(destinationsTool.annotations?.idempotentHint, true);
    assert.equal(destinationsTool.annotations?.openWorldHint, false);
    const result = await client.callTool({ name: 'create_book', arguments: simpleBook });
    assert.notEqual(result.isError, true);
    const textResult = CallToolResultSchema.parse(result);
    const textContent = textResult.content.find((item) => item.type === 'text');
    assert.ok(textContent && textContent.type === 'text');
    assert.deepEqual(JSON.parse(textContent.text), result.structuredContent);
    assert.equal(typeof result.structuredContent, 'object');
    assert.equal(f.sent.length, 0);
    const guideResult = CallToolResultSchema.parse(
      await client.callTool({ name: 'get_guide', arguments: {} }),
    );
    const guide = guideResult.content.find((item) => item.type === 'text');
    assert.ok(guide && guide.type === 'text');
    assert.equal(guide.text, client.getInstructions());
    assert.match(guide.text, /Never call create_book to forward an original/);
    assert.match(guide.text, /list_destinations/);
    assert.match(guide.text, /"chapters"/);
    const guideTool = tools.tools.find((tool) => tool.name === 'get_guide');
    assert.equal(guideTool?.annotations?.readOnlyHint, true);
    assert.equal(guideTool?.annotations?.idempotentHint, true);
    assert.equal(guideResult.structuredContent, undefined);

    const content = CallToolResultSchema.parse(result).content.find((item) => item.type === 'text');
    assert.ok(content && content.type === 'text');
    const artifact = JSON.parse(content.text);
    f.sql.prepare('DELETE FROM reader_destinations WHERE owner=?').run('alice');
    const blocked = await client.callTool({
      name: 'send_document',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(blocked.isError, true);
    assert.equal(blocked.structuredContent, undefined);
    assert.match(JSON.stringify(blocked), /DESTINATION_REQUIRED/);
    assert.equal(f.sent.length, 0);
  } finally {
    await client.close();
    await server.close();
  }
});

test('saved destination discovery exposes only labels, confirms scope and sends no email', async () => {
  const f = await fixture();
  const c = await (async () => {
    const server = makeMcp(f.env, 'alice', ['books:read', 'books:send']);
    const client = new Client({ name: 'destination-discovery-test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    return {
      server,
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  })();
  f.sql.prepare('DELETE FROM reader_destinations WHERE owner=?').run('alice');
  f.sql
    .prepare('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)')
    .run('reader-alice', 'alice', 'Personal Kindle', 'private@example.test', 1);
  f.sql
    .prepare('UPDATE users SET default_destination_id=? WHERE id=?')
    .run('reader-alice', 'alice');
  try {
    const result = CallToolResultSchema.parse(
      await c.client.callTool({ name: 'list_destinations', arguments: {} }),
    );
    assert.equal(result.isError, undefined);
    const data = result.structuredContent as Record<string, unknown>;
    const text = result.content.find((item) => item.type === 'text');
    assert.ok(text && text.type === 'text');
    assert.deepEqual(JSON.parse(text.text), data);
    assert.deepEqual(data.destinations, [
      { id: 'reader-alice', label: 'Personal Kindle', isDefault: true },
    ]);
    assert.equal(data.defaultDestinationId, 'reader-alice');
    assert.equal(data.setupUrl, 'https://palim.example/app#studio-settings');
    assert.deepEqual(Object.keys(data).sort(), [
      'defaultDestinationId',
      'destinations',
      'setupUrl',
    ]);
    assert.doesNotMatch(JSON.stringify(data), /private@example\.test/);
    assert.equal(f.sent.length, 0);
    const tool = (await c.client.listTools()).tools.find(
      (item) => item.name === 'list_destinations',
    )!;
    assert.deepEqual(tool._meta?.securitySchemes, [{ type: 'oauth2', scopes: ['books:send'] }]);

    const readonlyServer = makeMcp(f.env, 'alice', ['books:read']);
    const readonlyClient = new Client({ name: 'destination-scope-test', version: '1' });
    const [ra, rb] = InMemoryTransport.createLinkedPair();
    await readonlyServer.connect(ra);
    await readonlyClient.connect(rb);
    try {
      const denied = CallToolResultSchema.parse(
        await readonlyClient.callTool({ name: 'list_destinations', arguments: {} }),
      );
      assert.equal(denied.isError, true);
      assert.equal(denied.structuredContent, undefined);
      const denialText = denied.content.find((item) => item.type === 'text');
      assert.ok(denialText && denialText.type === 'text');
      assert.equal(JSON.parse(denialText.text).code, 'SCOPE_REQUIRED');
    } finally {
      await readonlyClient.close();
      await readonlyServer.close();
    }
  } finally {
    await c.close();
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
test('authenticated workspace image upload produces an owned figure usable in a book', async () => {
  const f = await fixture();
  const cookie = await f.session();
  const image = readFileSync(new URL('../public/images/sample-exposure.png', import.meta.url));
  const response = await appFetch(
    new Request('https://palim.example/api/files?kind=image', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: f.env.ORIGIN, 'Content-Type': 'image/png' },
      body: new Uint8Array(image).buffer,
    }),
    f.env,
  );
  assert.equal(response!.status, 201);
  const asset = (await response!.json()) as { artifactId: string; kind: string };
  assert.equal(asset.kind, 'image');
  const created = await appFetch(
    new Request('https://palim.example/api/books', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: f.env.ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...simpleBook,
        chapters: [{ title: 'Image', markdown: '![Image](figure:image)' }],
        figures: [
          {
            kind: 'image',
            id: 'image',
            assetId: asset.artifactId,
            alt: 'A synthetic image',
            caption: 'The image',
          },
        ],
      }),
    }),
    f.env,
  );
  assert.equal(created!.status, 201);
  const book = (await created!.json()) as { artifactId: string };
  const zip = await JSZip.loadAsync(f.objects.get(`alice/${book.artifactId}`)!);
  assert.deepEqual(await zip.file('EPUB/fig-image.png')!.async('nodebuffer'), image);
  assert.equal(f.sent.length, 0);
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
    for (const name of ['send_document', 'import_image']) {
      const tool = (await client.listTools()).tools.find((t) => t.name === name)!;
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
    }
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

test('public reading fonts allow anonymous loading in sandboxed book previews', async () => {
  const f = await fixture();
  const env = {
    ...f.env,
    ASSETS: {
      async fetch() {
        return new Response('synthetic font', { headers: { 'Content-Type': 'font/woff2' } });
      },
    } as unknown as Fetcher,
  };
  for (const name of [
    'Manrope-Latin.woff2',
    'Manrope-Extended.woff2',
    'IBMPlexMono-Latin-400.woff2',
    'IBMPlexMono-Latin-500.woff2',
  ]) {
    const response = await appFetch(new Request(`${env.ORIGIN}/fonts/${name}`), env);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(await response.text(), 'synthetic font');
  }
  const other = await appFetch(new Request(`${env.ORIGIN}/reader.css`), env);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(f.sent.length, 0);
});
