import { readFile, writeFile } from 'node:fs/promises';
import { PALIM_FONTS, PALIM_PALETTE } from '../src/book-styles.js';
import { rasterize } from '../src/raster.js';
import { escapeXml } from '../src/xml.js';
const landscape = await readFile(new URL('../public/icons/landscape.png', import.meta.url));
const ogCard = await rasterize(
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" font-family="${escapeXml(PALIM_FONTS.reading)}" fill="${PALIM_PALETTE.ink}">
    <rect width="1200" height="630" fill="${PALIM_PALETTE.coverPaper}"/>
    <image width="1200" height="228" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,${landscape.toString('base64')}"/>
    <text x="72" y="365" font-size="98" font-weight="800">Palim</text>
    <text x="76" y="435" font-size="38">Create an EPUB. Forward a file to Kindle.</text>
    <path d="M76 503H1124" stroke="${PALIM_PALETTE.inkSoft}"/>
    <text x="76" y="566" font-size="30">palim.pages.dev</text>
    <text x="1124" y="566" text-anchor="end" font-size="30">Free · MIT licensed</text>
  </svg>`,
);
await writeFile('public/og.png', ogCard);
