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
      let y = 44;
      for (const line of wrap(figure.unit)) {
        marks.push(
          `<text x="24" y="${y}" font-weight="600" fill="${PALIM_PALETTE.muted}">${e(line)}</text>`,
        );
        y += 34;
      }
      y += 16;
      for (const point of figure.data) {
        const labelTop = y;
        for (const line of wrap(point.label)) {
          marks.push(
            `<text x="24" y="${y}" font-weight="800" fill="${PALIM_PALETTE.ink}">${e(line)}</text>`,
          );
          y += 34;
        }
        const exact = String(point.value);
        const displayed = exact.length <= 12 ? exact : `≈ ${point.value.toPrecision(4)}`;
        const width = Math.round((point.value / max) * 340);
        const barY = y + 6;
        marks.push(
          `<text x="420" y="${labelTop}" text-anchor="start" font-weight="600" fill="${PALIM_PALETTE.muted}">${e(displayed)}</text><rect x="24" y="${barY}" width="340" height="22" fill="${PALIM_PALETTE.inset}"/><rect x="24" y="${barY}" width="${width}" height="22" fill="${PALIM_PALETTE.ink}"><title>${e(point.label)}: ${e(exact)} ${e(figure.unit)}</title></rect>`,
        );
        y = barY + 62;
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
  const titleLines = wrap(title, 10);
  const subtitleLines = subtitle ? wrap(subtitle, 38) : [];
  const authorLines = creator ? wrap(creator, 42) : [];
  const longestTitle = Math.max(...titleLines.map((line) => Array.from(line).length));
  const titleSize = Math.min(112, 1008 / longestTitle, 520 / (titleLines.length * 1.04));
  const titleStep = titleSize * 1.04;
  const longestSubtitle = Math.max(1, ...subtitleLines.map((line) => Array.from(line).length));
  const subtitleSize = subtitleLines.length
    ? Math.min(34, 1008 / longestSubtitle, 420 / (subtitleLines.length * 1.45))
    : 0;
  const subtitleStep = subtitleSize * 1.45;
  const subtitleBlock = subtitleLines.length ? 112 + subtitleLines.length * subtitleStep : 0;
  const contentHeight = titleLines.length * titleStep + subtitleBlock;
  const titleFirst = Math.max(320, Math.min(680, 900 - contentHeight / 2));
  const titleBottom = titleFirst + (titleLines.length - 1) * titleStep;
  const stopRuleY = titleBottom + Math.max(46, titleSize * 0.52);
  const subtitleFirst = stopRuleY + 72 + subtitleSize;
  const authorSize = Math.min(
    26,
    1008 / Math.max(1, ...authorLines.map((line) => Array.from(line).length)),
  );
  const authorStep = authorSize * 1.35;
  const authorFirst = 1468 - Math.max(0, authorLines.length - 1) * authorStep;
  const tracking = Math.max(1.2, titleSize * 0.032);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="${PALIM_PALETTE.coverPaper}"/><rect x="48" y="48" width="1104" height="1504" fill="none" stroke="${PALIM_PALETTE.ink}" stroke-width="2"/><path d="M96 88h28l14 14h42M96 116h48l14 14h30M96 144h34" fill="none" stroke="${PALIM_PALETTE.accent}" stroke-width="6" stroke-linecap="square" stroke-linejoin="miter"/>${titleLines.map((line, i) => `<text x="96" y="${titleFirst + i * titleStep}" font-family="${e(PALIM_FONTS.reading)}" font-weight="600" font-size="${titleSize}" letter-spacing="-${tracking}" fill="${PALIM_PALETTE.ink}">${e(line)}</text>`).join('')}<path d="M96 ${stopRuleY}h264" stroke="${PALIM_PALETTE.accent}" stroke-width="6"/>${subtitleLines.map((line, i) => `<text x="96" y="${subtitleFirst + i * subtitleStep}" font-family="${e(PALIM_FONTS.reading)}" font-weight="400" font-size="${subtitleSize}" fill="${PALIM_PALETTE.inkSoft}">${e(line)}</text>`).join('')}<path d="M96 1380H1104" stroke="${PALIM_PALETTE.ink}" stroke-width="2"/> ${authorLines.map((line, i) => `<text x="96" y="${authorFirst + i * authorStep}" font-family="${e(PALIM_FONTS.reading)}" font-weight="650" font-size="${authorSize}" fill="${PALIM_PALETTE.ink}">${e(line)}</text>`).join('')}</svg>`;
}
