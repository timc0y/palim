# Verification record

What has actually been checked, and what remains unverified.

## Latest deployment

On 25 November 2026 at 19:54 UTC, source commit
`bc437765f6042efc897cc3bea377bea2b8663978` (`bc43776`) was deployed to
https://palim.pages.dev (no new D1 migrations; remote D1 `palim`
`7328bb73-47d8-415c-9c21-7efe595961e8` remains at `0008-mcp-token.sql`). Worker
`palim` in account `04d3e478b1ddf0f5147120cacbf430de` was deployed as version
`1b079c8c-a984-40f0-b968-c19518f73b14` (previous version
`584142ec-4096-4611-a91b-05a400d61bab`), and Cloudflare Pages project `palim`
was deployed to production deployment `1a66ef4a-0af4-437e-8dbe-5237f854fb56`
(`https://1a66ef4a.palim.pages.dev`, previous
`20b3ac49-09b7-413a-a201-c92bbd96a9fd`) at https://palim.pages.dev. No secrets,
sending domains (`reading@palim.timc0y.com`), or unrelated Cloudflare
infrastructure were altered.

Public GET checks against `https://palim.pages.dev` matched all 34 served
public routes (`/`, `/app`, `/privacy`, and all 31 non-HTML files under
`public/`, including the night-crossing artwork `icons/cloud.svg`,
`icons/tide.svg`, and `icons/boat.svg`, updated `og.png`, client scripts,
stylesheets, self-hosted fonts, licence files, `mark.svg`, `robots.txt`,
`palim-plugin.zip`, and `palim-plugin.sha256`) byte for byte against commit
`bc43776`, while `/index.html`, `/app.html`, and `/privacy.html` returned HTTP
`307` canonical clean-URL redirects. `/`, `/app`, and `/privacy` returned strict
`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
CSP headers. Unauthenticated `GET /api/account` (`SIGN_IN_REQUIRED`) and
`GET /mcp` returned `401`; an invalid Personal MCP bearer on `POST /mcp`
returned `401` (`UNAUTHORISED`); `/.well-known/oauth-protected-resource/mcp`
returned `200` advertising `https://palim.pages.dev/mcp` and
`https://palim.pages.dev`; and retired sample routes (`/sample.epub`,
`/sample.html`, `/example.json`) returned `404`. The served `palim-plugin.zip`
is `2,402` bytes with SHA-256
`4358c29a3d5a32cbac82a514c60ae69cff3470b0901f4c62e2b72a35cda455ed`.

Local checks on `bc43776` passed before deployment: Prettier `format:check`,
`tsc --noEmit`, JS syntax checks, `npm audit --omit=dev --audit-level=high` (`0`
vulnerabilities), `npm run build`, `npm run example` (`artifacts/palim-sample.epub`,
`126,521` bytes, SHA-256
`d55b27ac3d0fc8ee59135c1ce3504cba914014a9c0239cde01769e63b56cf0b9`), all 108 unit
and behavioural tests (including the six minimal monochrome visual primitives
`plot`, `graph`, `trace`, `anatomy`, `equation`, and `table`, `wide: true` 90°
rotated plates, native EPUB3 `noteref`/`footnote` markup, and the `nav.xhtml`
`loi` Artifacts index), and both
`uv run --with playwright python scripts/runtime-proof.py --browser` and
`--pages --browser` (home focus contrast `15.89:1`, workspace focus contrast
`14.49:1`, placeholder contrast `14.24:1`, zero horizontal overflow from `320px`
to `1440px` and at `200%` text zoom). Visual inspection of `resvg`-rasterized
PNGs verified the minimal cover and all six visual primitives. Local EPUBCheck
was not run on this machine because no Java runtime is installed; CI runs
EPUBCheck 5.4.0 `--failonwarnings` on push.

These checks did not sign in on production, exercise a live OAuth grant or
Personal MCP token against production, send provider mail, test the 25 MiB
email limit with Cloudflare, import into Amazon, or inspect a physical Kindle.
Local checks and live public GET parity are not an authenticated live journey.

### Previous deployment (`03ad65e`, 25 November 2026)

On 25 November 2026 at 08:38 UTC, source commit
`03ad65edfe90495f080ff3c5da206ef35bbe3226` (comprising `66af68f` and `03ad65e`)
was deployed to https://palim.pages.dev (Worker
`584142ec-4096-4611-a91b-05a400d61bab`, Pages
`20b3ac49-09b7-413a-a201-c92bbd96a9fd`).

### Previous deployment (`3fbd723`, 24 November 2026)

On 24 November 2026 at 16:59 UTC, source commit
`3fbd72360c14f36e81393fe7d88a2a49cd016a81` switched the canonical Cloudflare
Pages front door from `https://palim-timc0y.pages.dev` to
https://palim.pages.dev (Worker `ae2ab2a1-7022-464b-805c-20e2d0dce47a`, Pages
`b03b094f-39b1-4c64-9a12-0ac0dc0cd119`). Legacy project `palim-timc0y` remains
intact temporarily and refuses requests with HTTP `400` (`ORIGIN`) so old
bookmarks cannot create split OAuth metadata.

## Release checks

- Deployment preflight, Prettier `format:check`, `tsc --noEmit`, JS syntax
  checks, `npm audit --omit=dev --audit-level=high` (`0` vulnerabilities),
  `git diff --check`, and all 107 behavioural tests passed on `03ad65e`.
- The deployment rebuilt `public/og.png`, `public/palim-plugin.zip`, and the
  Worker bundle from checked source commit `03ad65e`.
- `uv run --with playwright python scripts/runtime-proof.py --pages --browser`
  passed locally on `03ad65e` (focus contrast `14.49:1`, placeholder contrast
  `14.24:1`, expired-link CTA contrast `>= 4.5`, zero horizontal overflow at
  `320px` + `200%` text zoom, and copy-button width stability).
- Native local proofs use disposable D1, private R2, Better Auth, OAuth PKCE,
  MCP and captured synthetic mail. They establish local behaviour separately
  from the hosted public checks above.

The proof commands validate arguments before creating fixtures or starting
processes. In isolated directories without dependencies or configuration,
`--help` exited successfully and unknown flags exited with status 2, creating
no files. Conflicting runtime-only modes were rejected. The network proof creates
its local working directory when needed; its public-network checks remain
separate from deployment and authenticated client acceptance.

The publisher cleanup separates chapter rendering from EPUB assembly
inside `src/book.ts` and presents the page markup in readable sections. Six fixed-clock
publication cases retained identical EPUB/preview hashes, source, filenames, word
counts and warnings; two invalid-figure cases retained the same refusal messages.
All 26 public assets and the local HTML/JSON outputs remained byte-identical after
rebuilding that publisher change. The cleanup adds no file or dependency and is
included in this deployment.

The studio cleanup similarly separates account refresh, saved-address rendering
and signed-out cleanup within `public/app.js`. Before/after handler runs produced
identical DOM, input and focus-state fingerprints at six create/upload/share and
expiry checkpoints. Separate synthetic checks covered five-address capacity,
default changes without replacing a valid selection, removal fallback, account
fetch errors and retaining an unfinished draft after session expiry. These are
source checks with mocked responses, not hosted account or mail evidence. This
cleanup is included in this deployment.

## Retro-visual, truthfulness, and UI-system pass (deployed 25 November 2026, `03ad65e`)

Home opens on a grayscale desktop inside a graphite bezel. The publishing
window sits above Home and Shelf. Menu contains
settings, agent connection, source and privacy links. Studio exposes its
task switcher and Privacy link from its header menu.

Studio uses the same physical shell, dark bezel, pale screen, and scanlines, but its screen is a
viewport-fixed operational workspace rather than a long document. The machine remains within the
viewport while sign-in, Create, Upload, result, receipt, shelf, Settings, and dialog content
scroll inside the screen. The editor sits on the paper surface. Results,
receipts, Shelf and Settings use separate panels. The Send and File info actions
open native dialogs.

Studio typography now has explicit roles rather than decorative monospace everywhere: IBM Plex
Serif carries screen titles, artifact names, receipt headings, dialog headings and the file-picker
prompt; IBM Plex Sans carries operational copy, labels, controls, forms, Settings and state
messages; IBM Plex Mono is reserved for machine chrome, hashes, addresses, metadata and manuscript
editing; Manrope remains the reading/preview face. Result actions group together instead of spreading across the card; reader/application
rows use explicit action clusters; shelf actions form a deliberate full-width grid on narrow
screens; first-use sending explains the Kindle-address and Amazon-sender prerequisites inside the
Send dialog.

The system is now neutral/grayscale rather than blue-led. `--accent` is ink; the compact mark and
plugin asset use a grayscale ink tile; browser `theme-color` values match the outer warm grey.
Delivery/account states remain distinguishable through neutral tones plus explicit text labels
and are never encoded by colour alone. Generated covers remain typographic paper covers inside a
thin editorial frame: stepped Palim device, optically centred title, subtitle, short ink stopped
rule, creator, and bottom rule. The OG image reuses the real generated cover. Generated EPUB body
text inherits the reading application's font and colours. Browser and standalone previews load
Manrope only and use pale e-ink paper with neutral figure labels and rules.

The reduction/correction work in the same unreleased tree remains in force: the
`@ui-sdk/core`/`@ui-sdk/web` dependency and separate bundled `public/landing.js` build are removed;
`public/kindle.js` is served directly; Studio uses a direct text `settings` link rather than a cog
disclosure; result filenames/titles are plain read-only text rather than disabled inputs; and the
small Palim mark is reserved for favicon/app-tile/plugin use rather than repeated inline branding.

Review-driven corrections now included in the same unreleased tree:

- Short-book browser previews open the contents list by default (six chapters or fewer); longer
  books keep the disclosure collapsed. EPUB table layout is automatic rather than fixed so
  reading systems can size narrow numeric columns.
- The initial Studio account-read failure is visible outside the hidden sign-in/desk panels and
  has a working Retry action. Signed-in refresh failures still report beside the visible desk.
- First-send setup now labels the no-address action `Set up first send`, shows the Kindle-address
  and Amazon personal-sender prerequisites in the first-use Send dialog and return banner, and
  repeats that prerequisite in the Send dialog after the first address is saved. This is guidance
  only; Palim still cannot verify Amazon approval.
- The plugin ZIP derives its MCP endpoint, website URL and privacy URL from the Worker `ORIGIN`
  in `wrangler.jsonc`; `npm run plugin -- <origin>` or a matching `PALIM_PLUGIN_ORIGIN` can build
  the same package without deployment, while deployment preflight rejects a mismatched
  `PALIM_PLUGIN_ORIGIN`. This addresses self-host package drift in source; no self-hosted remote
  deployment has been exercised.
- Cloudflare's currently documented Email Sending total message limit is 25 MiB including
  attachments/encoding, so `LIMITS.message` is now 25 MiB rather than the stale 5 MiB boundary.
  Studio file selection warns when an otherwise valid upload exceeds the server-reported
  conservative raw-file threshold (`19,132,731` bytes at the current reserve) and points the user
  to Amazon's web uploader without blocking a temporary private copy. This is documentation-derived
  local enforcement only; no live Cloudflare acceptance of a near-limit message has been tested.
- Public and Studio quota copy now says creation attempts where failed attempts consume the
  render allowance. Forwarding copy separates storing an original from the later Send action;
  preview copy no longer implies generated-preview URLs for uploaded originals. Send copy now says
  that agents are instructed to send only when asked, rather than claiming the service technically
  proves human intent.
- README local setup includes the local D1 migration command, and agent setup includes a concrete
  first no-send prompt. Local sign-in email capture remains a development-environment concern,
  not hosted evidence.

Local verification on this exact working tree:

- `npm run build` passed. It regenerated `artifacts/palim-sample.epub` and
  `public/sample.epub` at `131,896` bytes with SHA-256
  `69b5388992e0d91ecbf4f2d9e6859c90e004ee02afc5e9c75543cd42fa67f28f` (`510` words, `0`
  warnings), regenerated the browser preview/cover/diagram/OG assets, and produced
  `public/palim-plugin.zip` at `2,402` bytes with SHA-256
  `4358c29a3d5a32cbac82a514c60ae69cff3470b0901f4c62e2b72a35cda455ed`. Wrangler dry-run bundling
  completed with the expected KV, D1, R2, email, rate-limit, origin and sender bindings.
- `npm run format:check`, `npm run check` (`tsc --noEmit`, JavaScript syntax checks,
  **106/106** behavioural tests), `npm audit --omit=dev --audit-level=high` (`0` vulnerabilities),
  and `git diff --check` passed. After the final harder-separation CSS/copy pass, `npm run check`,
  the Chromium runtime proof and `git diff --check` were run again and passed.
- `uv run --with playwright python scripts/runtime-proof.py --browser` passed: plugin response
  headers plus endpoint/website/privacy inspection, Better Auth OTP with captured synthetic mail,
  OAuth consent/PKCE, seven-tool MCP discovery, creation/link refresh/download hash,
  missing-destination refusal, personal MCP token lifecycle, `/api` isolation, strict
  public/private CSP, packaged EPUB XHTML reflow in Chromium, visible startup failure plus Retry,
  direct settings navigation, native landing copy-to-clipboard behaviour, first-send setup and
  Amazon-sender reminder, open short-book contents, upload-time oversize email guidance, mobile
  create/upload journeys, shelf touch targets, grayscale receipt-state distinction, account
  isolation and logout revocation. The proof captured the Send-to-Kindle and File-details dialogs
  as `artifacts/share-dialog-mobile.png` and `artifacts/file-info-dialog-mobile.png`. The mobile
  workspace proof also asserted that shelf content
  overflowed the internal workspace height by more than `100px`, that the physical shell stayed
  within the `844px` viewport, and that the document itself did not become taller than the viewport;
  it captured the scrolled bottom state as `artifacts/workspace-scrolled-mobile.png`. Rendered primary
  and landing-header focus contrast both measured `10.78:1`; workspace focus contrast measured
  `10.78:1`; placeholder contrast measured `6.92:1`.
- `python3 scripts/runtime-proof.py --pages` passed against the real local Pages service binding,
  preserving the canonical OAuth origin, cookies, bearer tokens, request bodies, private downloads
  and wrong-origin refusal.

These are disposable local proofs only. They did not sign in to the hosted
service, submit provider email, prove the updated 25 MiB boundary with
Cloudflare, import into Amazon, or inspect a physical Kindle. Public route
parity for this deployed release (`03ad65e`) is recorded under
[Latest deployment](#latest-deployment) above.

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
pages. The local HTML edition embeds CSS, its Manrope reading font and licence notice
and opens without a server or network.

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
that Manrope loads inside the private preview's sandbox and IBM Plex Mono is not
loaded merely for metadata.
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

At the deployment recorded above, the landing used the MIT SPEC-01 hardware
treatment and Apache-2.0 UI SDK 0.1.0-beta.1. Its bundle, fonts and licences
were self-hosted. Native connect
content remained available without JavaScript; the enhanced copy control appeared
after loading. The SDK used constructed stylesheets under the existing CSP.
The current working-tree pass supersedes this implementation as described above.

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

A since-superseded settings-cog source change replaced the header's two text
links with one labelled native disclosure. Source checks covered 390px and 728px layouts and
200% text at 320px, with the menu fitting the viewport. Handler checks exercised
Settings navigation and heading focus, Escape and outside-click dismissal,
signed-out Privacy access and draft retention. The Chromium acceptance script
also checked keyboard opening and the actual Privacy-and-return journey. That
menu was included in the 24 November 2026 deployment (`5528c90`); the current
working tree replaces it with the direct text link verified above.

A further studio source change removed the manual Image upload and Copy ID list
from Settings, including their handlers and styles. Agent image import and the
illustrated example remain available. Local checks passed all 98 tests at that
step; source-handler checks exercised book creation and Settings navigation, and
the 390px Settings render fitted without horizontal overflow. Now included in the
24 November 2026 deployment (`5528c90`).

### Launch-readiness & design-system updates (deployed 24 November 2026, commit 5528c90)

Subsequent unreleased source updates cover three cohesive passes:

1. **Launch readiness & Personal MCP tokens:** Landing tagline, dual-client connect
   disclosure (`/mcp` URL and Codex commands), below-the-fold manual with generated
   sample cover (`public/images/sample-cover.png`) and `1200×630` Open Graph card
   (`public/og.png`), `public/robots.txt`, global Amazon store links, Studio `#`
   multi-chapter Markdown splitting, and Settings → Agent Personal MCP token
   lifecycle (`migrations/0008-mcp-token.sql`).
2. **Unified web + EPUB design system:** Consolidated CSS tokens and Manrope
   `@font-face` rules into `public/hardware.css` (deleting surface duplicates),
   resolved the dropzone border non-text contrast to `3.29:1` (`--control-line` on
   `--inset`), unified focus offsets (`4px`), status pills, label-style Studio
   panel headings, Privacy `h2` hierarchy, OAuth consent panel framing, shared
   `PALIM_PALETTE`/`PALIM_FONTS` across `PREVIEW_CSS`/`figures.ts`/`example.ts`,
   cover left-edge (`x="96"`) alignment, bare-ink `/sample.html` wordmark, and
   owner/invariant docs in `DESIGN.md`.
3. **Pre-launch review fixes:** Login email outage propagation returning `503`
   `LOGIN_EMAIL` (while keeping throttled resends `200`), OAuth consent account
   display with `Switch account` sign-out, 30-day refresh disclosure and clean
   standalone redirect chip, destination pre-validation before host file fetch in
   MCP `send_document`, Studio OAuth grant listing/revocation and self-service
   `DELETE /api/account`, full multi-chapter client validation (`240,000` chars /
   `24` chapters / `50,000` per chapter), always-visible full recipient email in
   the Share dialog, labeled `Send` trigger on cards/shelf, and local HTTPS
   development defaults (`https://localhost:8787`).

Local verification run on the final source state:

- `npm run example` rebuilt deterministic outputs (`artifacts/palim-sample.epub`,
  `142,171` bytes, `510` words, `0` warnings, `public/images/sample-cover.png`,
  `public/images/sample-exposure.png`, `public/og.png`, `public/reader.css`, and
  `public/sample.html`).
- `npm run format:check`, `npm run check` (`tsc --noEmit`, `node --check`, and
  **105/105** behavioural tests), `npm run build` (`public/landing.js`, example,
  `public/palim-plugin.zip`, and `wrangler deploy --dry-run`),
  `npm audit --omit=dev --audit-level=high` (`0` vulnerabilities), and
  `git diff --check` all passed.
- `python3 scripts/runtime-proof.py` and `python3 scripts/runtime-proof.py --pages`
  passed against local `workerd` and the Pages service binding (exercising Better
  Auth OTP, OAuth consent & PKCE, 7-tool MCP, link refresh, Personal MCP bearer
  token lifecycle & `/api/*` isolation, OAuth grant listing/revocation, and
  `DELETE /api/account`).
- Because system `python3` lacks `playwright`, `runtime-proof.py --browser` was
  not run directly; instead a local headless Google Chrome + Node Playwright
  harness verified `1440×1000`, `390×844`, and `200%` text zoom across `/`,
  `/sample.html`, `/privacy`, rendered `/authorize`, Studio views, and unpacked
  `public/sample.epub` (`title.xhtml` and chapters in default light and
  simulated dark reader themes) with `0` console/page errors, `0` horizontal
  overflow, `maxDelta: 0` preview reading-edge alignment, `22.29px` rendered bar
  chart labels, and three distinct `.receipt-state` colours. Monochrome legibility
  of the cover, bar chart, Mermaid flowchart, and exposure illustration was
  inspected via `ffmpeg` greyscale conversions.

With commit `5528c90` pushed, [CI run `45439960907`](https://github.com/timc0y/palim/actions/runs/45439960907)
green, remote migration `0008-mcp-token.sql` applied, Worker `palim` updated to
`dca2cc8b-2ec9-4f7a-ba9d-a6972c9b32d1`, Pages `palim-timc0y` updated to
`e633b099-4c99-422a-b5da-382fafd597f0`, and public GET parity/boundary checks
verified against `https://palim-timc0y.pages.dev`, hosted sign-in, live OAuth/Personal
MCP token usage, Cloudflare Email acceptance, Amazon conversion/import, and
physical Kindle display remain separate manual post-deploy checks.

## CI and runtime coverage

The [Checks workflow](../.github/workflows/checks.yml) runs formatting, TypeScript,
behavioural tests, a dry-run bundle, production dependency audit and independent
EPUBCheck validation using a checksum-pinned distribution. Its Worker and Pages
proofs also enable the Chromium `--browser` branch of the runtime script; both ran
and passed in [CI run `45443222064`](https://github.com/timc0y/palim/actions/runs/45443222064).

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

Add `--browser` to either runtime command for its isolated Chromium checks. If
the system Python does not have Playwright installed, use
`uv run --with playwright python scripts/runtime-proof.py --browser` (or the
equivalent `--pages --browser` form).
Runtime proofs use disposable local identities and storage and captured mail;
they do not contact Amazon or submit provider email.

Use `python3 scripts/runtime-proof.py --help` to list the modes. `--origin-only`
and `--saved-addresses-only` select separate browser checks and cannot be combined.
The saved-addresses check simulates an expired file at Send. In local Chromium,
Escape returns focus to a remaining Shelf file. Once the last file expires,
focus lands on Create a book and Enter opens the editor.
Unknown flags are errors rather than a request to run the default proof.

The optional `python3 scripts/file-network-proof.py` checks workerd's public-only
outbound policy against a local private-network witness. Its positive check verifies the W3C home icon against a pinned digest. It performs public GETs but creates no identity, OAuth, storage or
email bindings.

The local Chromium proof opens Create a book, Forward a file, Shelf and Settings
from Home with a signed-in test account. Each launcher must reveal the named
Studio view, and the Home link must return to the desktop. The proof exercises
browser Back and Forward between the create and Settings windows. The proof also
captures the Home screen at 390 and 1440 pixels wide.
The illustrated launchers also loaded in local Chromium at 320, 390 and 1440
pixels. The Home screen had no horizontal overflow at those widths.

The local browser proof checks that the Home task titles stack on a shared left edge
at seven widths from 320 to 1440 pixels. From 640 pixels, the tasks occupy the right
column beside the landscape. It also checks that the Studio heading aligns with the
first book field on mobile.

In local Chromium, disconnecting the final app from the Connected applications link
shows one confirmation. Opening that link with no apps shows the empty state.

The local browser proof renders read-only consent at 320 and 1440 pixels and
checks the permission list, a 512-byte upload label and draft badge contrast.
It captures the mobile consent and privacy screens alongside the local fixture reader,
settings, editor, result, dialogs and receipt.

The local removal check requires HTTP 404 for the old sample preview, EPUB,
JSON and two images. EPUB validation uses a local-only fixture.

Local Chromium checks cover workspace loading and retry, sign-in recovery, busy creation, whitespace-only titles and manuscripts, chapter count and length errors, invalid uploads, a dedicated Shelf, and returning from first-send setup. Address management checks focus after changing the default, removing one of several addresses and removing the last address. An expired private link returns a recovery page for browser navigation and a JSON error for API access. The browser follows the recovery link back to Shelf. Synthetic receipts exercise submitting, submitted, rejected and unknown outcomes. The browser check opens a sent book for editing, returns to its receipt, then creates a second edition and checks that its result has no old receipt or additional email.

Home was rendered in desktop WebKit with local assets at widths from 320 to 1024 pixels, including both sides of the 640-pixel layout change. The checks measured heading alignment and page width and exercised the agent menu and Escape dismissal. Physical iOS Safari remains unverified.

The locally generated illustrated EPUB passed checksum-pinned EPUBCheck 5.4.0 with zero errors or warnings after adding navigation landmarks. Its contents follow spine order, and its title page, first chapter and bibliography links resolve inside the archive. Reader menu presentation and physical Kindle behaviour remain unverified for this build.

The session-expiry browser check keeps a manuscript in memory while the author signs back in. It checks the blank sign-in state, restoration to the same account, and an empty editor after signing in as another account. Mail and rate-limit timing are simulated locally.

Studio language validation was exercised with the metadata section closed. A corrected regional language was checked in both the private preview and the downloaded EPUB package.

The local illustrated HTML preview was printed to A4 and US Letter PDF in Chromium. Both exports contained all chapter and source headings across three pages, with reader controls omitted. This checks PDF output, not a physical printer.

The saved-address browser check uploads a PDF with accented Latin and Japanese characters in its filename, downloads it from Shelf, and checks the browser filename and exact original bytes. Unicode attachment names at a live mail provider remain unverified.

The local Chromium Forward check uploads a 19 MiB synthetic PDF fixture and compares the downloaded file byte for byte with the original. It verifies that the upload result hides Send and that both the result and Shelf’s File details link to Amazon’s Send to Kindle. Amazon upload, import and device delivery remain unverified for this fixture.
