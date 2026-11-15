# Palim visual system

A retro e-reader: warm paper, quiet ink and indigo actions. The landing is almost
wordless; the studio exposes one task at a time. Manrope is for reading.

## Owners

`public/hardware.css` owns shared fonts, colours and hardware keys.
`public/kindle.css` owns the landing; `public/studio.css` owns the studio.
`public/style.css` serves privacy and OAuth consent. Keep changes with their owner.

`src/book-styles.ts` owns generated EPUB and browser-preview styles. The sample
build writes `public/reader.css` from that source; do not edit the generated file.

## Colour and type

The hardware palette is paper `#efefeb`, ink `#242521` and indigo `#263fa9`.
IBM Plex Mono 400/500 carries the landing and studio. Reading pages and generated
artwork use Manrope. Fonts are self-hosted; notices are in `THIRD_PARTY.md`.

## Landing

A framed e-ink display holds the wordmark and a native connect disclosure. Sample,
studio and source sit on the hardware keys below. Commands remain available
without JavaScript; the enhanced copy control appears after its module loads.

## Studio

Create and Upload are separate tasks; Settings holds addresses and account setup.
Cards share gutters and corners, controls have a 44px minimum target, and errors
stay beside the operation that failed. Labels remain visible.

A file has three bands: title and status, transfer actions, then file information.
The pencil returns to the retained editor. Download leads, Preview uses an icon,
and More share options opens Kindle selection and explicit sending. File details
sit behind the footer information icon. Optional book fields occupy the editor
footer. Narrow layouts stack actions and enlarged text without overlap.

Icon-only controls keep accessible names. Native dialogs provide dismissal and
focus containment. Pending controls stay disabled until the operation settles;
unknown delivery status never implies success or an automatic resend.

## Reading

EPUB text remains reflowable XHTML with semantic headings, navigation and figure
alternatives. Artwork is PNG. A preview is useful evidence of layout, not proof
of Amazon conversion, Kindle delivery or physical-device readability.

Generated covers use a paper ground, dark title and abstract indigo fold. Long
metadata wraps and scales within the cover; the selectable title page retains
the full text. Chapters have a quiet number and clear opening. Figures carry
stable numbers and captions. EPUB sizes stay relative and colours inherit from
the reader. Its ordinary block flow has a 40em maximum measure, relative gutters
and a consistent paragraph size. The browser preview uses Manrope for reading;
the cover remains in the EPUB rather than repeating beside the browser title.
The sample illustration is rebuilt from its SVG source with the same rasterizer
used for generated artwork.

The preview uses a shared grid: a 4.5rem label column, 2rem gutter and one reading
column inside a 52rem page. Title, contents, chapter text, artwork and captions
share that reading edge; chapter and figure numbers share the label edge.
Below 40rem, the grid stacks into one column with 24px minimum page gutters.
Spacing uses an 8px scale: 16px paragraph gaps, 32px heading/figure separation
and 48px chapter padding on desktop. Chapter rules separate the full page;
captions stay with their figures. Sources have their own styling so an ordinary
final chapter keeps its normal text size when a book has no sources section.

Charts have a bounded reading width so their raster labels do not dominate a
wide page. The sample moves from a light-ratio chart to the aperture exchange,
then a short field exercise. Brief blockquotes hold the principle to remember;
the essential values remain in reflowable text beside the graphics.
