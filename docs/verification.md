# Verification record

What has actually been checked, and what remains unverified.

## Latest deployment

On 15 November 2026 at 15:57 UTC, source commit
`6d0874a8d9ae505f250059799112678e5018e379` was deployed to Worker `palim`
in the `tims` account. Version `e04e7b15-1989-400b-b63c-9cfd8d3f53b0`
serves 100% of traffic through the existing Pages front door at
https://palim-timc0y.pages.dev. The version carries the tag `6d0874a`.
The previous version was `3c7d765c-4c32-41d0-9dc4-f40be2c10e31`.
No Pages redeployment, migration, secret, sending-domain or unrelated resource
change was performed.

Public GET checks matched all 26 public assets byte for byte against this
release, including the landing, studio, fonts, licence files, updated sample,
reader stylesheet and plugin ZIP. `/` and `/app` matched their source HTML.
HTML retained strict `script-src 'self'` and `style-src 'self'` policies.
Unauthenticated `/api/account` and `/mcp` returned `401`; the advertised
protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`
identified the canonical Pages origin. The served sample EPUB SHA-256 is
`173fade4c9cab0286aa7da6532a0f730592c76ed56c99fe3bf7a380fa14c1d7e`.

These public checks did not sign in, call an authenticated hosted MCP tool,
send provider mail, import into Amazon or use a physical Kindle. Source-file
parity is not an authenticated live journey.

## Release checks

- Deployment preflight, strict TypeScript and all 98 behavioural tests passed.
- Formatting and `git diff --check` passed before deployment.
- The deployment rebuilt the landing module, sample EPUB/preview, reader CSS,
  plugin ZIP and Worker from the checked source.
- [CI for the deployed source](https://github.com/timc0y/palim/actions/runs/43731423353)
  passed the production dependency audit, independent EPUBCheck with no errors
  or warnings, and both Worker and Pages Chromium journeys.
- Native local proofs use disposable D1, private R2, Better Auth, OAuth PKCE,
  MCP and captured synthetic mail. They establish local behaviour separately
  from the hosted public checks above.

The proof commands validate arguments before creating fixtures or starting
processes. In isolated directories without dependencies or configuration,
`--help` exited successfully and unknown flags exited with status 2, creating
no files. Conflicting runtime-only modes were rejected. The network proof creates
its local working directory when needed; its public-network checks remain
separate from deployment and authenticated client acceptance.

A subsequent source-only cleanup separated chapter rendering from EPUB assembly
inside `src/book.ts` and made the page markup readable in sections. Six fixed-clock
publication cases retained identical EPUB/preview hashes, source, filenames, word
counts and warnings; two invalid-figure cases retained the same refusal messages.
All 26 public assets and the local HTML/JSON outputs remained byte-identical after
rebuilding. The cleanup adds no file or dependency and has not been deployed.

## Interface checks

### Sample and MCP improvements

The current source gives generated books a paper cover, bounded metadata layout,
selectable title page, numbered chapter openings and stable figure numbers.
EPUB text remains reflowable, reader-sized and themeable; original uploads bypass
these styles. The browser preview uses one shared label/reading grid, with the
cover retained in the EPUB rather than repeated beside the browser title.
The sample is a 510-word field guide: choose movement, exchange a stop, then
compare three frames. Its light-ratio chart precedes the aperture illustration,
with essential values in reflowable prose. The illustration is rebuilt from its
SVG source through the maintained rasterizer. Chart width is bounded on wide
pages. The local HTML edition embeds CSS, fonts and licence notices and opens
without a server or network.

Source renders checked the sample and actual packaged XHTML at phone/desktop
widths and 200% text at 320px. Tests exercise maximum-length cover metadata,
chapter structure, figure numbering and original-image byte identity. These are
browser-source checks; physical Kindle appearance is not established.
Consecutive figure references now retain semantic figures and captions; prose
or heading references produce a corrective placement error.

The reading-grid refinement checked 320px/390px phones, 728px and 1100px widths,
open contents, 200% text at 320px, and actual packaged EPUB chapters. Headings,
prose, figure images and caption text share the same measured left edge; the
phone layout stacks the label column and keeps 24px gutters. A source fixture
without a sources section retained 18px instruction text, while long metadata,
captions, table cells and code wrapped without horizontal overflow. EPUB uses
ordinary block flow with a relative 40em maximum measure; it does not depend on
the browser's CSS grid. The Chromium acceptance script checks reading-edge
alignment and targets chart/image figures by kind.

The full local suite passed 98 tests, including the public-font response
checks. Native Worker and Pages proofs exercised seven-tool discovery and matching
structured/text results through OAuth and MCP. The browser proof also checks
that both reading and mono fonts load inside the private preview's sandbox.
Public WOFF2 assets allow anonymous font loading; other asset responses do not
gain that permission.

MCP object results now include structured content with matching JSON text.
The guide includes a minimal manuscript example and separates creating,
forwarding, recipient selection and receipt checks. `list_destinations` requires
sending permission and an active account and returns only owned labels/IDs,
default and Settings URL. Scope, tenant isolation, disabled accounts, stale
defaults, omitted email fields and no-mail discovery are exercised through the
official SDK client. The consent explanation identifies label discovery.

`get_artifact` refreshes links for an owned, unexpired file under `books:read`.
SDK checks let an issued link expire, recover the same stored bytes/hash/ID,
and confirm the original file expiry and operation counters remain unchanged.
They also check scope, tenant, disabled-account and expired-artifact refusals,
and cap the final links at the file's remaining lifetime. Native Worker and
Pages proofs download the same EPUB after MCP link refresh. No recovery sends
mail or recreates the book.

These changes are included in the deployment recorded above; the hosted checks cover public responses, while authenticated client and device evidence remain separate.

### Landing and studio

The landing uses the MIT SPEC-01 hardware treatment and Apache-2.0 UI SDK
0.1.0-beta.1. Its bundle, fonts and licences are self-hosted. Native connect
content remains available without JavaScript; the enhanced copy control appears
after loading. The SDK uses constructed stylesheets under the existing CSP.

Self-contained source renders covered 320px and 390px phones, tablet and desktop
widths up to 1280px, and doubled text at 320px. Closed landing layouts also fit
320 × 568, 568 × 320 and 640 × 360. The open, enlarged and no-JavaScript landing
states were checked separately. Simulated clipboard allowance/refusal exercised
exact command copying, pending locks, announcements and manual-copy recovery;
closing connect during a pending refusal preserved its closed state.

Studio source renders covered creation, unchanged-file upload, results, Settings,
sign-in, receipts, both dialogs, pending operations and errors. The final spacing
pass used the actual styles and fonts at 320px, 390px, 760px and 1280px, including
200% text at 320px; geometry checks found no horizontal overflow. Narrow file
cards stack Download above the icon actions; Settings stacks Copy beside or below
its address according to available space. See [Design](../DESIGN.md) for owners.

Standalone checks of the actual handlers with synthetic responses exercised:

- Title selection and rebuilding, retained drafts and unchanged original PDFs.
- Status tags, download/preview links, exact expiry and footer information.
- Dialog dismissal, missing destinations, and Save-and-return reopening the
  same file's share options without sending.
- Saved-recipient selection across files, explicit sending, pending locks,
  unknown receipts, API errors and recovery.
- File deletion, session expiry and clearing private dialog contents.

Earlier source checks also covered file-drop validation and recovery, all receipt
outcomes, image clipboard recovery, pending-save navigation, form locks and
loading states. The final handler proof passed after the spacing changes.
These checks did not take control of the user's browser. Physical keyboard,
clipboard and assistive-technology behaviour remain separate checks.

## CI and runtime coverage

The [Checks workflow](../.github/workflows/checks.yml) runs formatting, TypeScript,
behavioural tests, a dry-run bundle, production dependency audit and independent
EPUBCheck validation using a checksum-pinned distribution. Its Worker and Pages
proofs also enable the Chromium branch of the runtime script. That branch was
not rerun locally during this release.

The native proofs check identity and tenant isolation, logout revocation,
discovery, consent, PKCE, MCP creation, download hashes, deletion and refusal
without a destination. They verify the plugin ZIP/checksum through real response
headers. The Pages proof checks the actual service binding, canonical OAuth
origin, cookies, bearer tokens, bodies, private downloads and wrong-origin
refusal. Optional Chromium checks cover focus contrast, sample/CSP behaviour,
packaged EPUB XHTML reflow, studio journeys and enlarged layouts. A Chromium
preview is not an EPUB-reader engine.

## Remaining limits

This release does not establish a fresh external-client connection, hosted
sign-in, provider acceptance or delivery, Amazon conversion/import, Kindle
library appearance, or physical-device readability. Local mail is captured;
no provider email is sent by these proofs. Palim reports submission evidence
and never infers device receipt from it.

## Reproduce

```sh
npm ci
npm run check
npm run format:check
npm run build
npm audit --omit=dev --audit-level=high
python3 scripts/runtime-proof.py
python3 scripts/runtime-proof.py --pages
```

Add `--browser` to either runtime command for its isolated Chromium checks.
Runtime proofs use disposable local identities and storage and captured mail;
they do not contact Amazon or submit provider email.

Use `python3 scripts/runtime-proof.py --help` to list the modes. `--origin-only`
and `--saved-addresses-only` select separate browser checks and cannot be combined.
Unknown flags are errors rather than a request to run the default proof.

The optional `python3 scripts/file-network-proof.py` checks workerd's public-only
outbound policy against a local private-network witness. Its positive check needs
`public/sample.epub` from a build matching the hosted sample at the canonical
Pages address. It performs public GETs but creates no identity, OAuth, storage or
email bindings.
