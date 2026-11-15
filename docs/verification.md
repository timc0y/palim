# Verification record

What has actually been checked, and what remains unverified.

## Latest deployment

On 15 November 2026, source commit `4e2c6dd717e975949c626a34f9b346b26d5f7399`
was deployed to Worker `palim` in the `tims` account. Version
`3c7d765c-4c32-41d0-9dc4-f40be2c10e31` serves the existing Pages front door at
https://palim-timc0y.pages.dev. The previous version was
`d17d77e9-63ca-4fea-ab5d-060ddc835690`, deployed on 14 November. No Pages
redeployment, migration, secret, sending-domain or unrelated resource change
was performed.

Public GET checks matched all 26 public assets byte for byte against this
release, including the landing, studio, fonts, licence files, sample and plugin
ZIP. `/` and `/app` matched their source HTML. HTML retained strict
`script-src 'self'` and `style-src 'self'` policies. Unauthenticated `/api/account`
and `/mcp` returned `401`; the advertised protected-resource metadata at
`/.well-known/oauth-protected-resource/mcp` identified the canonical Pages origin.

These public checks did not sign in, send mail, import into Amazon or use a
physical Kindle. Source-file parity is not an authenticated live journey.

## Release checks

- `npm run check`: strict TypeScript and all 89 behavioural tests passed.
- `npm run format:check` and `git diff --check` passed.
- `npm run build`: the Worker, self-hosted landing module, sample EPUB/preview
  and complete plugin ZIP built successfully without deployment.
- `npm audit --omit=dev --audit-level=high`: no vulnerabilities reported after
  updating the SDK's compatible transitive Hono packages to patched versions.
- Native local Worker and Pages runtime proofs passed, using disposable D1,
  private R2, Better Auth, OAuth PKCE, MCP and captured synthetic mail.

The source cleanup removed an unused manuscript parser and consolidated the
identical user/default-destination query. Public documentation now describes the
current code and visual owners. Local agent instructions remain outside the
published tree. Tests, migrations, operational scripts, licences and product
contracts are retained.

A subsequent source-only cleanup separated book styles from EPUB packaging and
enabled unused-code and browser-JavaScript syntax checks in `npm run check`.
All 89 tests passed. Rebuilding the example preserved the EPUB, preview HTML,
reader CSS and manuscript JSON byte for byte. This cleanup is not a new deployed
version; the live deployment above remains the release record.

Both proof commands also validate arguments before creating fixtures or starting
processes. In isolated directories without dependencies or configuration, `--help`
exited successfully and unknown flags exited with status 2, creating no files.
Conflicting runtime-only modes were also rejected. The network proof now creates
its local working directory when needed. Native runtime and public-network
proofs passed after the argument-parsing change.

## Interface checks

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
