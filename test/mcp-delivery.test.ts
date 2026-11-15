import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { makeMcp } from '../src/mcp.js';
import { buildBook } from '../src/book.js';
import { fixture, simpleBook, pdf } from './helpers.js';

function output(value: unknown): Record<string, unknown> {
  const result = z
    .object({ content: z.array(z.object({ type: z.literal('text'), text: z.string() })) })
    .parse(value);
  const parsed = z.record(z.string(), z.unknown()).parse(JSON.parse(result.content[0]!.text));
  const call = value as { isError?: boolean; structuredContent?: Record<string, unknown> };
  if (call.isError) assert.equal(call.structuredContent, undefined);
  else assert.deepEqual(call.structuredContent, parsed);
  return parsed;
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

test('MCP imports an owned image and creates an EPUB with repeated captions', async (t) => {
  const f = await fixture();
  const image = readFileSync(new URL('../public/images/sample-exposure.png', import.meta.url));
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.redirect, 'manual');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    return new Response(new Uint8Array(image).buffer);
  });
  const alice = await connect(f);
  const bob = await connect(f, 'bob');
  try {
    const imported = await alice.client.callTool({
      name: 'import_image',
      arguments: { file: { download_url: 'https://files.example/figure.png', file_id: 'host-id' } },
    });
    assert.notEqual(imported.isError, true);
    const assetId = output(imported).artifactId;
    const manuscript = {
      ...simpleBook,
      chapters: [
        { title: 'Figures', markdown: '![one](figure:example)\n\n![two](figure:example)' },
      ],
      figures: [
        {
          kind: 'image',
          id: 'example',
          assetId,
          alt: 'A synthetic illustration',
          caption: 'A useful caption',
        },
      ],
    };
    const denied = await bob.client.callTool({ name: 'create_book', arguments: manuscript });
    assert.equal(denied.isError, true);
    const result = await alice.client.callTool({ name: 'create_book', arguments: manuscript });
    assert.notEqual(result.isError, true);
    const bookId = output(result).artifactId;
    const epub = f.objects.get(`alice/${bookId}`)!;
    const zip = await JSZip.loadAsync(epub);
    const chapter = await zip.file('EPUB/chapter-1.xhtml')!.async('text');
    assert.equal((chapter.match(/<figure\b/g) ?? []).length, 2);
    assert.equal(
      (
        chapter.match(
          /<figcaption><span class="figure-number">Figure 1\.<\/span> A useful caption<\/figcaption>/g,
        ) ?? []
      ).length,
      2,
    );
    assert.equal((chapter.match(/alt="A synthetic illustration"/g) ?? []).length, 2);
    assert.deepEqual(await zip.file('EPUB/fig-example.png')!.async('nodebuffer'), image);
    assert.equal(f.sent.length, 0);
  } finally {
    await alice.close();
    await bob.close();
  }
});

test('MCP image import enforces scope, URL, image format and upload allowance', async (t) => {
  const f = await fixture();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('not an image');
  });
  const readonly = await connect(f, 'alice', ['books:read']);
  const writer = await connect(f);
  const hostFile = { download_url: 'https://files.example/file', file_id: 'host-id' };
  try {
    const forbidden = await readonly.client.callTool({
      name: 'import_image',
      arguments: { file: hostFile },
    });
    assert.equal(output(forbidden).code, 'SCOPE_REQUIRED');
    const unsafe = await writer.client.callTool({
      name: 'import_image',
      arguments: { file: { ...hostFile, download_url: 'http://127.0.0.1/private' } },
    });
    assert.equal(unsafe.isError, true);
    assert.equal(calls, 0);
    const invalid = await writer.client.callTool({
      name: 'import_image',
      arguments: { file: hostFile },
    });
    assert.equal(output(invalid).code, 'IMAGE_FORMAT');
    assert.equal(calls, 1);
    for (let i = 0; i < 5; i++)
      f.sql
        .prepare('INSERT INTO operations(id,owner,kind,created_at) VALUES(?,?,?,?)')
        .run(`image-admission-${i}`, 'alice', 'upload', Math.floor(Date.now() / 1000));
    const full = await writer.client.callTool({
      name: 'import_image',
      arguments: { file: hostFile },
    });
    assert.equal(full.isError, true);
    assert.equal(calls, 1);
    assert.equal(f.objects.size, 0);
    assert.equal(f.sent.length, 0);
  } finally {
    await readonly.close();
    await writer.close();
  }
});

test('MCP creation resumes after an account render increase without resetting attempts', async () => {
  const f = await fixture();
  // MCP uses the live clock, so seed today's admissions rather than a fixed fixture date.
  const now = Math.floor(Date.now() / 1000);
  for (const id of ['used-1', 'used-2'])
    f.sql
      .prepare('INSERT INTO operations(id,owner,kind,created_at) VALUES(?,?,?,?)')
      .run(id, 'alice', 'render', now);
  const c = await connect(f);
  try {
    const blocked = await c.client.callTool({ name: 'create_book', arguments: simpleBook });
    assert.equal(blocked.isError, true);
    assert.equal(output(blocked).code, 'DAILY_LIMIT');
    f.sql.prepare('UPDATE users SET daily_render_limit=20 WHERE id=?').run('alice');
    const created = await c.client.callTool({ name: 'create_book', arguments: simpleBook });
    assert.notEqual(created.isError, true);
    assert.equal(output(created).generated, true);
    assert.equal(
      f.sql
        .prepare("SELECT COUNT(*) n FROM operations WHERE owner='alice' AND kind='render'")
        .get()!.n,
      3,
    );
    assert.equal(f.sent.length, 0);
  } finally {
    await c.close();
  }
});

test('MCP send_document and get_delivery preserve bytes and never double-send a repeated intent', async () => {
  const f = await fixture(),
    original = (await buildBook(simpleBook)).bytes;
  f.setTime(Math.floor(Date.now() / 1000));
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
    assert.deepEqual(Buffer.from(f.sent[0]!.attachments[0]!.content), Buffer.from(original));
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

test('get_artifact refreshes expired links for the same bytes without rendering, uploading or sending', async (t) => {
  const f = await fixture();
  let now = Math.floor(Date.now() / 1000);
  t.mock.method(Date, 'now', () => now * 1000);
  f.setTime(now);
  const c = await connect(f);
  try {
    const created = await c.client.callTool({ name: 'create_book', arguments: simpleBook });
    const original = output(created);
    const artifactId = original.artifactId as string;
    const sha = original.sha256;
    const expiresAt = original.expiresAt;
    const operationsBefore = f.sql.prepare('SELECT count(*) n FROM operations').get()!.n;
    const storedBytes = f.objects.get(`alice/${artifactId}`)!;

    now += 901;
    f.setTime(now);
    const staleUrl = original.downloadUrl as string;
    await assert.rejects(f.palim.download(new Request(staleUrl), artifactId, 'file'), /expired/);
    const refreshed = output(
      await c.client.callTool({ name: 'get_artifact', arguments: { artifactId } }),
    );
    assert.equal(refreshed.artifactId, artifactId);
    assert.equal(refreshed.sha256, sha);
    assert.equal(refreshed.expiresAt, expiresAt);
    assert.equal(refreshed.bytes, original.bytes);
    assert.ok(
      Date.parse(refreshed.linksExpireAt as string) > Date.parse(original.linksExpireAt as string),
    );
    for (const key of ['downloadUrl', 'sourceUrl', 'previewUrl']) {
      const url = refreshed[key];
      if (typeof url === 'string')
        assert.equal(
          Number(new URL(url).searchParams.get('expires')),
          Date.parse(refreshed.linksExpireAt as string) / 1000,
        );
    }
    const downloaded = await f.palim.download(
      new Request(refreshed.downloadUrl as string),
      artifactId,
      'file',
    );
    assert.equal(downloaded.status, 200);
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), storedBytes);
    now = Date.parse(expiresAt as string) / 1000 - 1;
    f.setTime(now);
    const lastLinks = output(
      await c.client.callTool({ name: 'get_artifact', arguments: { artifactId } }),
    );
    assert.equal(lastLinks.linksExpireAt, expiresAt);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM operations').get()!.n, operationsBefore);
    assert.equal(f.sent.length, 0);
  } finally {
    await c.close();
  }
});

test('get_artifact enforces read scope, account ownership, active account and artifact expiry', async () => {
  const f = await fixture();
  const now = Math.floor(Date.now() / 1000);
  f.setTime(now);
  const artifact = await f.palim.create('alice', simpleBook);
  const owner = await connect(f);
  const other = await connect(f, 'bob');
  const readonly = await connect(f, 'alice', ['books:send']);
  try {
    const deniedScope = await readonly.client.callTool({
      name: 'get_artifact',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(deniedScope.isError, true);
    assert.equal(output(deniedScope).code, 'SCOPE_REQUIRED');

    const deniedOwner = await other.client.callTool({
      name: 'get_artifact',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(deniedOwner.isError, true);
    assert.equal(output(deniedOwner).code, 'ARTIFACT_NOT_FOUND');

    f.sql.prepare('UPDATE users SET disabled=1 WHERE id=?').run('alice');
    const disabled = await owner.client.callTool({
      name: 'get_artifact',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(disabled.isError, true);
    assert.equal(output(disabled).code, 'SIGN_IN_REQUIRED');
    f.sql.prepare('UPDATE users SET disabled=0 WHERE id=?').run('alice');

    f.sql
      .prepare('UPDATE artifacts SET expires_at=? WHERE id=? AND owner=?')
      .run(now - 1, artifact.artifactId, 'alice');
    const expired = await owner.client.callTool({
      name: 'get_artifact',
      arguments: { artifactId: artifact.artifactId },
    });
    assert.equal(expired.isError, true);
    assert.equal(output(expired).code, 'ARTIFACT_NOT_FOUND');
    assert.equal(f.sent.length, 0);
  } finally {
    await owner.close();
    await other.close();
    await readonly.close();
  }
});

test('MCP accepts a real host-file shape and forwards the fetched bytes unchanged', async (t) => {
  const f = await fixture(),
    original = (await buildBook(simpleBook)).bytes;
  let fetched = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), 'https://files.example/synthetic-book.epub');
    assert.equal(init?.redirect, 'manual');
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
    assert.deepEqual(Buffer.from(f.sent[0]!.attachments[0]!.content), Buffer.from(original));
    const objects = f.sql.prepare('SELECT generated FROM artifacts').all();
    assert.equal(objects.length, 1);
    assert.equal(objects[0]?.generated, 0);
  } finally {
    await c.close();
  }
});

test('unsafe host-file URLs disclose no URL secrets and cause no network or side effects', async (t) => {
  const f = await fixture();
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
    assert.equal(error.code, 'FILE_URL_UNSAFE');
    assert.equal(
      error.message,
      'Use a public HTTPS file URL on port 443 without credentials, IP literals, local names or fragments.',
    );
    assert.equal(f.sent.length, 0);
    for (const table of ['artifacts', 'deliveries', 'operations', 'mail_attempts'])
      assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0);
  } finally {
    await c.close();
  }
});

test('MCP delivery ownership and scope failures occur before email submission', async () => {
  const f = await fixture();
  f.setTime(Math.floor(Date.now() / 1000));
  const artifact = await f.palim.upload('alice', pdf(), 'original.pdf');
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

test('destination discovery is scoped, tenant-owned, email-free and read-only', async () => {
  const f = await fixture();
  f.sql.prepare('DELETE FROM reader_destinations WHERE owner=?').run('alice');
  f.sql.prepare('DELETE FROM reader_destinations WHERE owner=?').run('bob');
  f.sql
    .prepare('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)')
    .run('alice-reader', 'alice', 'Home Kindle', 'alice-private@example.test', 1);
  f.sql
    .prepare('INSERT INTO reader_destinations(id,owner,label,email,confirmed_at) VALUES(?,?,?,?,?)')
    .run('bob-reader', 'bob', 'Bob Kindle', 'bob-private@example.test', 1);
  f.sql
    .prepare('UPDATE users SET default_destination_id=? WHERE id=?')
    .run('alice-reader', 'alice');
  const alice = await connect(f);
  const bobWithoutSend = await connect(f, 'bob', ['books:read']);
  try {
    const result = await alice.client.callTool({ name: 'list_destinations', arguments: {} });
    const data = output(result);
    assert.deepEqual(data.destinations, [
      { id: 'alice-reader', label: 'Home Kindle', isDefault: true },
    ]);
    assert.equal(data.defaultDestinationId, 'alice-reader');
    assert.equal(data.setupUrl, 'https://palim.example/app#studio-settings');
    f.sql
      .prepare('UPDATE users SET default_destination_id=? WHERE id=?')
      .run('bob-reader', 'alice');
    const staleDefault = output(
      await alice.client.callTool({ name: 'list_destinations', arguments: {} }),
    );
    assert.equal(staleDefault.defaultDestinationId, null);
    assert.deepEqual(staleDefault.destinations, [
      { id: 'alice-reader', label: 'Home Kindle', isDefault: false },
    ]);
    assert.doesNotMatch(JSON.stringify(staleDefault), /bob-reader|Bob Kindle|@example\.test/);
    assert.doesNotMatch(
      JSON.stringify(data),
      /@example\.test|bob-reader|Bob Kindle|sender|artifacts/i,
    );
    const denied = await bobWithoutSend.client.callTool({
      name: 'list_destinations',
      arguments: {},
    });
    assert.equal(denied.isError, true);
    assert.equal(output(denied).code, 'SCOPE_REQUIRED');
    assert.equal(f.sent.length, 0);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM deliveries').get()!.n, 0);
  } finally {
    await alice.close();
    await bobWithoutSend.close();
  }
});

test('destination discovery rejects a disabled account even when called directly', async () => {
  const f = await fixture();
  f.sql.prepare('UPDATE users SET disabled=1 WHERE id=?').run('alice');
  const c = await connect(f);
  try {
    const result = await c.client.callTool({ name: 'list_destinations', arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.equal(output(result).code, 'SIGN_IN_REQUIRED');
    assert.equal(f.sent.length, 0);
  } finally {
    await c.close();
  }
});

test('MCP receipt access cannot disclose another account’s submission', async () => {
  const f = await fixture();
  f.setTime(Math.floor(Date.now() / 1000));
  const artifact = await f.palim.upload('alice', pdf(), 'original.pdf'),
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
