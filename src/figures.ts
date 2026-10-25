import { render } from 'pele';
import { escapeXml as e, parseXml } from './xml.js';
import { invariant, PalimError } from './errors.js';
import type { Figure } from './schema.js';
export interface Asset {
  bytes: Uint8Array;
  type: 'image/png' | 'image/jpeg';
}
export interface RenderedFigure {
  id: string;
  filename: string;
  type: string;
  bytes: Uint8Array;
  alt: string;
  caption: string;
}
const encode = (s: string) => new TextEncoder().encode(s);
export function staticSvg(svg: string): string {
  const vars: Record<string, string> = {
    _bg: '#ffffff',
    _fg: '#20201e',
    _m: '#555555',
    _l: '#20201e',
    _s: '#f4f3ef',
    _a: '#e3e1da',
    _b: '#555555',
    _c: '#333333',
    _r: '2px',
    _fm: 'monospace',
  };
  svg = svg
    .replace(/var\((--_[a-z]+)\)/g, (_, k: string) => vars[k.slice(2)] ?? '#20201e')
    .replace(/var\(--pele-[a-z0-9-]+,\s*([^()]+)\)/g, '$1')
    .replace(/--_[a-z]+:[^;]+;?/g, '');
  invariant(svg.length < 180_000, 'FIGURE_TOO_LARGE', 'Split this figure into smaller diagrams.');
  const doc = parseXml(svg);
  const nodes = doc.getElementsByTagName('*');
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes.item(i)!;
    invariant(
      !['script', 'foreignObject', 'iframe', 'image', 'use', 'a', 'animate', 'set'].includes(
        node.localName ?? node.tagName,
      ),
      'UNSAFE_FIGURE',
      'The figure contains unsupported interactive or remote content.',
    );
    for (let j = 0; j < node.attributes.length; j++) {
      const attr = node.attributes.item(j)!;
      if (attr.name === 'xmlns' && attr.value === 'http://www.w3.org/2000/svg') continue;
      invariant(
        !/^on/i.test(attr.name) &&
          !/(?:href|src)$/i.test(attr.name) &&
          !/@import|javascript:|https?:\/\/|url\s*\(/i.test(
            attr.value.replace(/url\(#[a-z0-9_-]+\)/gi, ''),
          ),
        'UNSAFE_FIGURE',
        'Remote references and event handlers are not allowed in figures.',
      );
    }
  }
  return svg;
}
export function renderFigure(figure: Figure, assets: ReadonlyMap<string, Asset>): RenderedFigure {
  let bytes: Uint8Array, type: string, ext: string;
  if (figure.kind === 'image') {
    const asset = assets.get(figure.assetId);
    invariant(
      asset,
      'MISSING_ASSET',
      `Image ${figure.id} is missing or not owned by this account.`,
    );
    bytes = asset.bytes;
    type = asset.type;
    ext = type === 'image/png' ? 'png' : 'jpg';
  } else {
    let svg: string;
    if (figure.kind === 'mermaid') {
      try {
        svg = render(figure.source, { limit: 6000, maxEdges: 48 }).svg;
      } catch {
        throw new PalimError(
          'INVALID_DIAGRAM',
          `Figure ${figure.id} could not render. Simplify or correct its Mermaid source.`,
        );
      }
      const view = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number);
      invariant(
        view && (view[2] ?? 0) <= 1600 && (view[3] ?? 0) <= 2400,
        'FIGURE_TOO_DENSE',
        `Figure ${figure.id} is too large for comfortable reading. Split it into smaller views.`,
      );
    } else {
      const max = Math.max(1, ...figure.data.map((p) => p.value));
      const height = 85 + figure.data.length * 64;
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" font-family="sans-serif" font-size="20"><rect width="800" height="${height}" fill="white"/><text x="24" y="30" fill="#333">${e(figure.unit)}</text>${figure.data.map((d, i) => `<text x="24" y="${68 + i * 64}" fill="#222">${e(d.label)}</text><rect x="260" y="${48 + i * 64}" width="${Math.round((d.value / max) * 410)}" height="25" fill="#333"/><text x="${280 + Math.round((d.value / max) * 410)}" y="${68 + i * 64}" fill="#222">${d.value}</text>`).join('')}</svg>`;
    }
    bytes = encode(staticSvg(svg));
    type = 'image/svg+xml';
    ext = 'svg';
  }
  return {
    id: figure.id,
    filename: `fig-${figure.id}.${ext}`,
    type,
    bytes,
    alt: figure.alt,
    caption: figure.caption + (figure.kind === 'bars' ? ` Source: ${figure.source}` : ''),
  };
}
export function coverSvg(
  title: string,
  subtitle: string | undefined,
  creator: string | undefined,
): string {
  const lines: string[] = [];
  let line = '';
  for (const word of title.split(/\s+/)) {
    if ((line + ' ' + word).length > 23 && line) {
      lines.push(line);
      line = word;
    } else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="#f2eee4"/><path d="M110 130H1090M110 1460H1090" stroke="#302d29" stroke-width="3"/><text x="110" y="230" font-family="sans-serif" font-size="24" letter-spacing="8" fill="#584d43">A READING EDITION</text>${lines.map((l, i) => `<text x="110" y="${480 + i * 110}" font-family="serif" font-size="82" fill="#25231f">${e(l)}</text>`).join('')}<path d="M110 1180H240" stroke="#923f33" stroke-width="12"/>${subtitle ? `<text x="110" y="1270" font-family="sans-serif" font-size="25" fill="#584d43">${e(subtitle.slice(0, 65))}</text>` : ''}${creator ? `<text x="110" y="1400" font-family="sans-serif" font-size="27" fill="#25231f">${e(creator)}</text>` : ''}</svg>`;
}
