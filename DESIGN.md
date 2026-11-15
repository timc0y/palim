# Palim visual system

A retro e-reader: warm paper, quiet ink and indigo actions. The landing is almost
wordless; the studio exposes one task at a time. Manrope is for reading.

## Owners

`public/hardware.css` owns shared fonts, colours and hardware keys.
`public/kindle.css` owns the landing; `public/studio.css` owns the studio.
`public/style.css` serves privacy and OAuth consent. Keep changes with their owner.

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
