# Palim visual system

Palim uses a retro grayscale e-reader system: graphite and warm-grey device
housing, dark display rims, neutral e-ink screens, tactile hardware keys, plain
typographic reading surfaces, and standard operational controls inside application
screens. The treatment is intentionally reminiscent
of an early Kindle without copying Amazon branding or implying affiliation. It
must stay subordinate to the two independent product journeys: create an
illustrated EPUB; forward an original EPUB or PDF unchanged. Code owns exact
literal values; this file owns surface boundaries, intent, and contracts.

## 1. Owners

| File                     | Owns                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `public/theme.css`       | Shared CSS tokens (`:root`) and `@font-face` declarations (`IBM Plex Sans`, `IBM Plex Serif`, `IBM Plex Mono`, `Manrope`) |
| `public/hardware.css`    | Shared machine shell and tactile key treatment adapted from SPEC-01 (MIT); no tokens or fonts                             |
| `public/kindle.css`      | Single-device landing Kindle, in-screen home UI, connection menu and graphite bezel                                       |
| `public/studio.css`      | Studio machine, workspace screen, create/upload forms, shelf rows, dialogs, Settings                                      |
| `public/style.css`       | Long-form trust surfaces: `/privacy` and `/authorize`                                                                     |
| `public/mark.svg`        | Compact grayscale favicon/app-tile mark                                                                                   |
| `src/book-styles.ts`     | Canonical `PALIM_PALETTE`, `PALIM_FONTS`, EPUB `BOOK_CSS`, browser `PREVIEW_CSS`                                          |
| `src/figures.ts`         | `coverSvg`, bar-chart SVGs, Mermaid `staticSvg` variable mapping                                                          |
| `scripts/social-card.ts` | Generates the public Open Graph image.                                                                                    |
| `scripts/example.ts`     | Generates local EPUB validation fixtures in `artifacts/`.                                                                 |

## 2. Tokens and materials

- **Canonical CSS tokens** live only in `public/theme.css` `:root`; surface
  stylesheets must not redefine hex literals or duplicate tokens.
- **Canonical TS tokens** live only in `src/book-styles.ts` (`PALIM_PALETTE`,
  `PALIM_FONTS`) and mirror the same neutral paper, screen, ink, line, field,
  machine, key, and bezel values.
- **Palette discipline:** the interface is grayscale/neutral. `--accent` is ink,
  not blue. Semantic delivery and account states use distinguishable neutral
  tones, backgrounds, text labels, and layout rather than chromatic colour.
  State is never encoded by colour alone.
- **Materials:** `--paper` is outer plastic/page space; `--screen` is the pale
  neutral-grey e-ink display; `--machine-*`, `--key-*`, `--bezel-*`, and
  `--device-key-*` are reserved for device housing, keys, and display rims. Do
  not use them as arbitrary card decoration.
- **Scanlines:** subtle repeating 1px screen texture may appear inside device or
  e-ink panels. It must remain low contrast and must not interfere with reading.
- **Shape discipline:** machine housings and keys may be rounded because they are
  physical objects. Application screens use one level of bordered operational cards
  with small radii; reading and generated content remain rectangular, ruled, and
  plain. Shadows are reserved for physical machine/key depth and true overlays,
  not ordinary editorial cards.
- **Scale tokens:** `--target` (`44px` minimum interactive size), `--space-1` to
  `--space-5`, and radius aliases remain shared compatibility tokens.

## 3. Typography

- **IBM Plex Serif (600):** Studio screen titles, artifact filenames, receipt and
  dialog headings, and the file-picker prompt. It provides the editorial object
  voice inside the machine; it is not a general body face.
- **IBM Plex Sans (400/600):** Studio operational copy, labels, controls, forms,
  settings, helper text, and state messages. This is the product-interface voice.
- **IBM Plex Mono (400/500):** machine chrome, navigation, code, commands,
  hashes, machine addresses, metadata, manuscript editing, tabular measurement,
  and compact machine data. It is not decorative display type.
- **Manrope (400–800):** long-form reading surfaces, generated EPUB browser
  previews, covers, and generated artwork.
- **Copy discipline:** Studio copy uses short, direct, slightly dry task-first sentences in the spirit
  of PostHog: concrete, a little plain-spoken, never jokey at the expense of truth. Controls name
  their object (`Create EPUB`, `Upload original`, `Set up first send`); statuses
  say only what is known (`Not sent`, `Submitted`, `Not accepted`, `Status
unknown`). Remove implementation residue, repeated orientation, and vague
  system copy.
- **Headings:** sentence case, strong scale, balanced wrapping. Ordinary body text
  stays readable inside the portrait screen rather than being shrunk to fit.
- Fonts are self-hosted in `public/fonts/`; notices are in `THIRD_PARTY.md`.

## 4. Wordmark & mark

- **In-page identity:** the lowercase text wordmark `palim` is sufficient. Studio,
  Privacy and OAuth consent use text-only home links without a
  repeated inline emblem.
- **Compact mark:** `public/mark.svg` and the plugin asset use three stepped white
  strokes on a grayscale ink tile. They are reserved for browser chrome, app tiles,
  and plugin identity where the word cannot fit.
- **Generated-cover device:** the small stepped Palim line device may appear once
  on generated covers and the social card as a typographic colophon mark.

## 5. Web surfaces

- **Home (`/`):** the landscape sits above a full-width publishing desk. On wide screens, a graphite bezel frames two side-by-side actions. On phones, the page fills the screen and the two actions form a single list.
  Home and Shelf share the bottom navigation; settings and agent setup live in Menu.
  Studio uses the same book navigation and
  opens the active task on paper, inset against the landscape on wide screens.
- **Studio (`/app`):** the device frame contains a scrolling workspace.
  The header menu switches tasks. The selected task opens directly below. The heading and form share a left edge. Editors use the paper
  surface directly; separate surfaces hold results,
  receipts, files, and Settings, and familiar monochrome primary/secondary/plain
  controls. Results give the filename priority over status. Shelf has its own screen.
  Fine rules separate its files and mark the headings in Settings. Native `<dialog>` sheets
  handle Send to Kindle and File info. Settings cards stack in one column inside
  the portrait screen. First-send setup names the wider task (`Set up first send`),
  shows the Amazon sender prerequisite beside the return path, and repeats that
  prerequisite after the first address is saved. Errors live beside the failing
  operation. Initial account-load failure is a visible Studio-unavailable state
  with Retry rather than a message hidden inside a closed panel.
- **Privacy & Consent (`/privacy`, `/authorize`):** full-width paper on phones and framed panels on wider screens.
  Both use the Palim mark as the home link. Consent uses ruled permission rows, a signed-in
  account bar with `Switch account`, and a standalone inset mono `redirectHost`
  chip. Strict CSP still forbids inline `<style>`/`<script>`.
- **Interactive baseline:** every interactive control has a rendered hit area of
  at least `44px` in both dimensions, including shelf Download/Preview/Send/Delete
  actions. Focus uses a unified visible outline with a `4px` offset. Busy or
  disabled operations use `cursor: wait`.
- **Motion:** tactile key movement is limited to the existing short press
  translation and is removed under `prefers-reduced-motion`. Do not add reveals,
  page transitions, gestures, or other animation without using the Motion skill
  first.

Screen corners use the bezel radius less its inset. Controls, chips, panels
and outer shells use the shared radius tokens in `public/theme.css`. Inverted
panel headers follow the inner corner of their surrounding border.

## 6. Components

- **Screen controls:** application buttons are familiar flat monochrome controls,
  not physical keys. One dark filled primary action per view; secondary controls
  use light outlined material. Plain destructive or low-emphasis actions remain
  text-like but still receive the full 44px hit area.
- **Status pills & receipt states:** `.token-badge`, `.artifact-status`, and
  `.receipt-state` use neutral tones plus explicit text. `submitted`, `rejected`,
  and `unknown` remain distinguishable in rendered grayscale; `submitted` never
  implies Amazon import or device confirmation.
- **File rows:** title, metadata, transfer actions, and destructive actions stay
  scannable without nested cards. Read-only filenames/titles are plain text, not
  disabled inputs pretending to be editable. Hairlines group related rows.
- **Disclosures:** agent connection, metadata, tokens, and setup detail use
  progressive disclosure rather than showing every control at once.

## 7. Generated EPUB, preview, cover, and social card

- **`BOOK_CSS` invariants:** reflowable ordinary block flow (`max-width: 40em`),
  `em`-relative sizing only, inherited reader body font, automatic table layout,
  and **zero** hardcoded `color` or `background` rules on prose so reader fonts
  plus light, sepia, and dark themes inherit cleanly.
- **Covers (`coverSvg`):** monochrome typographic paper covers inside one thin
  editorial frame. The small stepped Palim device is the only brand ornament;
  title, subtitle, short ink stopped rule, creator, and bottom ink rule align in
  an optically centred composition. There is no illustrative scene, colour block,
  faux texture, or decorative imagery.
- **Social card:** the same grayscale editorial system at 1200×630: paper,
  stepped device, large wordmark, one factual line, domain and licence note.
- **Browser preview:** pale e-ink paper, Manrope reading text, and compact mono
  machine metadata. Contents are visible by default for books of six chapters or
  fewer and collapse behind disclosure for longer books. Raster figures may keep
  an opaque white plate because transparency and reader inversion are unreliable.
- **Charts, Mermaid & illustrations:** map through `PALIM_PALETTE` and
  `PALIM_FONTS`; all EPUB figures are PNG-only via `rasterize()` (`@cf-wasm/resvg`
  - Manrope). Diagrams may use geometry because it communicates data or structure.
- **Monochrome e-ink rule:** never encode meaning by colour alone — use direct
  text labels, ring thickness, bar length, rule thickness, and bold labels so
  grayscale displays stay legible.

## 8. Responsive, accessibility & proof contracts

- Desktop machines should read as centered physical objects with generous outer
  plastic margins; mobile machines may approach the viewport edges but must keep
  the screen and controls inside the frame.
- The landing Kindle approaches the viewport edges on narrow screens while its
  fixed-height screen and in-device connection menu remain contained. Studio
  forms, shelf rows, dialogs, and settings must remain usable at 390px wide.
- Browser proof must continue to cover desktop/mobile landing and Studio,
  create/upload journeys, strict CSP, focus contrast, placeholder contrast,
  shelf target dimensions, account isolation, and reduced-motion behavior.
- Visual evidence belongs in `artifacts/`; exact-tree claims belong in
  `docs/verification.md`. Browser rendering is not physical Kindle rendering.
