import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildBook } from '../src/book.js';
import { rasterize } from '../src/raster.js';
import { escapeXml } from '../src/xml.js';

const rawManuscript = await readFile(
  new URL('../examples/first-edition.json', import.meta.url),
  'utf8',
);
const manuscript = JSON.parse(rawManuscript) as {
  title: string;
  subtitle?: string;
  creator?: string;
};
const illustration = await rasterize(
  await readFile(new URL('../examples/assets/exposure-trade.svg', import.meta.url), 'utf8'),
);
const book = await buildBook(
  manuscript,
  new Map([
    [
      '00000000-0000-4000-8000-000000000001',
      {
        bytes: illustration,
        type: 'image/png' as const,
      },
    ],
  ]),
  new Date('2026-10-25T00:00:00Z'),
);
let localPreview = book.preview.replace(
  '<a href="/app#files-panel">Open Shelf</a>',
  '<a href="palim-sample.epub">Download EPUB</a>',
);
// The local reading edition opens without a server or network, including its reading font.
for (const [font, license] of [['Manrope-Latin', 'Manrope-OFL']]) {
  const [bytes, notice] = await Promise.all([
    readFile(new URL(`../public/fonts/${font}.woff2`, import.meta.url)),
    readFile(new URL(`../public/fonts/${license}.txt`, import.meta.url), 'utf8'),
  ]);
  localPreview = localPreview
    .replace(`/fonts/${font}.woff2`, `data:font/woff2;base64,${bytes.toString('base64')}`)
    .replace('</head>', `<meta name="${license}" content="${escapeXml(notice)}"/></head>`);
}
await mkdir('artifacts', { recursive: true });
await Promise.all([
  writeFile('artifacts/palim-sample.epub', book.bytes),
  writeFile('artifacts/palim-sample.html', localPreview),
  writeFile('artifacts/manuscript.json', book.source),
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
