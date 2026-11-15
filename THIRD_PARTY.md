# Third-party code and fonts

## Interface

The landing's hardware shell and keys adapt [SPEC-01 by Shu Ding](https://github.com/shuding/spec-01)
under MIT. The licence ships at `public/spec-01-LICENSE.txt`.

The landing copy control uses `@ui-sdk/core` and `@ui-sdk/web` 0.1.0-beta.1 under
Apache-2.0. The browser bundle is built locally with esbuild and served without a CDN.
The licence ships at `public/ui-sdk-LICENSE.txt`; the package code is not modified.

## Rendering

Generated book artwork uses `@cf-wasm/resvg` 0.4.0 and `@resvg/resvg-wasm`
2.6.2 under MPL-2.0. Their source and license are available from
[cf-wasm](https://github.com/fineshopdesign/cf-wasm) and
[resvg-js](https://github.com/thx/resvg-js). The WebAssembly renderer is bundled
without source modifications. The compatibility package also installs resvg-wasm
2.4.1; that legacy entrypoint is not included in Palim's Worker bundle.

## Fonts

Two families ship with the interface, both under the SIL Open Font License. Their copyright and
licence texts are kept next to the files.

- **Manrope** — the reading and embedded artwork face. The woff2 files are in
  `public/fonts/` (`Manrope-Latin.woff2`, `Manrope-Extended.woff2`) with the licence at
  `public/fonts/Manrope-OFL.txt`. `src/reading-font.ts` embeds Manrope Regular at weight 400 from the
  [Google Fonts Manrope source](https://github.com/google/fonts/tree/main/ofl/manrope) for
  generated artwork. EPUB text remains XHTML and does not embed it. The standalone local
  HTML preview embeds its reading fonts and includes their full licence notices.
- **IBM Plex Mono** — the landing and studio face: wordmarks, controls, labels and metadata. The
  woff2 files are in `public/fonts/` (`IBMPlexMono-Latin-400.woff2`, `IBMPlexMono-Latin-500.woff2`) with the licence at
  `public/fonts/IBMPlexMono-OFL.txt`, from the [IBM Plex source](https://github.com/IBM/plex).
