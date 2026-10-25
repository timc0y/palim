import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildBook } from '../src/book.js';
import { inspectDocument, inspectZip } from '../src/archive.js';
import { BookSchema, LIMITS } from '../src/schema.js';
import { parseXml } from '../src/xml.js';
import { staticSvg } from '../src/figures.js';
import { simpleBook, pdf } from './helpers.js';
const time = new Date('2026-10-25T00:00:00Z');
test('EPUB has stored first mimetype and well-formed package, navigation and chapters', async () => {
  const book = await buildBook(simpleBook, new Map(), time);
  const view = new DataView(book.bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(8, true), 0);
  assert.equal(view.getUint16(28, true), 0);
  assert.equal(new TextDecoder().decode(book.bytes.slice(30, 38)), 'mimetype');
  const zip = await JSZip.loadAsync(book.bytes);
  assert.equal(await zip.file('mimetype')!.async('text'), 'application/epub+zip');
  for (const name of Object.keys(zip.files).filter((n) => /\.(xhtml|xml|opf|svg)$/.test(n)))
    parseXml(await zip.file(name)!.async('text'));
  const info = await inspectDocument(book.bytes);
  assert.equal(info.title, simpleBook.title);
  assert.equal(info.creator, simpleBook.creator);
  assert.equal(info.sha256, book.hash);
});
test('same input and clock produce byte-identical books', async () => {
  const a = await buildBook(simpleBook, new Map(), time),
    b = await buildBook(simpleBook, new Map(), time);
  assert.deepEqual(a.bytes, b.bytes);
  assert.equal(a.hash, b.hash);
  assert.equal(JSON.parse(a.source).title, simpleBook.title);
});
test('manuscript XML characters and metadata are escaped', async () => {
  const b = await buildBook(
    { ...simpleBook, title: 'A & B < C', creator: '"Someone" & Co' },
    new Map(),
    time,
  );
  assert.equal((await inspectDocument(b.bytes)).title, 'A & B < C');
  assert.match(b.preview, /A &amp; B &lt; C/);
});
test('raw HTML is text rather than executable content', async () => {
  const b = await buildBook({
    ...simpleBook,
    chapters: [
      {
        title: 'Safety',
        markdown: '<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>',
      },
    ],
  });
  assert.doesNotMatch(b.preview, /<script|<iframe/i);
  assert.match(b.preview, /&lt;script&gt;/);
});
test('external images are refused rather than fetched', async () => {
  await assert.rejects(
    buildBook({
      ...simpleBook,
      chapters: [{ title: 'No remote', markdown: '![remote](https://evil.example/a.png)' }],
    }),
    /defined figure/,
  );
});
test('Mermaid and data charts render with captions and no remote resources', async () => {
  const b = await buildBook({
    ...simpleBook,
    chapters: [
      { title: 'Figures', markdown: '![Architecture](figure:flow)\n\n![Values](figure:bars)' },
    ],
    figures: [
      {
        kind: 'mermaid',
        id: 'flow',
        alt: 'A goes to B',
        caption: 'A real sequence',
        source: 'flowchart TD\n A[Input] --> B[Result]',
      },
      {
        kind: 'bars',
        id: 'bars',
        alt: 'One value of three',
        caption: 'An example',
        source: 'Synthetic test data',
        unit: 'Count',
        data: [{ label: 'A', value: 3 }],
      },
    ],
  });
  const zip = await JSZip.loadAsync(b.bytes);
  assert.ok(zip.file('EPUB/fig-flow.svg'));
  assert.ok(zip.file('EPUB/fig-bars.svg'));
  assert.match(await zip.file('EPUB/chapter-1.xhtml')!.async('text'), /figcaption/);
});
test('unused and duplicate figures fail clearly', async () => {
  const f = {
    kind: 'mermaid',
    id: 'flow',
    alt: 'A goes to B',
    caption: 'A sequence',
    source: 'flowchart TD\n A-->B',
  };
  await assert.rejects(buildBook({ ...simpleBook, figures: [f] }), /not referenced/);
  assert.equal(BookSchema.safeParse({ ...simpleBook, figures: [f, f] }).success, false);
});
test('figure schema rejects missing alt, fabricated numeric types and unsafe identifiers', () => {
  for (const f of [
    {
      kind: 'bars',
      id: 'x',
      alt: '',
      caption: 'x',
      unit: 'x',
      source: 'x',
      data: [{ label: 'a', value: 1 }],
    },
    {
      kind: 'bars',
      id: '../x',
      alt: 'x',
      caption: 'x',
      unit: 'x',
      source: 'x',
      data: [{ label: 'a', value: 1 }],
    },
    {
      kind: 'bars',
      id: 'x',
      alt: 'x',
      caption: 'x',
      unit: 'x',
      source: 'x',
      data: [{ label: 'a', value: Infinity }],
    },
  ])
    assert.equal(BookSchema.safeParse({ ...simpleBook, figures: [f] }).success, false);
});
test('unsafe SVG scripts, external references and foreignObject are rejected', () => {
  for (const content of [
    '<script>x</script>',
    '<foreignObject/>',
    '<image href="https://evil.example/x"/>',
    '<rect onclick="alert(1)"/>',
  ])
    assert.throws(() => staticSvg(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`));
});
test('XML rejects entities, DTDs and malformed documents', () => {
  for (const s of [
    '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>',
    '<x><y></x>',
    '<x>\u0000</x>',
  ]) {
    if (s.includes('\u0000'))
      assert.equal(BookSchema.safeParse({ ...simpleBook, title: '\u0000' }).success, false);
    else assert.throws(() => parseXml(s));
  }
});
test('source URLs require HTTPS without credentials', () => {
  for (const url of [
    'http://example.com',
    'javascript:alert(1)',
    'https://user:password@example.com',
  ])
    assert.equal(
      BookSchema.safeParse({ ...simpleBook, sources: [{ title: 'Source', url }] }).success,
      false,
    );
});
test('invalid language and oversized input do not build', async () => {
  await assert.rejects(buildBook({ ...simpleBook, language: 'not a language' }));
  await assert.rejects(buildBook({ ...simpleBook, title: 'x'.repeat(161) }));
  await assert.rejects(
    buildBook({
      ...simpleBook,
      chapters: [{ title: 'Long', markdown: 'x'.repeat(LIMITS.manuscript) }],
    }),
  );
});
test('PDF forwarding inspection leaves every input byte intact', async () => {
  const bytes = pdf(),
    before = bytes.slice();
  const info = await inspectDocument(bytes);
  assert.equal(info.type, 'application/pdf');
  assert.deepEqual(bytes, before);
});
test('ZIP format alone is not an EPUB', async () => {
  const zip = new JSZip();
  zip.file('a.txt', 'hello');
  await assert.rejects(
    inspectDocument(await zip.generateAsync({ type: 'uint8array' })),
    /metadata/,
  );
});
test('unsafe archive paths and case aliases are rejected before decompression', async () => {
  for (const names of [['../outside'], ['A.txt', 'a.txt'], ['/absolute'], ['C:\\outside']]) {
    const zip = new JSZip();
    for (const name of names) zip.file(name, 'x', { createFolders: false });
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    assert.throws(() => inspectZip(bytes));
  }
});
test('malformed central directory and truncated inputs are rejected', async () => {
  const b = await buildBook(simpleBook);
  assert.throws(() => inspectZip(b.bytes.slice(0, -10)));
  const c = b.bytes.slice();
  c[c.length - 6] = 255;
  assert.throws(() => inspectZip(c));
});
test('declared oversized metadata is bounded during inflation', async () => {
  const z = new JSZip();
  z.file('mimetype', 'application/epub+zip');
  z.file('META-INF/container.xml', 'x'.repeat(LIMITS.xml + 1));
  await assert.rejects(
    inspectDocument(await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })),
    /decoded limit/,
  );
});
test('font obfuscation is accepted but content encryption is refused', async () => {
  for (const [algorithm, accepted] of [
    ['http://www.idpf.org/2008/embedding', true],
    ['urn:example:drm', false],
  ] as const) {
    const b = await buildBook(simpleBook);
    const z = await JSZip.loadAsync(b.bytes);
    z.file(
      'META-INF/encryption.xml',
      `<encryption><EncryptionMethod Algorithm="${algorithm}"/></encryption>`,
    );
    const bytes = await z.generateAsync({ type: 'uint8array' });
    if (accepted) assert.equal((await inspectDocument(bytes)).type, 'application/epub+zip');
    else await assert.rejects(inspectDocument(bytes), /Protected content/);
  }
});

test('combined reading preview has one title and unique chapter anchors', async () => {
  const book = await buildBook(
    {
      ...simpleBook,
      chapters: [
        {
          title: 'First chapter',
          markdown: 'Opening paragraph.\n\n## An explanation\n\nSome detail.',
        },
        {
          title: 'Second chapter',
          markdown: 'Another opening.\n\n## An explanation\n\nMore detail.',
        },
      ],
    },
    new Map(),
    time,
  );
  assert.equal((book.preview.match(/<h1[ >]/g) || []).length, 1);
  const ids = [...book.preview.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(book.preview, /href="#chapter-2"/);
  assert.match(book.preview, /<h3 id="chapter-2-section-1"/);
  assert.doesNotMatch(book.preview, /<h4/);
  assert.doesNotMatch(book.preview, /class="cover"/);
});
