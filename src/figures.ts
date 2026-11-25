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
  footnote?: string;
}

const encode = (s: string) => new TextEncoder().encode(s);
const FONT = e(PALIM_FONTS.reading);
const INK = PALIM_PALETTE.ink;
const SOFT = PALIM_PALETTE.inkSoft;
const MUTED = PALIM_PALETTE.muted;
const LINE = PALIM_PALETTE.line;
const INSET = PALIM_PALETTE.inset;
const FIELD = PALIM_PALETTE.field;

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

function wrapWideSvg(inner: string, width: number, height: number): string {
  // Rotate a wide landscape plate 90deg clockwise onto a portrait e-ink page.
  const margin = 44;
  const outW = height + margin;
  const outH = width;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}" font-family="${FONT}"><rect width="${outW}" height="${outH}" fill="${FIELD}"/><g transform="translate(${height + margin / 2}, 0) rotate(90)">${inner}</g><text x="20" y="${Math.round(outH / 2)}" text-anchor="middle" font-size="16" fill="${MUTED}" transform="rotate(90 20 ${Math.round(outH / 2)})">Wide plate · rotated 90°</text></svg>`;
}

function pinBadge(cx: number, cy: number, index: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="14" fill="${FIELD}" stroke="${INK}" stroke-width="2"/><text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${INK}">${index + 1}</text>`;
}

function pinLegend(pins: ReadonlyArray<{ note: string }>, x: number, y: number): string {
  if (!pins.length) return '';
  let cx = x + 10;
  const parts: string[] = [];
  for (const [i, p] of pins.entries()) {
    parts.push(
      `<circle cx="${cx}" cy="${y - 6}" r="10" fill="${FIELD}" stroke="${INK}" stroke-width="1.5"/>`,
      `<text x="${cx}" y="${y - 1}" text-anchor="middle" font-size="13" font-weight="700" fill="${INK}">${i + 1}</text>`,
      `<text x="${cx + 18}" y="${y}" font-size="18" fill="${MUTED}">${e(p.note)}</text>`,
    );
    cx += 18 + p.note.length * 10 + 36;
  }
  return parts.join('');
}

function renderPlot(figure: Extract<Figure, { kind: 'plot' }>): {
  svg: string;
  width: number;
  height: number;
} {
  const width = 960;
  const padL = 44;
  const padR = 164;
  const padT = 44;
  const plotW = width - padL - padR;
  const plotH = 260;
  const baseY = padT + plotH;
  const allVals = [
    ...figure.series.flatMap((s) =>
      s.values.flatMap((v, idx) => {
        const b = s.band?.[idx] ?? 0;
        return [v - b, v + b];
      }),
    ),
    ...(figure.thresholds?.map((t) => t.at) ?? []),
  ];
  const minVal = figure.yRange ? figure.yRange[0] : Math.min(0, ...allVals);
  const maxVal = figure.yRange ? figure.yRange[1] : Math.max(...allVals, minVal + 1);
  const span = maxVal - minVal || 1;
  const yOf = (v: number) => Math.round(padT + plotH - ((v - minVal) / span) * plotH);
  const maxLen = Math.max(...figure.series.map((s) => s.values.length));
  const xOf = (idx: number, len: number) =>
    Math.round(padL + (len <= 1 ? 0 : (idx / (len - 1)) * plotW));

  const marks: string[] = [];
  if (figure.yUnit) {
    marks.push(
      `<text x="${padL}" y="${padT - 16}" font-size="18" fill="${MUTED}">${e(figure.yUnit)}</text>`,
    );
  }
  for (const t of figure.thresholds ?? []) {
    const ty = yOf(t.at);
    marks.push(
      `<line x1="${padL}" y1="${ty}" x2="${padL + plotW}" y2="${ty}" stroke="${LINE}" stroke-width="1.5" stroke-dasharray="5 5"/>`,
      `<text x="${padL}" y="${ty - 8}" font-size="18" fill="${MUTED}">${e(t.label)}</text>`,
    );
  }
  // Baseline only (Tufte minimal — no box frame, no heavy grid).
  marks.push(
    `<line x1="${padL}" y1="${baseY}" x2="${padL + plotW}" y2="${baseY}" stroke="${INK}" stroke-width="1.5"/>`,
  );

  const labelYs: number[] = [];
  for (const [sIdx, s] of figure.series.entries()) {
    const pts = s.values.map((v, i) => [xOf(i, s.values.length), yOf(v)] as const);
    if (s.band && s.band.length === s.values.length) {
      const upper = s.values.map((v, i) => `${xOf(i, s.values.length)},${yOf(v + s.band![i]!)}`);
      const lower = [...s.values]
        .reverse()
        .map(
          (v, r) =>
            `${xOf(s.values.length - 1 - r, s.values.length)},${yOf(v - s.band![s.values.length - 1 - r]!)}`,
        );
      marks.push(`<polygon points="${[...upper, ...lower].join(' ')}" fill="${INSET}"/>`);
    }
    const dash =
      s.style === 'dashed'
        ? ' stroke-dasharray="7 5"'
        : s.style === 'dotted'
          ? ' stroke-dasharray="2 5"'
          : sIdx > 0 && !s.style
            ? ' stroke-dasharray="7 5"'
            : '';
    const stroke = sIdx === 0 ? INK : MUTED;
    const sw = sIdx === 0 ? 3 : 2;
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
    marks.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
    const last = pts[pts.length - 1]!;
    let ly = last[1] + 6;
    while (labelYs.some((existing) => Math.abs(existing - ly) < 24)) ly += 24;
    labelYs.push(ly);
    marks.push(
      `<text x="${padL + plotW + 14}" y="${ly}" font-size="20" font-weight="${sIdx === 0 ? '700' : '500'}" fill="${stroke}">${e(s.label)}</text>`,
    );
  }

  for (const [pIdx, p] of (figure.pins ?? []).entries()) {
    const s = figure.series[p.series ?? 0] ?? figure.series[0]!;
    const idx = Math.max(0, Math.min(s.values.length - 1, Math.round(p.at)));
    const cx = xOf(idx, s.values.length);
    const cy = yOf(s.values[idx]!);
    marks.push(pinBadge(cx, cy, pIdx));
  }

  const xLabels = figure.xLabels ?? [];
  if (xLabels.length) {
    for (const [i, lbl] of xLabels.entries()) {
      const lx = xOf(i, xLabels.length);
      const anchor = i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle';
      marks.push(
        `<text x="${lx}" y="${baseY + 28}" text-anchor="${anchor}" font-size="18" fill="${MUTED}">${e(lbl)}</text>`,
      );
    }
  } else {
    marks.push(
      `<text x="${padL}" y="${baseY + 28}" text-anchor="start" font-size="18" fill="${MUTED}">1</text>`,
      `<text x="${padL + plotW}" y="${baseY + 28}" text-anchor="end" font-size="18" fill="${MUTED}">${maxLen}</text>`,
    );
  }

  const hasPins = (figure.pins?.length ?? 0) > 0;
  const height = baseY + (hasPins ? 82 : 52);
  if (hasPins) marks.push(pinLegend(figure.pins!, padL, baseY + 64));
  const inner = `<rect width="${width}" height="${height}" fill="${FIELD}"/>${marks.join('')}`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${inner}</svg>`,
    width,
    height,
  };
}

function renderGraph(figure: Extract<Figure, { kind: 'graph' }>): {
  svg: string;
  width: number;
  height: number;
} {
  const width = 960;
  const padX = 88;
  const n = figure.nodes.length;
  const coords = new Map<string, { x: number; y: number }>();

  let height = 300;
  if (figure.layout === 'ring') {
    height = 380;
    const cx = width / 2;
    const cy = 180;
    const rx = 280;
    const ry = 115;
    figure.nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      coords.set(node.id, {
        x: Math.round(cx + Math.cos(angle) * rx),
        y: Math.round(cy + Math.sin(angle) * ry),
      });
    });
  } else {
    const laneSet = new Set(figure.nodes.map((node) => node.lane ?? 0));
    const lanes = [...laneSet].sort((a, b) => a - b);
    const laneCenter = 155;
    const laneStep = 96;
    const mainNodes = figure.nodes.filter((node) => (node.lane ?? 0) === 0);
    const cols = Math.max(mainNodes.length, 2);
    const stepX = (width - padX * 2) / Math.max(cols - 1, 1);
    const mainIdx = new Map<string, number>();
    mainNodes.forEach((node, idx) => mainIdx.set(node.id, idx));

    figure.nodes.forEach((node, i) => {
      const lane = node.lane ?? 0;
      const col =
        lane === 0
          ? (mainIdx.get(node.id) ?? i)
          : Math.min(cols - 1, Math.max(0.5, (i / Math.max(n - 1, 1)) * (cols - 1)));
      const y = laneCenter + lane * laneStep;
      coords.set(node.id, { x: Math.round(padX + col * stepX), y: Math.round(y) });
    });
    const ys = [...coords.values()].map((c) => c.y);
    const minY = Math.min(...ys);
    const shiftY = minY < 76 ? 76 - minY : 0;
    if (shiftY) {
      for (const c of coords.values()) c.y += shiftY;
    }
    const maxY = Math.max(...[...coords.values()].map((c) => c.y));
    height = Math.max(260, maxY + (lanes.length > 1 ? 82 : 90));
  }

  const marks: string[] = [];
  for (const edge of figure.edges) {
    const a = coords.get(edge.from);
    const b = coords.get(edge.to);
    if (!a || !b) continue;
    const dash = edge.style === 'dashed' ? ' stroke-dasharray="6 5"' : '';
    const stroke = edge.style === 'dashed' ? MUTED : INK;
    if (Math.abs(a.y - b.y) < 4) {
      const dir = b.x >= a.x ? 1 : -1;
      const x1 = a.x + dir * 20;
      const x2 = b.x - dir * 20;
      marks.push(
        `<line x1="${x1}" y1="${a.y}" x2="${x2}" y2="${b.y}" stroke="${stroke}" stroke-width="2"${dash}/>`,
      );
      marks.push(
        `<path d="M${x2 - dir * 8} ${b.y - 5} L${x2} ${b.y} L${x2 - dir * 8} ${b.y + 5}" fill="none" stroke="${stroke}" stroke-width="2"/>`,
      );
      if (edge.label) {
        marks.push(
          `<text x="${Math.round((x1 + x2) / 2)}" y="${a.y - 12}" text-anchor="middle" font-size="18" fill="${MUTED}">${e(edge.label)}</text>`,
        );
      }
    } else {
      const cx1 = Math.round(a.x + (b.x - a.x) * 0.35);
      const cy1 = b.y;
      marks.push(
        `<path d="M${a.x} ${a.y} Q${cx1} ${cy1} ${b.x} ${b.y}" fill="none" stroke="${stroke}" stroke-width="2"${dash}/>`,
      );
      if (edge.label) {
        marks.push(
          `<text x="${Math.round((a.x + b.x) / 2)}" y="${Math.round((a.y + b.y) / 2) - 10}" text-anchor="middle" font-size="18" fill="${MUTED}">${e(edge.label)}</text>`,
        );
      }
    }
  }

  for (const node of figure.nodes) {
    const c = coords.get(node.id)!;
    const stroke = node.emphasis === 'muted' ? MUTED : INK;
    if (node.emphasis === 'terminal') {
      marks.push(
        `<circle cx="${c.x}" cy="${c.y}" r="20" fill="${FIELD}" stroke="${INK}" stroke-width="2.5"/>`,
        `<circle cx="${c.x}" cy="${c.y}" r="12" fill="${INK}"/>`,
      );
    } else {
      marks.push(
        `<circle cx="${c.x}" cy="${c.y}" r="16" fill="${FIELD}" stroke="${stroke}" stroke-width="2.5"/>`,
      );
    }
    const labelY = (node.lane ?? 0) < 0 ? c.y - 28 : c.y + 40;
    marks.push(
      `<text x="${c.x}" y="${labelY}" text-anchor="middle" font-size="20" font-weight="${node.emphasis === 'terminal' ? '700' : '500'}" fill="${stroke}">${e(node.label)}</text>`,
    );
  }

  for (const [pIdx, p] of (figure.pins ?? []).entries()) {
    const c = coords.get(p.at);
    if (c) marks.push(pinBadge(c.x + 20, c.y - 20, pIdx));
  }

  const hasPins = (figure.pins?.length ?? 0) > 0;
  if (hasPins) {
    height += 36;
    marks.push(pinLegend(figure.pins!, 44, height - 18));
  }
  const inner = `<rect width="${width}" height="${height}" fill="${FIELD}"/>${marks.join('')}`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${inner}</svg>`,
    width,
    height,
  };
}

function renderTrace(figure: Extract<Figure, { kind: 'trace' }>): {
  svg: string;
  width: number;
  height: number;
} {
  const width = 960;
  const labelW = 210;
  const padR = 96;
  const padT = 52;
  const rowH = 54;
  const trackW = width - labelW - padR;
  const maxEnd = Math.max(
    figure.total ?? 0,
    ...figure.lanes.map((l) => l.start + l.duration),
    ...(figure.thresholds?.map((t) => t.at) ?? []),
    1,
  );
  const xOf = (v: number) => Math.round(labelW + (v / maxEnd) * trackW);
  const trackBottom = padT + figure.lanes.length * rowH;

  const marks: string[] = [];
  // Subtle vertical time guide hairlines (0, 50%, 100%)
  for (const [idx, frac] of [0, 0.5, 1].entries()) {
    const gx = Math.round(labelW + frac * trackW);
    const val = Math.round(maxEnd * frac);
    const lbl = idx === 2 ? `${val}${figure.unit}` : String(val);
    marks.push(
      `<line x1="${gx}" y1="${padT - 8}" x2="${gx}" y2="${trackBottom}" stroke="${LINE}" stroke-width="1"/>`,
      `<text x="${gx}" y="${padT - 18}" text-anchor="${idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle'}" font-size="18" fill="${MUTED}">${e(lbl)}</text>`,
    );
  }
  for (const t of figure.thresholds ?? []) {
    const tx = xOf(t.at);
    marks.push(
      `<line x1="${tx}" y1="${padT - 8}" x2="${tx}" y2="${trackBottom}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="5 5"/>`,
      `<text x="${tx + 6}" y="${padT + 14}" font-size="17" fill="${MUTED}">${e(t.label)}</text>`,
    );
  }

  figure.lanes.forEach((lane, i) => {
    const y = padT + i * rowH + 14;
    const bx = xOf(lane.start);
    const bw = Math.max(6, Math.round((lane.duration / maxEnd) * trackW));
    const fill = lane.style === 'outline' ? FIELD : lane.style === 'muted' ? INSET : INK;
    const stroke = lane.style === 'outline' || lane.style === 'muted' ? INK : 'none';
    marks.push(
      `<text x="36" y="${y + 15}" font-size="20" fill="${INK}">${e(lane.label)}</text>`,
      `<rect x="${bx}" y="${y}" width="${bw}" height="18" fill="${fill}" stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : 2}"/>`,
      `<text x="${bx + bw + 12}" y="${y + 15}" font-size="18" fill="${MUTED}">${e(lane.note ?? `${lane.duration}${figure.unit}`)}</text>`,
    );
  });

  for (const [pIdx, p] of (figure.pins ?? []).entries()) {
    const px = xOf(p.at);
    marks.push(pinBadge(px, padT + 12, pIdx));
  }

  const hasPins = (figure.pins?.length ?? 0) > 0;
  const height = trackBottom + (hasPins ? 64 : 28);
  if (hasPins) marks.push(pinLegend(figure.pins!, 36, trackBottom + 42));
  const inner = `<rect width="${width}" height="${height}" fill="${FIELD}"/>${marks.join('')}`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${inner}</svg>`,
    width,
    height,
  };
}

function renderAnatomy(figure: Extract<Figure, { kind: 'anatomy' }>): {
  svg: string;
  width: number;
  height: number;
} {
  const width = 960;
  const hasOffset = figure.rows.some((r) => r.offset);
  const padL = hasOffset ? 136 : 44;
  const padR = 44;
  const padT = figure.scale?.length ? 52 : 28;
  const rowH = 66;
  const boxH = 50;
  const trackW = width - padL - padR;

  const marks: string[] = [];
  if (figure.scale?.length) {
    figure.scale.forEach((lbl, i) => {
      const sx = Math.round(padL + (i / (figure.scale!.length - 1)) * trackW);
      const anchor = i === 0 ? 'start' : i === figure.scale!.length - 1 ? 'end' : 'middle';
      marks.push(
        `<text x="${sx}" y="${padT - 16}" text-anchor="${anchor}" font-size="18" fill="${MUTED}">${e(lbl)}</text>`,
      );
    });
  }

  const fieldCenters = new Map<string, { x: number; y: number }>();
  figure.rows.forEach((row, rIdx) => {
    const y = padT + rIdx * rowH;
    if (row.offset) {
      marks.push(
        `<text x="36" y="${y + 32}" font-size="19" fill="${MUTED}">${e(row.offset)}</text>`,
      );
    }
    const totalSpan = row.fields.reduce((acc, f) => acc + f.span, 0) || 1;
    let cursor = padL;
    row.fields.forEach((field, fIdx) => {
      const fw =
        fIdx === row.fields.length - 1
          ? padL + trackW - cursor
          : Math.round((field.span / totalSpan) * trackW);
      const isFilled = field.emphasis === 'filled';
      const fill = isFilled ? INK : field.emphasis === 'muted' ? INSET : FIELD;
      const textFill = isFilled ? FIELD : INK;
      marks.push(
        `<rect x="${cursor}" y="${y}" width="${fw}" height="${boxH}" fill="${fill}" stroke="${INK}" stroke-width="1.5"/>`,
        `<text x="${Math.round(cursor + fw / 2)}" y="${y + 32}" text-anchor="middle" font-size="20" font-weight="${isFilled ? '600' : '500'}" fill="${textFill}">${e(field.label)}</text>`,
      );
      fieldCenters.set(field.label, { x: Math.round(cursor + fw / 2), y });
      cursor += fw;
    });
  });

  for (const [pIdx, p] of (figure.pins ?? []).entries()) {
    const c = fieldCenters.get(p.at);
    if (c) marks.push(pinBadge(c.x, c.y, pIdx));
  }

  const hasPins = (figure.pins?.length ?? 0) > 0;
  const bottom = padT + figure.rows.length * rowH;
  const height = bottom + (hasPins ? 52 : 20);
  if (hasPins) marks.push(pinLegend(figure.pins!, 36, bottom + 32));
  const inner = `<rect width="${width}" height="${height}" fill="${FIELD}"/>${marks.join('')}`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${inner}</svg>`,
    width,
    height,
  };
}

function renderEquation(figure: Extract<Figure, { kind: 'equation' }>): {
  svg: string;
  width: number;
  height: number;
} {
  const width = 960;
  const hasTop = figure.terms?.some((t) => t.position === 'top') ?? false;
  const hasBottom = figure.terms?.some((t) => t.position === 'bottom') ?? false;
  const centerY = hasTop ? 156 : 104;
  const height = centerY + (hasBottom ? 136 : 84);
  const marks: string[] = [];

  if (figure.fraction) {
    const fracX = 580;
    const barW = Math.max(
      110,
      Math.max(figure.fraction.numerator.length, figure.fraction.denominator.length) * 18 + 28,
    );
    const leftText = [figure.lhs ? `${figure.lhs} =` : '', figure.prefix ?? '']
      .filter(Boolean)
      .join(' ');
    if (leftText) {
      marks.push(
        `<text x="${fracX - barW / 2 - 42}" y="${centerY + 10}" text-anchor="end" font-size="34" fill="${INK}">${e(leftText)}</text>`,
      );
    }
    marks.push(
      `<text x="${fracX - barW / 2 - 12}" y="${centerY + 16}" text-anchor="end" font-size="68" font-weight="400" fill="${SOFT}">(</text>`,
      `<text x="${fracX}" y="${centerY - 16}" text-anchor="middle" font-size="32" fill="${INK}">${e(figure.fraction.numerator)}</text>`,
      `<line x1="${fracX - barW / 2}" y1="${centerY}" x2="${fracX + barW / 2}" y2="${centerY}" stroke="${INK}" stroke-width="2"/>`,
      `<text x="${fracX}" y="${centerY + 38}" text-anchor="middle" font-size="32" fill="${INK}">${e(figure.fraction.denominator)}</text>`,
      `<text x="${fracX + barW / 2 + 12}" y="${centerY + 16}" text-anchor="start" font-size="68" font-weight="400" fill="${SOFT}">)</text>`,
    );
    if (figure.suffix) {
      marks.push(
        `<text x="${fracX + barW / 2 + 44}" y="${centerY + 10}" text-anchor="start" font-size="34" fill="${INK}">${e(figure.suffix)}</text>`,
      );
    }
  } else {
    const full = [figure.lhs ? `${figure.lhs} =` : '', figure.expression ?? '']
      .filter(Boolean)
      .join(' ');
    marks.push(
      `<text x="${width / 2}" y="${centerY + 10}" text-anchor="middle" font-size="36" fill="${INK}">${e(full)}</text>`,
    );
  }

  for (const [idx, term] of (figure.terms ?? []).entries()) {
    const at = term.at ?? (idx + 1) / ((figure.terms?.length ?? 1) + 1);
    const tx = Math.round(140 + at * (width - 280));
    if (term.position === 'top') {
      marks.push(
        `<line x1="${tx}" y1="54" x2="${tx}" y2="${centerY - 52}" stroke="${MUTED}" stroke-width="1.5"/>`,
        `<circle cx="${tx}" cy="${centerY - 52}" r="4" fill="${INK}"/>`,
        `<text x="${tx}" y="42" text-anchor="middle" font-size="19" fill="${MUTED}">${e(term.label)}</text>`,
      );
    } else {
      marks.push(
        `<line x1="${tx}" y1="${centerY + 52}" x2="${tx}" y2="${height - 44}" stroke="${MUTED}" stroke-width="1.5"/>`,
        `<circle cx="${tx}" cy="${centerY + 52}" r="4" fill="${INK}"/>`,
        `<text x="${tx}" y="${height - 20}" text-anchor="middle" font-size="19" fill="${MUTED}">${e(term.label)}</text>`,
      );
    }
  }

  const inner = `<rect width="${width}" height="${height}" fill="${FIELD}"/>${marks.join('')}`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${inner}</svg>`,
    width,
    height,
  };
}

function renderTable(figure: Extract<Figure, { kind: 'table' }>): {
  svg: string;
  width: number;
  height: number;
} {
  const width = 960;
  const padX = 36;
  const tableW = width - padX * 2;
  const colCount = figure.columns.length;
  const colW = tableW / colCount;
  const headerY = 48;
  const rowH = 62;
  const topRule = 20;
  const midRule = 66;
  const botRule = midRule + figure.rows.length * rowH;
  const height = botRule + 24;

  const marks: string[] = [
    `<line x1="${padX}" y1="${topRule}" x2="${width - padX}" y2="${topRule}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${padX}" y1="${midRule}" x2="${width - padX}" y2="${midRule}" stroke="${LINE}" stroke-width="1.5"/>`,
    `<line x1="${padX}" y1="${botRule}" x2="${width - padX}" y2="${botRule}" stroke="${INK}" stroke-width="2"/>`,
  ];

  figure.columns.forEach((col, cIdx) => {
    const right = col.align === 'right';
    const x = Math.round(padX + cIdx * colW + (right ? colW - 10 : 8));
    marks.push(
      `<text x="${x}" y="${headerY}" text-anchor="${right ? 'end' : 'start'}" font-size="19" font-weight="600" fill="${MUTED}">${e(col.label)}</text>`,
    );
  });

  figure.rows.forEach((row, rIdx) => {
    const yTop = midRule + rIdx * rowH;
    const yMid = yTop + 38;
    if (rIdx > 0) {
      marks.push(
        `<line x1="${padX}" y1="${yTop}" x2="${width - padX}" y2="${yTop}" stroke="${INSET}" stroke-width="1"/>`,
      );
    }
    row.cells.slice(0, colCount).forEach((cell, cIdx) => {
      const col = figure.columns[cIdx]!;
      const right = col.align === 'right';
      const cellLeft = Math.round(padX + cIdx * colW + 8);
      const cellRight = Math.round(padX + (cIdx + 1) * colW - 10);
      if (typeof cell === 'string') {
        marks.push(
          `<text x="${right ? cellRight : cellLeft}" y="${yMid}" text-anchor="${right ? 'end' : 'start'}" font-size="21" font-weight="${cIdx === 0 ? '600' : '400'}" fill="${cIdx === 0 ? INK : SOFT}">${e(cell)}</text>`,
        );
      } else if ('sparkline' in cell) {
        const vals = cell.sparkline;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const span = max - min || 1;
        const sw = Math.min(140, colW - 24);
        const sh = 24;
        const sx0 = cellLeft;
        const sy0 = yTop + 20;
        const pts = vals.map((v, i) => [
          Math.round(sx0 + (i / (vals.length - 1)) * sw),
          Math.round(sy0 + sh - ((v - min) / span) * sh),
        ]);
        const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
        const last = pts[pts.length - 1]!;
        marks.push(
          `<path d="${d}" fill="none" stroke="${rIdx === 0 ? INK : MUTED}" stroke-width="${rIdx === 0 ? 2.5 : 2}"/>`,
          `<circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${rIdx === 0 ? INK : MUTED}"/>`,
        );
      } else if ('score' in cell) {
        const maxDots = cell.max ?? 5;
        const gap = 18;
        const startX = right ? cellRight - (maxDots - 1) * gap - 6 : cellLeft + 6;
        for (let d = 0; d < maxDots; d++) {
          const filled = d < cell.score;
          marks.push(
            `<circle cx="${startX + d * gap}" cy="${yTop + 31}" r="5.5" fill="${filled ? INK : FIELD}" stroke="${INK}" stroke-width="1.5"/>`,
          );
        }
      }
    });
  });

  const inner = `<rect width="${width}" height="${height}" fill="${FIELD}"/>${marks.join('')}`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${inner}</svg>`,
    width,
    height,
  };
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
    } else if (figure.kind === 'bars') {
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
    } else {
      const rendered =
        figure.kind === 'plot'
          ? renderPlot(figure)
          : figure.kind === 'graph'
            ? renderGraph(figure)
            : figure.kind === 'trace'
              ? renderTrace(figure)
              : figure.kind === 'anatomy'
                ? renderAnatomy(figure)
                : figure.kind === 'equation'
                  ? renderEquation(figure)
                  : renderTable(figure);
      if (figure.wide) {
        const inner = rendered.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
        svg = wrapWideSvg(inner, rendered.width, rendered.height);
      } else {
        svg = rendered.svg;
      }
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
    footnote: figure.footnote,
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
  const titleLines = wrap(title, 12);
  const subtitleLines = subtitle ? wrap(subtitle, 38) : [];
  const authorLines = creator ? wrap(creator, 42) : [];
  const longestTitle = Math.max(...titleLines.map((line) => Array.from(line).length));
  const titleSize = Math.min(104, 1008 / longestTitle, 480 / (titleLines.length * 1.08));
  const titleStep = titleSize * 1.08;
  const longestSubtitle = Math.max(1, ...subtitleLines.map((line) => Array.from(line).length));
  const subtitleSize = subtitleLines.length
    ? Math.min(32, 1008 / longestSubtitle, 380 / (subtitleLines.length * 1.45))
    : 0;
  const subtitleStep = subtitleSize * 1.45;
  const titleFirst = 340;
  const titleBottom = titleFirst + (titleLines.length - 1) * titleStep;
  const subtitleFirst = titleBottom + Math.max(54, titleSize * 0.6) + subtitleSize;
  const contentBottom = subtitleLines.length
    ? subtitleFirst + (subtitleLines.length - 1) * subtitleStep
    : titleBottom;
  const authorSize = Math.min(
    24,
    1008 / Math.max(1, ...authorLines.map((line) => Array.from(line).length)),
  );
  const authorStep = authorSize * 1.35;
  const authorFirst = 1468 - Math.max(0, authorLines.length - 1) * authorStep;
  const tracking = Math.max(1.2, titleSize * 0.028);
  // Minimal 4-frame hairline mark at the lower band when clear of text.
  const markY = authorLines.length ? Math.min(1260, authorFirst - 150) : 1320;
  const showMark = markY > contentBottom + 80;
  const mark = showMark
    ? `<rect x="96" y="${markY}" width="116" height="66" fill="none" stroke="${PALIM_PALETTE.ink}" stroke-width="2.5"/><rect x="236" y="${markY}" width="116" height="66" fill="none" stroke="${PALIM_PALETTE.ink}" stroke-width="2.5"/><rect x="376" y="${markY}" width="116" height="66" fill="none" stroke="${PALIM_PALETTE.ink}" stroke-width="2.5"/><rect x="516" y="${markY}" width="116" height="66" fill="${PALIM_PALETTE.ink}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="${PALIM_PALETTE.coverPaper}"/>${titleLines.map((line, i) => `<text x="96" y="${titleFirst + i * titleStep}" font-family="${e(PALIM_FONTS.reading)}" font-weight="600" font-size="${titleSize}" letter-spacing="-${tracking}" fill="${PALIM_PALETTE.ink}">${e(line)}</text>`).join('')}${subtitleLines.map((line, i) => `<text x="96" y="${subtitleFirst + i * subtitleStep}" font-family="${e(PALIM_FONTS.reading)}" font-weight="400" font-size="${subtitleSize}" fill="${PALIM_PALETTE.inkSoft}">${e(line)}</text>`).join('')}${mark}${authorLines.map((line, i) => `<text x="96" y="${authorFirst + i * authorStep}" font-family="${e(PALIM_FONTS.reading)}" font-weight="500" font-size="${authorSize}" fill="${PALIM_PALETTE.inkSoft}">${e(line)}</text>`).join('')}</svg>`;
}
