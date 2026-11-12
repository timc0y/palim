---
name: Palim
description: Make room for reading.
colors:
  graphite: '#11151B'
  chalk: '#FAFAF7'
  surface: '#FFFFFF'
  muted: '#626975'
  ice: '#BACCF4'
  line: '#D9DCE0'
  field-border: '#828A96'
  focus: '#315D9C'
typography:
  display:
    fontFamily: 'Manrope, system-ui, sans-serif'
    fontSize: 'clamp(3.5rem, 1.82857143rem + 6.85714286vw, 8rem)'
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: '-0.045em'
  body:
    fontFamily: 'Manrope, system-ui, sans-serif'
    fontSize: '1rem'
    lineHeight: 1.6
  reading:
    fontFamily: 'Georgia, serif'
    fontSize: '1.125rem'
    lineHeight: 1.8
rounded:
  control: '0.5rem'
  surface: '0.75rem'
spacing:
  sm: '0.5rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2.5rem'
  section: '4rem'
components:
  button-primary:
    backgroundColor: '{colors.graphite}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '0.75rem 1.25rem'
---

# Palim visual system

The user rejected the previous pale serif design on 25 October 2026. This replacement follows Astra’s selected cinematic editorial reading-studio brief. The current deployed source and acceptance remain in docs/verification.md. Product truth remains in SIMPLE.md.

## The landing page — the mark is the picture (12 November 2026)

The owner replaced the landing page twice in one session. It is now the version four independent
designers each answered separately, of which the owner picked one direction.

**The idea.** The hero _is_ the mark. The stepped, folded-page stroke that lives in the corner
emblem is enlarged until it runs off the right edge of the page and becomes the picture. The
small emblem and the giant one are the same object at two scales, which is what makes the page
read as a system rather than an arrangement. The wordmark is set large in IBM Plex Mono with a
blinking block caret, like a shell prompt waiting for a command.

**References, and what was taken from each.**

- _boat.dev_: a deep indigo field, a dithered pixel horizon, IBM Plex Mono for every technical
  voice, a terminal block with a copy button, and one filled button among quiet links.
- _prenostics_: a white ground rather than a colour field, an indigo ink, and single magenta and
  cyan accents used only twice in the whole page — one bookmark in the shelf and one spine.
- _Kindle and early hardware_: the hardware keys are the navigation, and they behave like keys.
- The pixel shelf of books is drawn as inline SVG with a dithered reflection, not as an image.

**What it deliberately is not.** There is no headline, no tagline, no paragraph, no feature list
and no pricing. The page explains itself through one command line and four keys. The owner
asked for no taglines, and this page takes that literally.

**Restraint with a way in.** Exactly one action is promoted: `studio`, the filled indigo key.
The `connect` key is the one an open-source visitor actually needs, and it points at the
documented MCP connection. Privacy stays a quiet link in the top bar, where a legal notice
belongs, rather than pretending to be a destination.

**The fold has to complete.** Below the wide breakpoint the fold is scaled to fit rather than
cropped: the idea is the fold, so a chopped fold would be three unrelated bars. The bleed off
the right edge is a deliberate crop that only happens where the whole shape is legible.

**Robustness.** Zero horizontal overflow at 1440, 390 and 320 pixels. Focus is visible on the
cream ground and on the dark shelf. `prefers-reduced-motion` stops the caret blink and the key
lift. The page carries no inline `style` attributes and no external requests, because it ships
under `style-src 'self'`.

**Type.** The landing and the workspace share IBM Plex Mono for the wordmark and the technical
voice, self-hosted under `public/fonts/`. The body face remains Manrope. The favicon and the
Codex plugin icon are the same emblem.

## Composition and type

The landing page is described above. This section covers the workspace and the public reader.

The reading desk is one task at a time, in upright modern sans, with self-hosted OFL Manrope and
no third-party font request. The public sample is a separate reading specimen in serif, and that
serif belongs only to that specimen. The workspace wordmark carries the same emblem and monospace
voice as the landing, so the product reads as one thing across surfaces.

The reading desk shows one task panel at a time and preserves entered fields on switching. The active task leads; the temporary shelf follows. Saved recipient selection remains explicit, while address management and MCP sit in secondary disclosures. Sign-in uses the normal inbox; Kindle destinations require no Palim codes. Personal sender setup is separate from saved addresses. Actual expiry, target and provider-versus-device receipts stay visible.

The create panel also offers a secondary image upload for connected agents. It shows temporary image IDs, a copy action and expiry, with recent IDs restored from the account after a refresh; image assets do not become sendable documents on the shelf. The existing limits and shared upload allowance remain visible beside the control. A shortcut above the task panel opens the agent connection without changing the selected task. Loading the example asks before replacing entered text, and the panel identifies its attached figures and sources while they are in use.

## Shared implementation rules

Palim retains vanilla HTML/CSS/JavaScript and its existing Worker service. Its single stylesheet owns tokens, base rules, components and responsive changes. The root respects the user's text size. Body is 1rem, labels .875rem; controls are at least 3rem and shelf targets at least 2.75rem. Display, page margins and section spacing interpolate in bounded rem-based ranges. Shared colour, spacing, radius and type tokens are consumed by components. Borders retain thin pixel rules. Layout changes follow available content width, with minmax(0, 1fr), safe wrapping, native controls, explicit focus and reduced motion.

This applies Timothy Ricks’ current [Lumos 1.0 tokens](https://lumosframework.com/docs/concepts/tokens/), [layout ownership](https://lumosframework.com/docs/concepts/layout/), [cascade](https://lumosframework.com/docs/concepts/the-cascade/) and [accessibility](https://lumosframework.com/docs/concepts/accessibility/) principles. A user-selected private Astro implementation was also studied read-only for generic construction patterns; its identity, source implementation and client material are not copied into this public repository. Private reference identity is retained only in ignored operator research notes.

## Artwork and delivery

`public/images/palim-editorial-folio.jpg` is an optimized 314 KB derivative of an approved
original, preserved with its identity/version metadata and embedded source provenance. The reading
machine no longer uses it, so it ships unreferenced rather than deleted: the approved original and
its provenance stay recoverable, and the file costs one asset in the bundle. The sample's
`sample-exposure.png` is a real diagram in the generated EPUB and remains in use. No generated
raster contains UI text.

## Review evidence

The landing page was reviewed by three independent design reviews against the rendered page, not
the source. Each one read the page in Chromium at desktop and mobile widths and applied the
interface-craft method. The reviews were not advisory: they found that the position indicator
lied, that the layout overflowed at 320px, that the screen cropped at 200% zoom, that the e-ink
flash inverted a transparent layer instead of the glass, that the emblem read as a generic
document icon, and that the screen content read as an analytics dashboard rather than a book. All
of those are fixed, and the applied changes are recorded in docs/verification.md. A technical
pass is not aesthetic approval, so a rendered review still precedes promotion.

For the workspace, compare the current branch's desktop/mobile CI screenshots with the previously
deployed screenshot artifact linked in docs/verification.md. Verify 390px and 1440px, intermediate
widths, enlarged text, keyboard paths, safe original-file forwarding, task-state preservation and
action-local errors. No live email is needed for these captured-mail proofs.

Astra accepted the earlier cinematic landing, artwork and typography, then requested a bounded
workspace hierarchy correction. Empty Create starts with title/manuscript; recipient selection
lives beside file results and the shelf. Download EPUB is the primary result action, Preview is
secondary, Kindle sending is a separate optional context, and checksums/source exports sit under
Technical details. A single transient client selection synchronizes owned saved-address pickers;
the existing backend still enforces ownership and explicit send safety. Dark header focus uses
ice, light surfaces use dark blue, and placeholders use the muted text role. Native browser checks
measure the actual focused outline and placeholder colours, including the dark workspace nav.

## Reading sample refinement

The public sample is a useful short photography edition, “One stop of light”, with a concrete exposure trade-off, calculated relative-light ratios and a practical exercise. The landing excerpt, public reader and EPUB share that manuscript. The browser reader starts with a compact masthead, title/deck and opening prose, without the EPUB cover or duplicate title page. It uses a 66ch maximum container, serif prose and restrained sans headings/metadata. Public static HTML loads generated same-origin reader.css under the unchanged strict CSP; private previews retain their existing no-script sandbox and self-contained styles. Packaged EPUBs keep responsive covers and reader-overridable type. Unique chapter-prefixed anchors and one combined-preview h1 preserve navigation.

The sample's web outline normalizes authored Markdown headings beneath chapter headings, yielding h1/h2/h3 rather than skipped levels. Web reading chrome and headings use the existing self-hosted Manrope; prose stays serif. A narrowly scoped font permission and anonymous CORS on exact public font paths let private sandboxed previews use the same web face without permitting scripts, credentials or arbitrary network access. EPUB text remains font-flexible. An original geometric image compares opening area and duration; no source photographs are copied. Chart labels are 30 SVG units and checked at their actual rendered mobile scale. Source illustration assets stay outside the document shelf.
