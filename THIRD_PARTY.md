# Rendering dependencies

Generated book artwork uses `@cf-wasm/resvg` 0.4.0 and `@resvg/resvg-wasm`
2.6.2 under MPL-2.0. Their source and license are available from
[cf-wasm](https://github.com/fineshopdesign/cf-wasm) and
[resvg-js](https://github.com/thx/resvg-js). The WebAssembly renderer is bundled
without source modifications. The compatibility package also installs resvg-wasm
2.4.1; that legacy entrypoint is not included in Palim's Worker bundle.

## Fonts

Two families ship with the interface, both under the SIL Open Font License. Their copyright and
licence texts are kept next to the files.

- **Manrope** — the interface face and the embedded artwork face. The woff2 files are in
  `public/fonts/` (`Manrope-Latin.woff2`, `Manrope-Extended.woff2`) with the licence at
  `public/fonts/Manrope-OFL.txt`. `src/reading-font.ts` embeds Manrope Regular at weight 400 from the
  [Google Fonts Manrope source](https://github.com/google/fonts/tree/main/ofl/manrope) for
  generated artwork. Book text remains XHTML and does not embed it.
- **IBM Plex Mono** — the technical voice: wordmarks, labels, metadata, hashes and receipts. The
  woff2 files are in `public/fonts/` (`IBMPlexMono-Latin-400.woff2`, `IBMPlexMono-Latin-500.woff2`) with the licence at
  `public/fonts/IBMPlexMono-OFL.txt`, from the [IBM Plex source](https://github.com/IBM/plex).
