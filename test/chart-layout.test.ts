import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFigure } from '../src/figures.js';

test('reader charts use readable stacked labels and preserve exact values when display is rounded', () => {
  const figure = renderFigure(
    {
      kind: 'bars',
      id: 'values',
      alt: 'Three measured values',
      caption: 'Actual source values',
      source: 'Synthetic regression fixture',
      unit: 'A long but fully preserved measurement unit',
      data: [
        { label: 'A long label which must not collide with its number', value: 0.1 },
        { label: 'Second', value: 0.2 },
        { label: 'Precise', value: 0.1234567890123456 },
      ],
    },
    new Map(),
  );
  const svg = new TextDecoder().decode(figure.bytes);
  assert.match(svg, /width="560"/);
  assert.match(svg, /font-size="30"/);
  assert.match(svg, /width="170"/);
  assert.match(svg, /width="340"/);
  assert.match(svg, /0\.1234567890123456/);
  assert.match(svg, /≈ 0\.1235/);
  assert.match(svg, /text-anchor="start"/);
});
