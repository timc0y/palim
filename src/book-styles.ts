// Reader-sized type and inherited colours keep the EPUB reflowable and themeable.
export const BOOK_CSS = `
body { font-family: serif; font-size: 1em; line-height: 1.6; margin: 0 4%; overflow-wrap: break-word; }
h1, h2, h3 { line-height: 1.2; font-weight: bold; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 2em; margin: 0 0 .7em; }
h2 { font-size: 1.35em; margin: 1.8em 0 .65em; }
h3 { font-size: 1.1em; margin: 1.5em 0 .6em; }
p { margin: 0 0 .9em; orphans: 3; widows: 3; }
a { text-decoration: underline; }
img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.chapter-heading { margin: 1.5em 0 1.6em; padding-bottom: .8em; border-bottom: 1px solid; page-break-inside: avoid; break-inside: avoid; }
.chapter-number { font-family: sans-serif; font-size: .75em; letter-spacing: .1em; margin: 0 0 .8em; }
.chapter-heading h1 { margin-bottom: 0; }
.chapter-heading + p { font-size: 1.08em; }
figure { margin: 1.8em 0; page-break-inside: avoid; break-inside: avoid; }
figcaption { font-size: .85em; line-height: 1.5; margin-top: .9em; }
.figure-number { display: block; font-family: sans-serif; font-weight: bold; margin-bottom: .3em; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85em; border: 1px solid; padding: 1em; }
code { font-family: monospace; }
blockquote { margin: 1.5em 0; padding: 0 0 0 1em; border-left: 2px solid; }
blockquote p { margin: 0; }
table { border-collapse: collapse; table-layout: fixed; width: 100%; font-size: .85em; line-height: 1.5; margin: 1.5em 0; }
th, td { overflow-wrap: anywhere; padding: .7em .4em; border-bottom: 1px solid; text-align: left; vertical-align: top; }
th { font-weight: bold; }
ul, ol { padding-left: 1.4em; }
li { margin-bottom: .65em; }
.title-page { margin: 2em 0; padding-top: 1em; border-top: 3px solid; }
.title-page h1 { font-size: 2.5em; line-height: 1.1; margin-bottom: .5em; }
.subtitle { font-size: 1.2em; line-height: 1.4; }
.author { margin: 1.5em 0; }
.source-note { font-size: .8em; }
nav ol { line-height: 1.6; }
`;

export const PREVIEW_CSS = `${BOOK_CSS}
@font-face { font-family: Manrope; src: url(/fonts/Manrope-Latin.woff2) format("woff2"); font-weight: 400 700; font-display: swap; }
@font-face { font-family: "IBM Plex Mono"; src: url(/fonts/IBMPlexMono-Latin-400.woff2) format("woff2"); font-weight: 400; font-display: swap; }
* { box-sizing: border-box; }
html { color-scheme: light; background: #f5f4ee; color: #242521; scroll-behavior: smooth; }
body { max-width: 68rem; margin: 0 auto; padding: 2rem clamp(20px, 4vw, 48px) 4rem; font-family: Manrope, Arial, sans-serif; font-size: 1.125rem; line-height: 1.8; }
h1, h2, h3 { font-family: Manrope, Arial, sans-serif; font-weight: 500; letter-spacing: -.035em; }
a { color: #263fa9; text-underline-offset: .2em; }
a:focus-visible, summary:focus-visible { outline: 2px solid #263fa9; outline-offset: 5px; }
::selection { background: #263fa9; color: #fff; }
.preview-tools { display: flex; align-items: center; justify-content: space-between; gap: 1rem; font: .8125rem/1.5 "IBM Plex Mono", ui-monospace, monospace; }
.preview-tools a { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; color: inherit; text-decoration: none; }
.preview-tools a:hover { color: #263fa9; text-decoration: underline; }
.reader-wordmark svg { width: 1.25rem; height: 1.25rem; }
.preview-header { container: book-intro / inline-size; display: grid; grid-template-columns: minmax(0, 1fr) minmax(9rem, 13rem); gap: clamp(24px, 5vw, 72px); align-items: center; margin: 3rem 0 0; padding-bottom: 2.5rem; border-bottom: 1px solid #cdd0c3; }
.preview-header h1 { font-size: clamp(2.25rem, 5.5vw, 4.5rem); line-height: 1.04; letter-spacing: -.055em; margin: .7rem 0 1.25rem; overflow-wrap: anywhere; }
.preview-header .subtitle { max-width: 35ch; font-size: 1.125rem; color: #555b4d; line-height: 1.6; margin-bottom: 1.25rem; }
.preview-meta { color: #555b4d; font: .75rem/1.6 "IBM Plex Mono", ui-monospace, monospace; }
.preview-meta:last-child { margin-bottom: 0; }
.preview-cover { width: 100%; height: auto; box-shadow: 1px 2px 0 #c7c8bd, 5px 8px 16px #24252116; }
.preview-contents { max-width: 60ch; margin: 0 auto; padding: 1.25rem 0; font-size: .875rem; }
.preview-contents summary { display: flex; align-items: center; gap: .75rem; min-height: 44px; list-style: none; cursor: pointer; }
.preview-contents summary::-webkit-details-marker { display: none; }
.preview-contents summary::marker { content: ""; }
.preview-contents summary::before { content: ""; width: .4rem; height: .4rem; border-right: 1px solid; border-bottom: 1px solid; transform: rotate(-45deg); }
.preview-contents details[open] summary::before { transform: rotate(45deg); }
.preview-contents ol { margin: .5rem 0 0 1rem; }
.preview-contents a { display: inline-block; padding: .4rem 0; }
main { max-width: 60ch; margin: 0 auto; }
main > section { margin: 1.5rem 0 3rem; scroll-margin-top: 2rem; }
main > section + section { padding-top: 2rem; border-top: 1px solid #cdd0c3; }
.chapter-heading { border: 0; padding: 0; margin: 0 0 1.5rem; }
.chapter-number { font: .75rem/1.5 "IBM Plex Mono", ui-monospace, monospace; color: #555b4d; letter-spacing: 0; margin-bottom: .75rem; }
.chapter-heading h2, main > section > h2 { font-size: 1.8rem; line-height: 1.2; margin: 0; }
.chapter-heading + p { font-size: 1.08em; line-height: 1.75; }
main h3 { font-size: 1.2rem; line-height: 1.4; margin: 2rem 0 .75rem; }
main h4, main h5, main h6 { font-size: 1em; line-height: 1.4; margin: 1.5em 0 .6em; }
p { margin-bottom: 1.25em; }
strong { font-weight: 650; }
figure { margin: 2.5rem 0; }
figure img { width: auto; max-width: 100%; height: auto; background: #fff; }
figcaption { color: #555b4d; font-size: .875rem; line-height: 1.7; margin-top: 1rem; }
.figure-number { display: block; font: .75rem/1.5 "IBM Plex Mono", ui-monospace, monospace; color: #263fa9; margin-bottom: .4rem; }
blockquote { margin: 2rem 0; border-color: #263fa9; padding-left: 1.25rem; }
table { font-size: .875rem; margin: 2rem 0; }
th, td, pre { border-color: #cdd0c3; }
th { color: #555b4d; font-weight: 500; }
td { font-variant-numeric: tabular-nums; }
pre { padding: 1rem; background: #eeefe5; }
main > section:last-child ol { padding-left: 1.25rem; }
main > section:last-child li { font-size: .875rem; }
main > section:last-child a { overflow-wrap: anywhere; }
@container book-intro (max-width: 20rem) {
  .preview-heading { grid-column: 1 / -1; }
  .preview-cover { display: none; }
}
@media (max-width: 600px) {
  body { padding-top: 1rem; }
  .preview-header { grid-template-columns: minmax(0, 1fr) 88px; gap: 1rem; margin-top: 1.5rem; padding-bottom: 1.75rem; }
  .preview-header h1 { font-size: 2.25rem; }
  .preview-header .subtitle { font-size: 1rem; }
  .preview-contents { padding-block: .75rem; }
  .chapter-heading h2, main > section > h2 { font-size: 1.5rem; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;
