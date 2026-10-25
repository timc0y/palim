import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildBook, PREVIEW_CSS } from '../src/book.js';
const manuscript = JSON.parse(
  await readFile(new URL('../examples/first-edition.json', import.meta.url), 'utf8'),
) as unknown;
const book = await buildBook(
  manuscript,
  new Map([
    [
      '00000000-0000-4000-8000-000000000001',
      {
        bytes: new Uint8Array(
          await readFile(new URL('../public/images/sample-exposure.png', import.meta.url)),
        ),
        type: 'image/png' as const,
      },
    ],
  ]),
  new Date('2026-10-25T00:00:00Z'),
);
const publicPreview = book.preview
  .replace(`<style>${PREVIEW_CSS}</style>`, '<link rel="stylesheet" href="/reader.css"/>')
  .replace(
    '<a href="/app">Back to desk</a>',
    '<a class="reader-wordmark" href="/">palim</a><a href="/sample.epub">Download EPUB</a>',
  );
await mkdir('artifacts', { recursive: true });
await mkdir('public', { recursive: true });
await Promise.all([
  writeFile('artifacts/palim-sample.epub', book.bytes),
  writeFile('artifacts/palim-sample.html', publicPreview),
  writeFile('artifacts/manuscript.json', book.source),
  writeFile('public/sample.epub', book.bytes),
  writeFile('public/sample.html', publicPreview),
  writeFile('public/reader.css', PREVIEW_CSS),
  writeFile('public/example.json', book.source),
]);
console.log(
  JSON.stringify(
    {
      file: 'artifacts/palim-sample.epub',
      bytes: book.bytes.length,
      sha256: book.hash,
      wordCount: book.wordCount,
      warnings: book.warnings,
    },
    null,
    2,
  ),
);
