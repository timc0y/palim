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
    '<a class="reader-wordmark" href="/"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="3" fill="#263fa9"/><path d="M7 10h7l2-2h9M7 16h11l2-2h5M7 22h4" fill="none" stroke="#f6f4ee" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>palim</a><a href="/sample.epub">Download EPUB</a>',
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
