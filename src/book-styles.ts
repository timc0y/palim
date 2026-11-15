// EPUB keeps ordinary block flow so the reading app can paginate and resize it.
export const BOOK_CSS = `
body { box-sizing: border-box; max-width: 40em; margin: 0 auto; padding: 0 .75em; font-family: serif; font-size: 1em; line-height: 1.5; overflow-wrap: break-word; }
h1, h2, h3 { line-height: 1.2; font-weight: bold; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.75em; margin: 0 0 .75em; }
h2 { font-size: 1.3em; margin: 2em 0 .75em; }
h3 { font-size: 1.1em; margin: 1.5em 0 .75em; }
p { margin: 0 0 1em; orphans: 3; widows: 3; }
a { text-decoration: underline; }
img { display: block; max-width: 100%; height: auto; margin: 0; }
.chapter-heading { margin: 1em 0 1.5em; padding-bottom: 1em; border-bottom: 1px solid; page-break-inside: avoid; break-inside: avoid; }
.chapter-number { font-family: sans-serif; font-size: .75em; margin: 0 0 .75em; }
.chapter-heading h1 { margin: 0; }
figure { max-width: 30em; margin: 2em 0; page-break-inside: avoid; break-inside: avoid; }
.figure-bars img { width: 100%; max-width: 24em; }
figcaption { font-size: .85em; line-height: 1.5; margin-top: .75em; }
.figure-number { font-family: sans-serif; font-weight: bold; margin-right: .5em; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85em; border: 1px solid; padding: 1em; margin: 1.5em 0; }
code { font-family: monospace; }
blockquote { margin: 1.5em 0; padding-left: 1em; border-left: 2px solid; }
blockquote p { margin: 0; }
table { border-collapse: collapse; table-layout: fixed; width: 100%; font-size: .85em; line-height: 1.5; margin: 1.5em 0; }
th, td { overflow-wrap: anywhere; padding: .75em .5em; border-bottom: 1px solid; text-align: left; vertical-align: top; }
th { font-weight: bold; }
ul, ol { margin: 0 0 1em; padding-left: 1.5em; }
li { margin-bottom: .5em; }
.title-page { margin: 2em 0; padding-top: 1em; border-top: 2px solid; }
.title-page h1 { font-size: 2.25em; line-height: 1.1; margin-bottom: .5em; }
.subtitle { font-size: 1.15em; line-height: 1.5; }
.author { margin: 1.5em 0; }
.source-note { font-size: .85em; }
`;

// Every preview section uses the same label column, gutter and reading column.
export const PREVIEW_CSS = `
@font-face { font-family: Manrope; src: url(/fonts/Manrope-Latin.woff2) format("woff2"); font-weight: 400 700; font-display: swap; }
@font-face { font-family: "IBM Plex Mono"; src: url(/fonts/IBMPlexMono-Latin-400.woff2) format("woff2"); font-weight: 400; font-display: swap; }
* { box-sizing: border-box; }
html { color-scheme: light; background: #f5f4ee; color: #242521; scroll-behavior: smooth; }
body {
  --reader-columns: 4.5rem minmax(0, 1fr);
  --reader-content: 2;
  --reader-gap: 2rem;
  --reader-rule: #cdd0c3;
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.5rem clamp(24px, 4vw, 48px) 4rem;
  font: 1.125rem/1.7 Manrope, Arial, sans-serif;
  overflow-wrap: break-word;
}
h1, h2, h3, h4, h5, h6, p, figure, blockquote, pre, ul, ol { margin: 0; }
h1, h2, h3, h4, h5, h6 { font-weight: 500; line-height: 1.25; letter-spacing: -.025em; }
h1 { font-size: 3rem; line-height: 1.1; letter-spacing: -.035em; overflow-wrap: anywhere; }
a { color: #263fa9; text-underline-offset: .2em; }
a:focus-visible, summary:focus-visible { outline: 2px solid #263fa9; outline-offset: 5px; }
::selection { background: #263fa9; color: #fff; }
strong { font-weight: 650; }
.preview-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--reader-rule); font: .8125rem/1.5 "IBM Plex Mono", ui-monospace, monospace; }
.preview-tools a { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; color: inherit; text-decoration: none; }
.preview-tools a:hover { color: #263fa9; text-decoration: underline; }
.reader-wordmark svg { width: 1.25rem; height: 1.25rem; }
.preview-header, .preview-contents, main > section, .chapter-heading, figure, figcaption { display: grid; grid-template-columns: var(--reader-columns); column-gap: var(--reader-gap); }
.preview-header { padding-block: 2.5rem 2rem; }
.preview-heading { grid-column: var(--reader-content); min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
.preview-meta, .chapter-number, .figure-number { font: .75rem/1.5 "IBM Plex Mono", ui-monospace, monospace; color: #555b4d; }
.preview-header .subtitle { font-size: 1.125rem; line-height: 1.6; color: #555b4d; }
.preview-contents { padding-block: .5rem; border-block: 1px solid var(--reader-rule); font-size: .875rem; }
.preview-contents details { grid-column: var(--reader-content); min-width: 0; }
.preview-contents summary { display: flex; align-items: center; gap: .75rem; min-height: 44px; list-style: none; cursor: pointer; }
.preview-contents summary::-webkit-details-marker { display: none; }
.preview-contents summary::marker { content: ""; }
.preview-contents summary::before { content: ""; width: .375rem; height: .375rem; border-right: 1px solid; border-bottom: 1px solid; transform: rotate(-45deg); }
.preview-contents details[open] summary::before { transform: rotate(45deg); }
.preview-contents ol { padding: .5rem 0 .5rem 1.5rem; }
.preview-contents a { display: inline-block; padding-block: .5rem; }
main > section { row-gap: 1rem; padding-block: 3rem; scroll-margin-top: 1.5rem; }
main > section + section { border-top: 1px solid var(--reader-rule); }
main > section > * { grid-column: var(--reader-content); min-width: 0; }
main > section > .chapter-heading { grid-column: 1 / -1; margin-bottom: .5rem; align-items: start; }
.chapter-number { padding-top: .5rem; }
.chapter-heading h2, .source-section > h2 { grid-column: var(--reader-content); font-size: 1.75rem; }
main h3 { font-size: 1.25rem; margin-top: 1rem; }
main h4, main h5, main h6 { font-size: 1rem; margin-top: 1rem; }
main > section > figure { grid-column: 1 / -1; row-gap: 1rem; margin-block: 1rem; }
figure img { grid-column: var(--reader-content); display: block; width: 100%; max-width: 30rem; height: auto; margin: 0; }
.figure-bars img { width: 100%; max-width: 26rem; }
figcaption { grid-column: 1 / -1; font-size: .875rem; line-height: 1.6; color: #555b4d; }
.figure-number { padding-top: .125rem; color: #263fa9; }
.caption-text { grid-column: var(--reader-content); }
blockquote { margin-top: .5rem; border-left: 2px solid #263fa9; padding-left: 1.5rem; font-size: 1rem; line-height: 1.7; }
ul, ol { padding-left: 1.5rem; }
li + li { margin-top: .5rem; }
li > p + p { margin-top: .5rem; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .875rem; line-height: 1.6; border: 1px solid var(--reader-rule); padding: 1rem; background: #eeefe5; }
code { font-family: ui-monospace, monospace; }
table { border-collapse: collapse; table-layout: fixed; width: 100%; font-size: .875rem; line-height: 1.6; }
th, td { overflow-wrap: anywhere; padding: .75rem .5rem; border-bottom: 1px solid var(--reader-rule); text-align: left; vertical-align: top; }
th { font-weight: 500; color: #555b4d; }
td { font-variant-numeric: tabular-nums; }
.source-section ol { font-size: .875rem; line-height: 1.7; }
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
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;
