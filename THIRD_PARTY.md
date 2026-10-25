# Rendering dependencies

Generated book artwork uses `@cf-wasm/resvg` 0.4.0 and `@resvg/resvg-wasm`
2.6.2 under MPL-2.0. Their source and license are available from
[cf-wasm](https://github.com/fineshopdesign/cf-wasm) and
[resvg-js](https://github.com/thx/resvg-js). The WebAssembly renderer is bundled
without source modifications. The compatibility package also installs resvg-wasm
2.4.1; that legacy entrypoint is not included in Palim's Worker bundle.

`src/reading-font.ts` embeds Manrope Regular, instantiated at weight 400 from the
[Google Fonts Manrope source](https://github.com/google/fonts/tree/main/ofl/manrope),
under the SIL Open Font License. Its copyright and license are preserved in
`public/fonts/Manrope-OFL.txt`. This font is used only for generated artwork;
book text remains XHTML and does not embed or require it.
