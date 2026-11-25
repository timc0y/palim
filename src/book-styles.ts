export const PALIM_PALETTE = {
  paper: '#eeeeea',
  coverPaper: '#e6e6e1',
  previewPaper: '#d8d8d2',
  surface: '#f8f8f4',
  inset: '#e2e2dc',
  ink: '#242521',
  inkSoft: '#4c4c47',
  muted: '#555550',
  accent: '#242521',
  accentDeep: '#111210',
  screen: '#d8d8d2',
  line: '#c2c2bb',
  field: '#ffffff',
} as const;

export const PALIM_FONTS = {
  reading: 'Manrope, sans-serif',
  mono: '"IBM Plex Mono", monospace',
} as const;

// EPUB keeps ordinary block flow so the reading app can paginate and resize it.
export const BOOK_CSS = `
body { box-sizing: border-box; max-width: 40em; margin: 0 auto; padding: 0 .75em; font-size: 1em; line-height: 1.5; overflow-wrap: break-word; }
h1, h2, h3 { line-height: 1.2; font-weight: bold; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.75em; margin: 0 0 .75em; }
h2 { font-size: 1.3em; margin: 2em 0 .75em; }
h3 { font-size: 1.1em; margin: 1.5em 0 .75em; }
p { margin: 0 0 1em; orphans: 3; widows: 3; }
a { text-decoration: underline; }
img { display: block; max-width: 100%; height: auto; margin: 0; }
.chapter-heading { margin: 1em 0 1.5em; padding-bottom: 1em; border-bottom: 1px solid; page-break-inside: avoid; break-inside: avoid; }
[dir="rtl"] .chapter-number { text-align: right; }
.chapter-number { font-size: .85em; margin: 0 0 .75em; }
.chapter-heading h1 { margin: 0; }
figure { max-width: 30em; margin: 2em 0; page-break-inside: avoid; break-inside: avoid; }
.figure-bars img { width: 100%; max-width: 24em; }
figcaption { font-size: .85em; line-height: 1.5; margin-top: .75em; }
.figure-number { font-weight: bold; margin-right: .5em; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85em; border: 1px solid; padding: 1em; margin: 1.5em 0; }
code { font-family: monospace; }
blockquote { margin: 1.5em 0; padding-inline-start: 1em; border-inline-start: 2px solid; }
hr { width: 25%; margin: 1.5em auto; border: 0; border-top: 1px solid; }
blockquote p { margin: 0; }
blockquote > p + p { margin-block-start: .75em; }
table { border-collapse: collapse; width: 100%; font-size: .85em; line-height: 1.5; margin: 1.5em 0; }
th, td { overflow-wrap: anywhere; padding: .75em .5em; border-bottom: 1px solid; text-align: start; vertical-align: top; }
th { font-size: .9em; font-weight: bold; border-bottom: 1px solid; }
ul, ol { margin: 0 0 1em; padding-inline-start: 1.5em; }
li { margin-bottom: .5em; }
.title-page { margin: 2em 0; padding-top: 1em; border-top: 1px solid; }
.title-page h1 { font-size: 2.25em; line-height: 1.1; margin-bottom: .5em; }
.subtitle { font-size: 1.15em; line-height: 1.5; }
.author { margin: 1.5em 0; }
.title-page .description { font-size: 1em; margin: 1em 0; }
.source-note { font-size: .85em; }
.source-section li > p { margin: 0; }
.source-section li > p + p { margin-top: .2em; }
.source-section h1 { font-size: 1.75em; }
`;

// Every preview section uses the same label column, gutter and reading column.
export const PREVIEW_CSS = `
@font-face { font-family: Manrope; src: url(/fonts/Manrope-Latin.woff2) format("woff2"); font-weight: 400 800; font-display: swap; }
* { box-sizing: border-box; }
html { color-scheme: light; background: ${PALIM_PALETTE.previewPaper}; background-image: repeating-linear-gradient(0deg, rgb(0 0 0 / 1.5%) 0 1px, transparent 1px 3px); color: ${PALIM_PALETTE.ink}; scroll-behavior: smooth; }
body {
  --reader-columns: 4.5rem minmax(0, 1fr);
  --reader-content: 2;
  --reader-gap: 2rem;
  --reader-rule: ${PALIM_PALETTE.line};
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.5rem clamp(24px, 4vw, 48px) 4rem;
  font: 1.125rem/1.7 Manrope, Arial, sans-serif;
  overflow-wrap: break-word;
}
h1, h2, h3, h4, h5, h6, p, figure, blockquote, pre, ul, ol { margin: 0; }
h1, h2, h3, h4, h5, h6 { font-weight: 500; line-height: 1.25; letter-spacing: -.025em; }
h1 { font-size: 3rem; line-height: 1.1; letter-spacing: -.035em; overflow-wrap: anywhere; }
a { color: ${PALIM_PALETTE.accent}; text-underline-offset: .2em; }
a:focus-visible, summary:focus-visible, .preview-table:focus-visible { outline: 2px solid ${PALIM_PALETTE.accent}; outline-offset: 4px; }
::selection { background: ${PALIM_PALETTE.accent}; color: ${PALIM_PALETTE.field}; }
strong { font-weight: 650; }
.preview-skip { position: absolute; inset-inline-start: 1rem; top: 1rem; padding: .5rem 1rem; background: white; z-index: 1; }
.preview-skip:not(:focus) { clip-path: inset(50%); width: 1px; height: 1px; padding: 0; overflow: hidden; }
.preview-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--reader-rule); font-size: .875rem; line-height: 1.5; }
.preview-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.25rem; }
footer.preview-tools { margin-top: 2rem; padding: .5rem 0 0; border-bottom: 0; border-top: 1px solid var(--reader-rule); }
.preview-tools a { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; color: inherit; text-decoration: none; }
.preview-tools a:hover, .preview-tools a:focus-visible { color: ${PALIM_PALETTE.accent}; text-decoration: underline; }
.preview-header, .preview-contents, main > section, .chapter-heading, figure, figcaption { display: grid; grid-template-columns: var(--reader-columns); column-gap: var(--reader-gap); }
.preview-header { padding-block: 2.5rem 2rem; }
.preview-heading { grid-column: var(--reader-content); min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
.preview-meta, .chapter-number, .figure-number { font-size: .8125rem; line-height: 1.5; color: ${PALIM_PALETTE.muted}; }
.preview-header .subtitle { font-size: 1.125rem; line-height: 1.6; color: ${PALIM_PALETTE.muted}; }
.preview-contents { padding-block: .5rem; border-block: 1px solid var(--reader-rule); font-size: .875rem; }
.preview-contents details { grid-column: var(--reader-content); min-width: 0; }
.preview-contents summary { display: flex; align-items: center; gap: .75rem; min-height: 44px; list-style: none; cursor: pointer; }
.preview-contents summary::-webkit-details-marker { display: none; }
.preview-contents summary::marker { content: ""; }
.preview-contents summary::after { content: "+" / ""; margin-inline-start: auto; }
.preview-contents details[open] summary::after { content: "−" / ""; }
.preview-contents ol { padding-block: .5rem; padding-inline: 1.5rem 0; }
.preview-contents a { display: flex; align-items: center; min-height: 44px; padding-block: .5rem; overflow-wrap: anywhere; }
@media screen {
  .chapter:focus-visible > .chapter-heading h2 { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: .18em; }
}
main > section { row-gap: 1rem; padding-block: 3rem; scroll-margin-top: 1.5rem; }
main > section + section { border-top: 1px solid var(--reader-rule); }
main > section > * { grid-column: var(--reader-content); min-width: 0; }
main > section > .chapter-heading { grid-column: 1 / -1; margin-bottom: .5rem; align-items: start; }
[dir="rtl"] .chapter-number, [dir="rtl"] .figure-number { text-align: right; }
.chapter-number { padding-top: .5rem; }
.chapter-heading h2, .source-section > h2 { grid-column: var(--reader-content); font-size: 1.75rem; }
main h3 { font-size: 1.25rem; margin-top: 1rem; }
main h4, main h5, main h6 { font-size: 1rem; margin-top: 1rem; }
main > section > figure { grid-column: 1 / -1; row-gap: 1rem; margin-block: 1rem; }
figure img { grid-column: var(--reader-content); display: block; width: 100%; max-width: 30rem; height: auto; margin: 0; }
.figure-bars img { width: 100%; max-width: 26rem; }
figcaption { grid-column: 1 / -1; font-size: .875rem; line-height: 1.6; color: ${PALIM_PALETTE.muted}; }
.figure-number { padding-top: .125rem; }
.caption-text { grid-column: var(--reader-content); }
hr { width: 25%; margin: .5rem auto; border: 0; border-top: 1px solid var(--reader-rule); }
blockquote { margin-top: .5rem; border-inline-start: 1px solid var(--reader-rule); padding-inline-start: 1.5rem; font-size: 1rem; line-height: 1.7; }
blockquote > p + p { margin-block-start: .75em; }
ul, ol { padding-inline-start: 1.5rem; }
li + li { margin-top: .5rem; }
li > p + p { margin-top: .5rem; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .875rem; line-height: 1.6; border: 1px solid var(--reader-rule); padding: 1rem; background: ${PALIM_PALETTE.inset}; }
code { font-family: ui-monospace, monospace; }
.preview-table { min-width: 0; overflow-x: auto; }
.preview-table table:has(th:nth-child(5)) th { min-width: 6ch; }
table { border-collapse: collapse; width: 100%; font-size: .875rem; line-height: 1.6; }
th, td { overflow-wrap: anywhere; padding: .75rem .5rem; border-bottom: 1px solid var(--reader-rule); text-align: start; vertical-align: top; }
th { font-weight: 500; color: ${PALIM_PALETTE.muted}; }
td { font-variant-numeric: tabular-nums; }
.source-section ol { font-size: .875rem; line-height: 1.7; }
.source-section li + li { margin-top: 1em; }
.source-section li > p + p { margin-top: .2em; }
.source-section a { overflow-wrap: anywhere; }
@media (max-width: 40rem) {
  body { --reader-columns: minmax(0, 1fr); --reader-content: 1; --reader-gap: 0; padding-top: 1rem; }
  h1 { font-size: 2.25rem; }
  .preview-header { padding-top: 2rem; }
  main > section { padding-block: 2rem; }
  .chapter-heading { row-gap: .5rem; }
  .chapter-number { padding: 0; }
  .chapter-heading h2, .source-section > h2 { font-size: 1.5rem; }
  figcaption { row-gap: .5rem; }
  .figure-number { padding: 0; }
}
@page { margin: 18mm; }
@media print {
  :focus-visible { outline: none !important; }
  html { background: white; color: black; }
  body { max-width: none; padding: 0; font-size: 11pt; line-height: 1.5; }
  .preview-skip, .preview-tools, .preview-contents { display: none; }
  .preview-header, .preview-heading, main > section, .chapter-heading, figure, figcaption { display: block; }
  .preview-header { padding: 0 0 1em; }
  h1 { font-size: 25pt; }
  main > section { padding-block: 1em; }
  main p + p, main > section > :not(:first-child) { margin-top: .65em; }
  .preview-table { overflow: visible; }
  .preview-table table:has(th:nth-child(5)) th { min-width: 0; }
  .preview-table th, .preview-table td { padding: .4em .25em; }
  .chapter-heading, figure, tr { break-inside: avoid; }
  .chapter-heading, h2, h3, h4, h5, h6 { break-after: avoid; }
  p { orphans: 3; widows: 3; }
  figure img { max-height: 55vh; object-fit: contain; object-position: left center; }
  figcaption { margin-top: .5em; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;
