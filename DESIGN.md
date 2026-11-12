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

## The landing page — a reading machine (12 November 2026)

The owner replaced the landing page with a new world and asked for it to be original, abstract and
uncramped. The landing is now a single object: a retro e-reader on warm paper. `public/kindle.css`
and `public/kindle.js` own it; `public/style.css` still owns the workspace and the reader.

**Composition.** One full-width machine, centred on a warm paper field with a sparse punch-card dot
grid and print grain. Top rail, stage, bottom rail. The device is the whole page: charcoal body,
e-ink glass, a blank keyboard with two dark accent keys, page-turn buttons and a location bar.
Nothing else competes. There is no headline, no body copy, no feature grid and no SEO block.

**The screen.** Three abstract pages, changed only by the visitor: typeset prose, an open book
spread, and a framed illustration plate. Rules are thin and square-ended so they read as print
rather than a loading skeleton. Figures are book furniture, never dashboard charts, because the
product publishes illustrated EPUBs. The location bar and the three position ticks are truthful:
they follow the current page. A page change flashes the whole glass dark, as e-ink does.

**Identity.** The mark is an original blue square holding a stepped, folded-page stroke; it rhymes
with the plotter rule in the bottom rail. An earlier striped wordmark was rejected by the owner as
copied from IBM's 8-bar logo and does not appear. Wordmarks use a system monospace stack, uppercase
and widely tracked, so the brand reads as machine output. The workspace and privacy pages carry the
same emblem and monospace voice, so the product is one thing.

**Restraint with an entry point.** The owner asked for no cramped text. Navigation stays to four
tracked mono labels, and exactly one — studio — is promoted to a filled button, because a landing
page still has to give a visitor somewhere to start.

**Honest motion.** Nothing advances on its own. Auto-cycling was removed: WCAG 2.2.2 requires a
control for moving content, and the page has no room for one without adding the copy the owner
asked to avoid. Page changes are button-driven. The pointer tilt and the refresh flash both stop
under `prefers-reduced-motion`.

**Robustness.** The glass is a size container, so its contents scale with the device instead of
overflowing: 200% zoom on a short viewport still shows a whole page. The device is sized against
its container, so there is no horizontal scroll at 320px. Focus is blue on paper and a light blue
on the dark device.

**CSP.** The page ships under `style-src 'self'`. Every varying measurement is a class, never an
inline `style` attribute, and no script is inline.

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
