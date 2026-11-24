import { render } from 'pele';
import { escapeXml as e, parseXml } from './xml.js';
import { invariant, PalimError } from './errors.js';
import { PALIM_FONTS, PALIM_PALETTE } from './book-styles.js';
import type { Figure } from './schema.js';
export interface Asset {
  bytes: Uint8Array;
  type: 'image/png' | 'image/jpeg';
}
export interface RenderedFigure {
  id: string;
  kind: Figure['kind'];
  filename: string;
  type: string;
  bytes: Uint8Array;
  alt: string;
  caption: string;
}
const encode = (s: string) => new TextEncoder().encode(s);
export function staticSvg(svg: string): string {
  const vars: Record<string, string> = {
    _bg: PALIM_PALETTE.field,
    _fg: PALIM_PALETTE.ink,
    _m: PALIM_PALETTE.muted,
    _l: PALIM_PALETTE.ink,
    _s: PALIM_PALETTE.previewPaper,
    _a: PALIM_PALETTE.inset,
    _b: PALIM_PALETTE.muted,
    _c: PALIM_PALETTE.inkSoft,
    _r: '2px',
    _fm: PALIM_FONTS.reading,
  };
  svg = svg
    .replace(/var\((--_[a-z]+)\)/g, (_, k: string) => vars[k.slice(2)] ?? PALIM_PALETTE.ink)
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
      let y = 42;
      for (const line of wrap(figure.unit)) {
        marks.push(`<text x="24" y="${y}" fill="${PALIM_PALETTE.muted}">${e(line)}</text>`);
        y += 36;
      }
      y += 12;
      for (const point of figure.data) {
        for (const line of wrap(point.label)) {
          marks.push(`<text x="24" y="${y}" fill="${PALIM_PALETTE.ink}">${e(line)}</text>`);
          y += 36;
        }
        const exact = String(point.value);
        const displayed = exact.length <= 12 ? exact : `≈ ${point.value.toPrecision(4)}`;
        marks.push(
          `<rect x="24" y="${y - 12}" width="${Math.round((point.value / max) * 340)}" height="24" fill="${PALIM_PALETTE.ink}"><title>${e(point.label)}: ${e(exact)} ${e(figure.unit)}</title></rect><text x="${Math.min(390, 24 + Math.round((point.value / max) * 340) + 16)}" y="${y + 8}" text-anchor="start" fill="${PALIM_PALETTE.ink}">${e(displayed)}</text>`,
        );
        y += 64;
      }
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${y}" viewBox="0 0 560 ${y}" font-family="${e(PALIM_FONTS.reading)}" font-size="30"><rect width="560" height="${y}" fill="${PALIM_PALETTE.field}"/>${marks.join('')}</svg>`;
    }
    bytes = encode(staticSvg(svg));
    type = 'image/svg+xml';
    ext = 'svg';
  }
  return {
    id: figure.id,
    kind: figure.kind,
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
  const wrap = (text: string, target: number): string[] => {
    const lines: string[] = [];
    let line = '';
    // Bound unbroken titles as well as ordinary word-wrapped metadata.
    const words = text
      .trim()
      .split(/\s+/)
      .flatMap((word) => {
        const characters = Array.from(word);
        const parts: string[] = [];
        for (let at = 0; at < characters.length; at += target * 2)
          parts.push(characters.slice(at, at + target * 2).join(''));
        return parts;
      });
    for (const word of words) {
      if (line && Array.from(line + ' ' + word).length > target) {
        lines.push(line);
        line = word;
      } else line += (line ? ' ' : '') + word;
    }
    if (line) lines.push(line);
    return lines;
  };
  const titleLines = wrap(title, 9);
  const subtitleLines = subtitle ? wrap(subtitle, 26) : [];
  const authorLines = creator ? wrap(creator, 28) : [];
  const titleSize = Math.min(
    140,
    1008 / Math.max(...titleLines.map((line) => Array.from(line).length)),
    620 / (titleLines.length * 1.15),
  );
  const titleBottom = 240 + titleLines.length * titleSize * 1.15;
  const authorTop = 1480 - Math.max(0, authorLines.length - 1) * 44;
  const subtitleSize = Math.min(
    36,
    1008 / Math.max(1, ...subtitleLines.map((line) => Array.from(line).length)),
    (authorTop - titleBottom - 160) / Math.max(1, subtitleLines.length * 1.3),
  );
  const authorSize = Math.min(
    32,
    1008 / Math.max(1, ...authorLines.map((line) => Array.from(line).length)),
  );
  const subtitleTop = titleBottom + 80;
  const contentBottom = subtitleLines.length
    ? subtitleTop + subtitleLines.length * subtitleSize * 1.3
    : titleBottom;
  const motifTop = Math.max(960, contentBottom + 80);
  const motifHeight = Math.min(300, authorTop - motifTop - 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="${PALIM_PALETTE.coverPaper}"/><path d="M96 96H1104" stroke="${PALIM_PALETTE.ink}" stroke-width="3"/><path d="M96 138H190M96 152H154" stroke="${PALIM_PALETTE.accent}" stroke-width="5"/>${titleLines.map((line, i) => `<text x="96" y="${240 + titleSize + i * titleSize * 1.15}" font-family="${e(PALIM_FONTS.reading)}" font-size="${titleSize}" fill="${PALIM_PALETTE.ink}">${e(line)}</text>`).join('')}${subtitleLines.map((line, i) => `<text x="96" y="${subtitleTop + subtitleSize + i * subtitleSize * 1.3}" font-family="${e(PALIM_FONTS.reading)}" font-size="${subtitleSize}" fill="${PALIM_PALETTE.inkSoft}">${e(line)}</text>`).join('')}${motifHeight > 100 ? `<rect x="96" y="${motifTop}" width="1008" height="${motifHeight}" fill="${PALIM_PALETTE.accent}"/><path d="M96 ${motifTop}H700L${700 - motifHeight} ${motifTop + motifHeight}H96Z" fill="${PALIM_PALETTE.ink}"/><path d="M700 ${motifTop}L${700 - motifHeight} ${motifTop + motifHeight}" stroke="${PALIM_PALETTE.coverPaper}" stroke-width="3"/>` : ''}${authorLines.map((line, i) => `<text x="96" y="${authorTop + i * 44}" font-family="${e(PALIM_FONTS.reading)}" font-size="${authorSize}" fill="${PALIM_PALETTE.ink}">${e(line)}</text>`).join('')}<path d="M96 1520H1104" stroke="${PALIM_PALETTE.line}" stroke-width="2"/></svg>`;
}
