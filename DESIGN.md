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

# Palim visual system — cinematic review branch

The user rejected the previous pale serif design on 25 October 2026. This replacement follows Astra’s selected cinematic editorial reading-studio brief. The current deployed source and acceptance remain in docs/verification.md. Product truth remains in SIMPLE.md.

## Composition and type

One full-width graphite stage carries an upright modern sans headline, two literal actions and the selected sculptural folio artwork. There is no leaf mark, tilted book card, hoops, slogan divider or repeated philosophy band. A short second section presents text from the actual downloadable sample. The serif face belongs only to that reading specimen. Wordmark, product headings and controls use self-hosted OFL Manrope, with no third-party font request.

The reading desk shows one task panel at a time and preserves entered fields on switching. The active task leads; the temporary shelf follows. Confirmed recipient selection remains explicit, while address management and MCP sit in secondary disclosures. Inbox sign-in codes and Kindle-book confirmation codes remain separate. Actual expiry, target and provider-versus-device receipts stay visible.

## Shared implementation rules

Palim retains vanilla HTML/CSS/JavaScript and its existing Worker service. Its single stylesheet owns tokens, base rules, components and responsive changes. The root respects the user's text size. Body is 1rem, labels .875rem; controls are at least 3rem and shelf targets at least 2.75rem. Display, page margins and section spacing interpolate in bounded rem-based ranges. Shared colour, spacing, radius and type tokens are consumed by components. Borders retain thin pixel rules. Layout changes follow available content width, with minmax(0, 1fr), safe wrapping, native controls, explicit focus and reduced motion.

This applies Timothy Ricks’ current [Lumos 1.0 tokens](https://lumosframework.com/docs/concepts/tokens/), [layout ownership](https://lumosframework.com/docs/concepts/layout/), [cascade](https://lumosframework.com/docs/concepts/the-cascade/) and [accessibility](https://lumosframework.com/docs/concepts/accessibility/) principles. A user-selected private Astro implementation was also studied read-only for generic construction patterns; its identity, source implementation and client material are not copied into this public repository. Private reference identity is retained only in ignored operator research notes.

## Artwork and delivery

The selected original artwork is preserved through Library materialization with its identity/version metadata. `public/images/palim-editorial-folio.jpg` is an optimized 314 KB derivative of the approved original. Its source provenance is embedded in the asset. Image dimensions reserve its aspect ratio and it receives hero fetch priority; text and controls remain HTML. The unused exploratory image is not shipped. No generated raster contains UI text.

## Review evidence

Compare the current branch's desktop/mobile CI screenshots with the previously deployed screenshot artifact linked in docs/verification.md. A technical pass is not aesthetic approval. Parent/Astra rendered review precedes production promotion. Verify 390px and 1440px, intermediate widths, enlarged text, keyboard paths, safe original-file forwarding, task-state preservation and action-local errors. No live email is needed for these captured-mail proofs.

The deterministic UI scan was reviewed against the actual renders. Its full-bleed-stage and flex-height navigation padding findings describe intentional container ownership, and its specimen-font finding is the explicitly scoped reading excerpt. Display/privacy tracking was relaxed. Palette/transparency and type-role findings are not a claim of a clean detector report; the rendered review remains the aesthetic authority.

Astra accepted the cinematic landing, artwork and typography, then requested a bounded workspace hierarchy correction. Empty Create starts with title/manuscript; recipient selection lives beside file results and the shelf. Download EPUB is the primary result action, Preview is secondary, Kindle sending is a separate optional context, and checksums/source exports sit under Technical details. A single transient client selection synchronizes owned confirmed-address pickers; the existing backend still enforces ownership and explicit send safety. Dark header/hero focus uses ice, light surfaces use dark blue, and placeholders use the muted text role. Native browser checks measure the actual focused outline and placeholder colours, including the dark workspace nav.

## Reading sample refinement

The public sample is a useful short photography edition, “One stop of light”, with a concrete exposure trade-off, calculated relative-light ratios and a practical exercise. The landing excerpt, public reader and EPUB share that manuscript. The browser reader starts with a compact masthead, title/deck and opening prose, without the EPUB cover or duplicate title page. It uses a 66ch maximum container, serif prose and restrained sans headings/metadata. Public static HTML loads generated same-origin reader.css under the unchanged strict CSP; private previews retain their existing no-script sandbox and self-contained styles. Packaged EPUBs keep responsive covers and reader-overridable type. Unique chapter-prefixed anchors and one combined-preview h1 preserve navigation.

The sample's web outline normalizes authored Markdown headings beneath chapter headings, yielding h1/h2/h3 rather than skipped levels. Web reading chrome and headings use the existing self-hosted Manrope; prose stays serif. A narrowly scoped font permission and anonymous CORS on exact public font paths let private sandboxed previews use the same web face without permitting scripts, credentials or arbitrary network access. EPUB text remains font-flexible. An original geometric image compares opening area and duration; no source photographs are copied. Chart labels are 30 SVG units and checked at their actual rendered mobile scale. Source illustration assets stay outside the document shelf.
