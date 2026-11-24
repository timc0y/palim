import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildBook } from '../src/book.js';
import { PALIM_FONTS, PALIM_PALETTE, PREVIEW_CSS } from '../src/book-styles.js';
import { coverSvg } from '../src/figures.js';
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
const sampleCover = await rasterize(
  coverSvg(manuscript.title, manuscript.subtitle, manuscript.creator),
);
const ogCard = await rasterize(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${PALIM_PALETTE.paper}"/>
    <rect x="40" y="36" width="1120" height="558" rx="28" fill="${PALIM_PALETTE.surface}" stroke="${PALIM_PALETTE.line}" stroke-width="2"/>
    <rect x="72" y="68" width="1056" height="494" rx="16" fill="${PALIM_PALETTE.ink}"/>
    <rect x="86" y="82" width="1028" height="466" rx="8" fill="${PALIM_PALETTE.screen}"/>
    <g transform="translate(140 134) scale(1.375)">
      <rect width="32" height="32" rx="3" fill="${PALIM_PALETTE.accent}"/>
      <g fill="none" stroke="${PALIM_PALETTE.field}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
        <path d="M7 10h7l2-2h9"/>
        <path d="M7 16h11l2-2h5"/>
        <path d="M7 22h4"/>
      </g>
    </g>
    <text x="140" y="294" font-family="${escapeXml(PALIM_FONTS.reading)}" font-size="112" fill="${PALIM_PALETTE.ink}" letter-spacing="-4">palim</text>
    <rect x="420" y="220" width="36" height="74" fill="${PALIM_PALETTE.accent}"/>
    <text x="140" y="366" font-family="${escapeXml(PALIM_FONTS.reading)}" font-size="29" fill="${PALIM_PALETTE.ink}">Illustrated EPUBs &amp; unchanged Kindle delivery.</text>
    <text x="140" y="416" font-family="${escapeXml(PALIM_FONTS.reading)}" font-size="22" fill="${PALIM_PALETTE.inkSoft}">Free · MIT open source · MCP + Web Studio</text>
    <path d="M140 464H720" stroke="${PALIM_PALETTE.line}" stroke-width="1.5"/>
    <text x="140" y="502" font-family="${escapeXml(PALIM_FONTS.reading)}" font-size="20" fill="${PALIM_PALETTE.accent}">palim.pages.dev</text>
    <rect x="776" y="132" width="284" height="378" rx="4" fill="${PALIM_PALETTE.line}"/>
    <rect x="770" y="126" width="284" height="378" rx="4" fill="${PALIM_PALETTE.coverPaper}" stroke="${PALIM_PALETTE.ink}" stroke-width="2"/>
    <path d="M798 156H1026" stroke="${PALIM_PALETTE.ink}" stroke-width="2"/>
    <path d="M798 172H840M798 180H824" stroke="${PALIM_PALETTE.accent}" stroke-width="3"/>
    <text x="798" y="236" font-family="${escapeXml(PALIM_FONTS.reading)}" font-size="34" fill="${PALIM_PALETTE.ink}">One stop</text>
    <text x="798" y="274" font-family="${escapeXml(PALIM_FONTS.reading)}" font-size="34" fill="${PALIM_PALETTE.ink}">of light</text>
    <text x="798" y="308" font-family="${escapeXml(PALIM_FONTS.reading)}" font-size="15" fill="${PALIM_PALETTE.inkSoft}">Field notes · 01</text>
    <rect x="798" y="346" width="228" height="90" fill="${PALIM_PALETTE.accent}"/>
    <path d="M798 346H946L856 436H798Z" fill="${PALIM_PALETTE.ink}"/>
    <path d="M946 346L856 436" stroke="${PALIM_PALETTE.coverPaper}" stroke-width="2"/>
    <path d="M798 476H1026" stroke="${PALIM_PALETTE.line}" stroke-width="1.5"/>
  </svg>`,
);
const publicPreview = book.preview
  .replace(
    `<style>${PREVIEW_CSS}</style>`,
    `<meta name="description" content="One stop of light — a sample illustrated EPUB created with Palim."/><meta name="theme-color" content="${PALIM_PALETTE.previewPaper}"/><link rel="icon" href="/mark.svg" type="image/svg+xml"/><link rel="stylesheet" href="/reader.css"/>`,
  )
  .replace(
    '<a href="/app">Back to studio</a>',
    `<a class="reader-wordmark" href="/"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 10h7l2-2h9M7 16h11l2-2h5M7 22h4" fill="none" stroke="${PALIM_PALETTE.ink}" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter"/></svg>palim</a><div class="preview-actions"><a href="/app">Studio</a><a href="/sample.epub">Download EPUB</a></div>`,
  );
let localPreview = book.preview.replace(
  '<a href="/app">Back to studio</a>',
  '<a href="palim-sample.epub">Download EPUB</a>',
);
// The local reading edition opens without a server or network, including its fonts.
for (const [font, license] of [
  ['Manrope-Latin', 'Manrope-OFL'],
  ['IBMPlexMono-Latin-400', 'IBMPlexMono-OFL'],
]) {
  const [bytes, notice] = await Promise.all([
    readFile(new URL(`../public/fonts/${font}.woff2`, import.meta.url)),
    readFile(new URL(`../public/fonts/${license}.txt`, import.meta.url), 'utf8'),
  ]);
  localPreview = localPreview
    .replace(`/fonts/${font}.woff2`, `data:font/woff2;base64,${bytes.toString('base64')}`)
    .replace('</head>', `<meta name="${license}" content="${escapeXml(notice)}"/></head>`);
}
await mkdir('artifacts', { recursive: true });
await mkdir('public/images', { recursive: true });
await Promise.all([
  writeFile('public/images/sample-exposure.png', illustration),
  writeFile('public/images/sample-cover.png', sampleCover),
  writeFile('public/og.png', ogCard),
  writeFile('artifacts/palim-sample.epub', book.bytes),
  writeFile('artifacts/palim-sample.html', localPreview),
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
