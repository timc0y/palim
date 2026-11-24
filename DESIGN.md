# Palim visual system

Warm retro e-reader paired with fine editorial publishing: one palette and two
typefaces across both independent journeys (create an illustrated EPUB; forward an
original EPUB or PDF unchanged). Code owns exact literal values; this file owns
surface boundaries, intent, and contracts.

## 1. Owners

| File                  | Owns                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/hardware.css` | Shared CSS tokens (`:root`), `@font-face` declarations (`IBM Plex Mono`, `Manrope`), `.machine`, `.key`                                                                                 |
| `public/kindle.css`   | Landing hardware frame (`@layer ui-sdk`), manual sections, colophon (`@import`s `hardware.css`)                                                                                         |
| `public/studio.css`   | Studio workspace, create/upload forms, shelf cards, dialogs, Settings (`@import`s `hardware.css`)                                                                                       |
| `public/style.css`    | Long-form reading & trust surfaces: `/privacy` and `/authorize` (`@import`s `hardware.css`)                                                                                             |
| `public/mark.svg`     | Favicon tile variant (indigo rounded tile, white stroked glyph)                                                                                                                         |
| `src/book-styles.ts`  | Canonical `PALIM_PALETTE`, `PALIM_FONTS`, EPUB `BOOK_CSS`, browser `PREVIEW_CSS`                                                                                                        |
| `src/figures.ts`      | `coverSvg`, bar-chart SVGs, Mermaid `staticSvg` variable mapping                                                                                                                        |
| `scripts/example.ts`  | Deterministically generates `public/reader.css`, `public/sample.html`, `public/sample.epub`, `public/images/sample-cover.png`, `public/images/sample-exposure.png`, and `public/og.png` |

Never edit generated outputs directly (`public/reader.css`, `public/sample.html`,
`public/sample.epub`, `public/images/*`, `public/og.png`, `public/landing.js`);
rebuild them with `npm run example` and `npm run ui`.

## 2. Tokens

- **Canonical CSS tokens** live only in `public/hardware.css` `:root`; surface
  stylesheets must not redefine hex literals or duplicate tokens.
- **Canonical TS tokens** live only in `src/book-styles.ts` (`PALIM_PALETTE`,
  `PALIM_FONTS`) and mirror the same paper, ink, muted, accent, surface, inset,
  line, and field values.
- **Decorative vs. essential rules:** `--line` carries subtle editorial dividers
  only (about 1.48:1 on paper — never a sole essential control boundary).
  `--control-line` carries inputs, buttons, and dropzone boundaries (>= 3:1
  non-text contrast across `--field`, `--surface`, `--paper`, and `--inset`).
- **Named intentional surface exceptions:** `--cover-paper` (`coverPaper`,
  generated covers), `--preview-paper` (`previewPaper`, browser reading preview),
  and `--screen` (`screen`, e-reader plate).
- **Scale tokens:** `--target` (`44px` minimum interactive size), `--space-1` to
  `--space-5`, and radii `--radius-chip`, `--radius-control`, `--radius-panel`,
  `--radius-pill`.

## 3. Typography

- **IBM Plex Mono (400/500):** machine hero wordmark, hardware keys, studio UI,
  long-form section headings, status metadata, and code chips.
- **Manrope (400–700):** landing manual prose, Privacy/Consent body, reading
  preview, and rasterized artwork (`src/raster.ts` embeds Manrope for all SVG
  families).
- **Studio label headings:** panel and dialog `h2` headings (`.settings-content h2`,
  `.shelf-panel > h2`, `.receipt-panel h2`, `.dialog-heading h2`) use uppercase
  tracked mono (`0.8125rem`, `0.06em` letter-spacing) so section structure separates
  from body text without inflating layout.
- **Icon vs. emblem counterpoint:** Studio action icons (`app.js` `.icon`) use
  `20px`, `1.6` stroke, round caps; the wordmark emblem uses square caps and
  miter joins.
- Fonts are self-hosted in `public/fonts/`; notices are in `THIRD_PARTY.md`.

## 4. Wordmark & emblem

- **Geometry:** `viewBox="0 0 32 32"` with three stepped ink strokes
  (`M7 10h7l2-2h9M7 16h11l2-2h5M7 22h4`).
- **In-page emblem (default):** bare `var(--ink)` stroke (`width: 1.75`,
  `stroke-linecap: square; stroke-linejoin: miter`) on landing, Studio, Privacy,
  OAuth consent, and `/sample.html`.
- **Tile variant (standalone small avatars only):** `public/mark.svg` favicon and
  the scaled `mark.svg` badge on `public/og.png`.

## 5. Web surfaces

- **Landing (`/`):** retro e-reader hardware shell holding wordmark, tagline,
  progressive-enhancement `connect an agent` disclosure (`/mcp` URL + Codex CLI),
  and `sample` / `studio` / `source` keys, followed by calm ruled manual sections
  and colophon.
- **Studio (`/app`):** separate `Create` and `Upload` tasks behind a single cog
  settings disclosure; native `<dialog>` sheets for Send to Kindle (always showing
  the full selected Kindle email above `Send`) and File info; connected OAuth
  agents and self-service deletion in Settings; errors live beside the failing
  operation; labels remain visible.
- **Privacy & Consent (`/privacy`, `/authorize`):** narrow readable column on
  paper for Privacy; calm `--surface` trust panel on `/authorize` with a skip link,
  signed-in account bar with `Switch account`, standalone inset mono `redirectHost`
  chip, ruled scope rows, 30-day refresh disclosure, and external `/style.css`
  (zero inline `<style>`/`<script>` under strict CSP).
- **Interactive baseline:** `>= 44px` touch targets, unified `4px` `:focus-visible`
  outline offset, `cursor: wait` on disabled/busy operations.

## 6. Components

- **Hardware keys & buttons:** `.machine` and `.key` in `hardware.css` keep local
  named bevel/material tokens (`--machine-*`, `--key-*`, `--bezel-*`).
- **Status pills & receipt states:** `.token-badge` and `.artifact-status` share
  one semantic pill token family (`--neutral-*`, `--info-*`, `--success-*`,
  `--warn-*`); delivery states preserve distinct computed colours for `submitted`,
  `rejected`, and `unknown`, never implying device confirmation.
- **File card bands:** title & status band, primary `Download` + preview/`Send`
  transfer actions, and `--inset` footer metadata + info icon.

## 7. Generated EPUB

- **`BOOK_CSS` invariants:** reflowable ordinary block flow (`max-width: 40em`),
  `em`-relative sizing only, and **zero** hardcoded `color` or `background` rules on
  prose so reader light, sepia, and dark themes inherit cleanly.
- **Covers (`coverSvg`):** align title, subtitle, and author on `x="96"`, emit no
  extra `<text>` nodes beyond `title + subtitle + creator`, wrap/scale metadata
  within bounds, and use the `coverPaper` + ink rule + indigo fold motif.
- **Charts, Mermaid & illustrations:** map through `PALIM_PALETTE` and `PALIM_FONTS`;
  all EPUB figures are PNG-only via `rasterize()` (`@cf-wasm/resvg` + Manrope).
- **Monochrome e-ink rule:** never encode meaning by colour alone — use direct text
  labels, ring thickness, bar length, rule thickness, and bold labels so greyscale
  displays stay legible.

## 8. Responsive, accessibility & test contracts

Named automated invariants:

- `test/chart-layout.test.ts`: bar-chart SVG keeps `width="560"`, `font-size="30"`,
  `340` max bar width, `text-anchor="start"`, rounding formatting, exact `<title>`.
- `test/book.test.ts`: `BOOK_CSS` has zero colour/background rules; `coverSvg` text
  concatenates strictly to `title+subtitle+creator` within bounds (`x="96"`,
  `y < 1520`); preview has one `<h1>`, no `<h4>`, no `.cover`; EPUB contains no
  `.svg` files and sets `rendition:layout` to `reflowable`; `staticSvg` leaves no
  unresolved `var(--_*)`.
- `scripts/runtime-proof.py`: landing focus order (`Tab` -> `.skip` -> `.bar .logo`),
  opaque backdrop focus contrast `>= 3:1`, `sample.html` `.preview-heading` 1px
  left-edge alignment, `>= 18px` preview body font, rendered chart font `>= 14px`,
  three distinct `.receipt-state` colours, `>= 44px` shelf targets, and zero
  horizontal overflow at `390px`, `1440px`, and `200%` text zoom.

## 9. Verification

Local checks (`npm run check`, `npm run format:check`, `npm run build`,
`npm audit --omit=dev --audit-level=high`, `npm run example`, CI EPUBCheck,
`python3 scripts/runtime-proof.py`, `python3 scripts/runtime-proof.py --pages`,
and greyscale artwork inspection) establish source and local-worker correctness
only — never remote Cloudflare deployment, Amazon conversion, or physical Kindle
rendering. Record evidence boundaries in [Verification](docs/verification.md).

## 10. Changing the system

1. Add or update CSS tokens in `public/hardware.css` and matching keys in
   `PALIM_PALETTE` / `PALIM_FONTS` in `src/book-styles.ts`.
2. Verify WCAG contrast (`>= 4.5:1` body text, `>= 3:1` essential controls).
3. Run `npm run example && npm run format && npm run check && npm run build`.
4. Run `python3 scripts/runtime-proof.py && python3 scripts/runtime-proof.py --pages`.
5. Visually check desktop, mobile, zoom, dark-mode EPUB, and greyscale artwork.
