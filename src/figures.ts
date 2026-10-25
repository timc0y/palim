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
      // Stack labels above bars so they remain legible when a narrow reader scales the figure.
      const wrap = (text: string): string[] => {
        const words = text.trim().match(/\S{1,20}/gu) ?? [];
        const lines: string[] = [];
        let line = '';
        for (const word of words) {
          if (line && line.length + word.length + 1 > 20) {
            lines.push(line);
            line = word;
          } else line += (line ? ' ' : '') + word;
        }
        if (line) lines.push(line);
        return lines;
      };
      const max = Math.max(...figure.data.map((point) => point.value)) || 1;
      const marks: string[] = [];
      let y = 34;
      for (const line of wrap(figure.unit)) {
        marks.push(`<text x="24" y="${y}" fill="#333">${e(line)}</text>`);
        y += 28;
      }
      y += 12;
      for (const point of figure.data) {
        for (const line of wrap(point.label)) {
          marks.push(`<text x="24" y="${y}" fill="#222">${e(line)}</text>`);
          y += 28;
        }
        const exact = String(point.value);
        const displayed = exact.length <= 12 ? exact : `≈ ${point.value.toPrecision(4)}`;
        marks.push(
          `<rect x="24" y="${y - 12}" width="${Math.round((point.value / max) * 340)}" height="24" fill="#333"><title>${e(point.label)}: ${e(exact)} ${e(figure.unit)}</title></rect><text x="536" y="${y + 8}" text-anchor="end" fill="#222">${e(displayed)}</text>`,
        );
        y += 48;
      }
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${y}" viewBox="0 0 560 ${y}" font-family="sans-serif" font-size="24"><rect width="560" height="${y}" fill="white"/>${marks.join('')}</svg>`;
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
  const wrap = (text: string, length: number): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if ((line + ' ' + word).length > length && line) {
        lines.push(line);
        line = word;
      } else line += (line ? ' ' : '') + word;
    }
    if (line) lines.push(line);
    return lines;
  };
  const lines = wrap(title, 17);
  const size = Math.min(118, 650 / lines.length);
  const subtitleLines = subtitle ? wrap(subtitle, 42) : [];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="#11151b"/><path d="M110 130H1090M110 1460H1090" stroke="#626975" stroke-width="3"/><text x="110" y="230" font-family="sans-serif" font-size="32" letter-spacing="5" fill="#BACCF4">A READING EDITION</text>${lines.map((line, i) => `<text x="110" y="${430 + i * size * 1.15}" font-family="sans-serif" font-size="${size}" fill="#FAFAF7">${e(line)}</text>`).join('')}<path d="M110 1120H240" stroke="#BACCF4" stroke-width="6"/>${subtitleLines.map((line, i) => `<text x="110" y="${1220 + i * 52}" font-family="sans-serif" font-size="40" fill="#BACCF4">${e(line)}</text>`).join('')}${creator ? `<text x="110" y="1400" font-family="sans-serif" font-size="36" fill="#FAFAF7">${e(creator)}</text>` : ''}</svg>`;
}
