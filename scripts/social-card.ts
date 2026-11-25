import { writeFile } from 'node:fs/promises';
import { PALIM_FONTS } from '../src/book-styles.js';
import { rasterize } from '../src/raster.js';
import { escapeXml } from '../src/xml.js';

const ogCard = await rasterize(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${escapeXml(PALIM_FONTS.reading)}">
    <rect width="1200" height="630" fill="#151514"/>
    <text x="84" y="128" font-size="34" font-weight="600" fill="#f1efe9">palim</text>
    <text x="84" y="292" font-size="88" font-weight="600" letter-spacing="-2.5" fill="#f1efe9">Ship a thing to a Kindle</text>
    <text x="84" y="366" font-size="32" fill="#b8b5ad">MCP server for illustrated EPUBs and unchanged file forwarding.</text>
    <rect x="84" y="424" width="76" height="42" fill="none" stroke="#f1efe9" stroke-width="2"/>
    <rect x="176" y="424" width="76" height="42" fill="none" stroke="#f1efe9" stroke-width="2"/>
    <rect x="268" y="424" width="76" height="42" fill="none" stroke="#f1efe9" stroke-width="2"/>
    <rect x="360" y="424" width="76" height="42" fill="#d4694a"/>
    <path d="M84 514H1116" stroke="#2c2c29" stroke-width="2"/>
    <text x="84" y="568" font-size="26" fill="#9f9c94">palim.pages.dev/mcp</text>
    <text x="1116" y="568" text-anchor="end" font-size="26" fill="#9f9c94">Free · MIT licensed</text>
  </svg>`,
);
await writeFile('public/og.png', ogCard);
