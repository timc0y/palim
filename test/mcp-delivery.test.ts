import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { makeMcp } from '../src/mcp.js';
import { buildBook } from '../src/book.js';
import { fixture, simpleBook, pdf } from './helpers.js';

function output(value: unknown): Record<string, unknown> {
  const result = z
    .object({ content: z.array(z.object({ type: z.literal('text'), text: z.string() })) })
    .parse(value);
  return z.record(z.string(), z.unknown()).parse(JSON.parse(result.content[0]!.text));
}
async function connect(
  f: Awaited<ReturnType<typeof fixture>>,
  owner = 'alice',
  scopes = ['books:read', 'books:write', 'books:send'],
) {
  const server = makeMcp(f.env, owner, scopes),
    client = new Client({ name: 'delivery-contract-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

test('MCP send_document and get_delivery preserve bytes and never double-send a repeated intent', async () => {
  const f = await fixture(),
    original = (await buildBook(simpleBook)).bytes;
  const artifact = await f.palim.upload('alice', original, 'existing.epub');
  const c = await connect(f);
  try {
    const sent = await c.client.callTool({
      name: 'send_document',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.notEqual(sent.isError, true);
    const receipt = output(sent);
    assert.equal(receipt.state, 'submitted');
    assert.equal(receipt.kindleReceipt, 'unverified');
    assert.deepEqual(
      Buffer.from(f.sent[0]!.attachments[0]!.content, 'base64'),
      Buffer.from(original),
    );
    const read = await c.client.callTool({
      name: 'get_delivery',
      arguments: { deliveryId: receipt.deliveryId },
    });
    assert.notEqual(read.isError, true);
    assert.equal(output(read).deliveryId, receipt.deliveryId);
    const repeat = await c.client.callTool({
      name: 'send_document',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(output(repeat).deliveryId, receipt.deliveryId);
    assert.equal(f.sent.length, 1);
  } finally {
    await c.close();
  }
});

test('MCP accepts a real host-file shape and forwards the fetched bytes unchanged', async (t) => {
  const f = await fixture(),
    original = (await buildBook(simpleBook)).bytes;
  let fetched = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), 'https://files.example/synthetic-book.epub');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    fetched++;
    return new Response(new Uint8Array(original).buffer, {
      headers: { 'Content-Type': 'application/epub+zip' },
    });
  });
  const c = await connect(f);
  try {
    const response = await c.client.callTool({
      name: 'send_document',
      arguments: {
        file: {
          download_url: 'https://files.example/synthetic-book.epub',
          file_id: 'synthetic-file-id',
          mime_type: 'application/epub+zip',
          file_name: 'Original author.epub',
        },
      },
    });
    assert.notEqual(response.isError, true);
    assert.equal(output(response).state, 'submitted');
    assert.equal(fetched, 1);
    assert.equal(f.sent.length, 1);
    assert.deepEqual(
      Buffer.from(f.sent[0]!.attachments[0]!.content, 'base64'),
      Buffer.from(original),
    );
    const objects = f.sql.prepare('SELECT generated FROM artifacts').all();
    assert.equal(objects.length, 1);
    assert.equal(objects[0]?.generated, 0);
  } finally {
    await c.close();
  }
});

test('blocked host-file diagnostics expose only the origin without network or side effects', async (t) => {
  const f = await fixture();
  f.env.FILE_ORIGINS = '';
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('A denied origin must never be fetched');
  });
  const c = await connect(f);
  try {
    const result = await c.client.callTool({
      name: 'send_document',
      arguments: {
        file: {
          download_url:
            'https://private-user:private-password@untrusted.example/private-book.epub?signature=private-token#private-fragment',
          file_id: 'private-file-identifier',
        },
      },
    });
    assert.equal(result.isError, true);
    const error = output(result);
    assert.equal(error.code, 'FILE_HOST_UNSUPPORTED');
    assert.equal(
      error.message,
      'Secure file transfer is not configured for origin https://untrusted.example. No file was fetched or sent.',
    );
    assert.equal(f.sent.length, 0);
    for (const table of ['artifacts', 'deliveries', 'operations', 'mail_attempts'])
      assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0);
  } finally {
    await c.close();
  }
});

test('MCP delivery ownership and scope failures occur before email submission', async () => {
  const f = await fixture(),
    artifact = await f.palim.upload('alice', pdf(), 'original.pdf');
  const bob = await connect(f, 'bob'),
    limited = await connect(f, 'alice', ['books:read']);
  try {
    const denied = await bob.client.callTool({
      name: 'send_document',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(denied.isError, true);
    assert.equal(output(denied).code, 'ARTIFACT_NOT_FOUND');
    const noScope = await limited.client.callTool({
      name: 'send_document',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(noScope.isError, true);
    assert.equal(output(noScope).code, 'SCOPE_REQUIRED');
    assert.equal(f.sent.length, 0);
  } finally {
    await bob.close();
    await limited.close();
  }
});

test('MCP receipt access cannot disclose another account’s submission', async () => {
  const f = await fixture(),
    artifact = await f.palim.upload('alice', pdf(), 'original.pdf'),
    receipt = await f.palim.send('alice', artifact.artifactId);
  const bob = await connect(f, 'bob');
  try {
    const result = await bob.client.callTool({
      name: 'get_delivery',
      arguments: { deliveryId: receipt.deliveryId },
    });
    assert.equal(result.isError, true);
    assert.equal(output(result).code, 'DELIVERY_NOT_FOUND');
    assert.equal(f.sent.length, 1);
  } finally {
    await bob.close();
  }
});
