# Third-party code and fonts

## Rendering

Generated book artwork uses `@cf-wasm/resvg` 0.4.0 and `@resvg/resvg-wasm`
2.6.2 under MPL-2.0. Their source and license are available from
[cf-wasm](https://github.com/fineshopdesign/cf-wasm) and
[resvg-js](https://github.com/thx/resvg-js). The WebAssembly renderer is bundled
without source modifications. The compatibility package also installs resvg-wasm
2.4.1; that legacy entrypoint is not included in Palim's Worker bundle.

## Interface hardware treatment

`public/hardware.css` adapts the tactile machine shell and key treatment from
[SPEC-01](https://github.com/shuding/spec-01) by Shu Ding, under MIT. The licence
text is served at `public/spec-01-LICENSE.txt`. Palim's implementation uses its own
grayscale tokens, layout, typography, and e-ink surfaces.

## Fonts

Two families ship with the interface, both under the SIL Open Font License. Their copyright and
licence texts are kept next to the files.

- **Manrope** — the reading and embedded artwork face. The woff2 files are in
  `public/fonts/` (`Manrope-Latin.woff2`, `Manrope-Extended.woff2`) with the licence at
  `public/fonts/Manrope-OFL.txt`. `src/reading-fonts.ts` embeds Manrope static instances at weights 400, 600 and 800 from the
  [Google Fonts Manrope source](https://github.com/google/fonts/tree/main/ofl/manrope) for
  generated artwork. EPUB text remains XHTML and does not embed it. The standalone local
  HTML preview embeds its Manrope reading font and includes its full licence notice.
- **IBM Plex Mono** — the interface face for commands, code, hashes, machine addresses, file metadata, manuscript editing and measurement. The
  woff2 files are in `public/fonts/` (`IBMPlexMono-Latin-400.woff2`, `IBMPlexMono-Latin-500.woff2`) with the licence at
  `public/fonts/IBMPlexMono-OFL.txt`, from the [IBM Plex source](https://github.com/IBM/plex).
