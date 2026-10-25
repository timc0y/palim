import { Resvg } from '@cf-wasm/resvg';
import { readingFont } from './reading-font.js';
import { invariant } from './errors.js';

// Amazon's E016 guidance excludes SVG from reflowable documents. Only generated,
// validated local artwork reaches this renderer; uploaded originals bypass it.
export async function rasterize(svg: string): Promise<Uint8Array> {
  const image = await Resvg.async(svg, {
    fitTo: { mode: 'width', value: 1200 },
    background: '#ffffff',
    font: {
      fontBuffers: [readingFont],
      defaultFontFamily: 'Manrope',
      serifFamily: 'Manrope',
      sansSerifFamily: 'Manrope',
      monospaceFamily: 'Manrope',
    },
  });
  try {
    invariant(
      image.width <= 1200 && image.height <= 5200,
      'FIGURE_TOO_DENSE',
      'Split this figure into smaller views.',
    );
    const rendered = image.render();
    try {
      return rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    image.free();
  }
}
