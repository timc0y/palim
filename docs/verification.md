# Verification record

What has actually been checked for the current release, and what has not.

## Latest deployment

On 14 November 2026, the local working tree based on `2efb3ee` was deployed to
Worker `palim` in the `tims` account. Version
`d17d77e9-63ca-4fea-ab5d-060ddc835690` serves 100% of traffic through the existing
Pages front door at https://palim-timc0y.pages.dev. No Pages redeployment or
D1 migration was performed. The preceding Worker version was
`1931bb4d-a604-4746-901e-e4f94900bc17`.

Public GET checks using a browser User-Agent matched all 24 public assets byte
for byte against the deployment snapshot, including the landing HTML, CSS,
SDK bundle, fonts, licences, studio, sample and plugin ZIP. The landing retained
its strict `script-src 'self'` and `style-src 'self'` policy. Unauthenticated
`/mcp` returned `401`; protected-resource metadata identified that same public
origin. The deployment command passed TypeScript and all 89 existing tests.

This release check did not use the user's browser, sign in, send mail, import
anything to Amazon or read a physical device. Keyboard and real device
clipboard behaviour remain unverified. Local layout and simulated-copy evidence
are separate below.

## Hardware UI checks

The studio styling below is local and is not part of the deployed version above.

### Studio styling (local)

`public/hardware.css` now owns the shared shell, fonts, palette and key states.
`public/kindle.css` owns the landing composition; `public/studio.css` owns the
studio layout and fields. The superseded studio rules were removed from
`public/style.css`, which still serves privacy and OAuth consent. Landing and
privacy source renders remained pixel-identical at 390px and 1280px after this
separation.

The studio has separate create, unchanged-file and Settings views. The active
form and its result share one working panel. Title fields have a pencil control;
editing a generated title returns to the retained draft and requires rebuilding
the EPUB. The original-file pencil returns to the retained file picker without
renaming or rewriting the original.

File cards separate identity, actions and metadata. A status tag starts at Not
sent and follows the matching receipt's submitted, rejected or unknown state.
Download remains the primary action; Preview is an icon beside it. A separate
More share options icon opens a shared native dialog for Kindle selection and
explicit sending. Opening or dismissing it sends nothing. Files stays an open
list with the same action icons. Icon-only controls retain accessible names and
44px minimum targets. Empty lists and download-only share actions remain hidden.

Size, short expiry and a File information icon occupy the result footer. The
icon opens a native dialog with the original filename, provenance, SHA-256 and,
for generated books, source-manuscript link. The expiry retains its ISO timestamp
and full local date. Optional book fields occupy a disclosure in the editor
footer; invalid hidden fields are revealed before native validation.

An earlier 15 November copy pass reduced static body-template text from 335 to
159 words (53%), before the shared-dialog markup was added. Create and Upload
replace the longer task labels. Repeated help, agent introductions and routine
technical IDs were removed; labels, recipient addresses, exact-sender approval,
size limits and delivery uncertainty remain. Image rows offer Copy ID without
displaying UUIDs; a clipboard failure reveals the full ID for manual copying.
Other setup information links to the existing guide and Amazon help.

Deleting the active file removes its download panel, retains the form inputs and
restores focus to the remaining files or studio heading. The upload area supports
file drops and the native picker. Selection does not upload or send. Both paths
check accepted filename/MIME types, single-file selection, empty files and the
20 MiB bound, with inline errors and recovery. Content inspection remains
server-owned; client checks do not establish a valid PDF or EPUB. File sizes use
KiB or MiB.

Settings exposes addresses, Amazon setup, agent connection, image uploads,
limits and account controls in open sections. A missing-destination send closes
the share dialog, opens Settings and focuses the address field without sending.
A contextual file strip offers Back to file and Save and return. Successful
contextual saves select the saved address and reopen the originating file's share
options; saving never submits email. Direct Settings saves stay in Settings,
and leaving during a pending save prevents its response from changing the view.
Session expiry closes both dialogs and clears their private contents and return
context. Receipts retain state, file, recipient and delivery uncertainty; refresh
keeps the original receipt ID. Unknown never authorises an automatic resend.

Submitted forms disable their controls until the request settles and retain
values on errors. Pending uploads ignore replacement drops. A pending send locks
the shared destination selector and other share actions, including controls
rebuilt by refresh. The matching result tag says Sending while waiting; an error
without a receipt says Submission not confirmed. Controls and icons recover on
success or failure. The delivery ledger and API contracts are unchanged.

Synthetic source renders covered creation, results, unchanged-file upload,
sign-in, Settings and receipts during the studio work. The card pass added
rendered checks of the separated result, metadata footer and both dialogs,
including narrow layouts and doubled text at 320px. Controls wrap when the text
no longer fits the action row.

The 15 November spacing/control refinement changes only `public/studio.css`.
Editor, result, file-list and Settings cards share gutters and corners; regular
fields and buttons share a 44px minimum height, border and corner treatment.
Title fields retain their larger treatment and pencil. Mobile card padding
increased from 16px to 20px; gutters no longer grow with doubled text. Settings
pairs sender and agent addresses with their Copy controls and styles the native
image chooser to match. File-list actions align beside filenames on desktop.
Narrow file cards give Download a full row and keep icons together below it;
narrow Settings panels stack Copy below the address. Both shared dialogs retain
room for enlarged text, with quiet close controls. No wording, handler, backend,
original-file or publishing-policy changes were made in this refinement.

Fresh self-contained source renders of this refinement used the actual font and
styles at 320px, 390px, 760px and 1280px, including 200% text at 320px. Creation,
results, Settings, upload, sign-in, both dialogs, a pending send and a failed send
were inspected; rendered geometry checks found no horizontal overflow in those
fixtures. The existing standalone handler proof was rerun after the styling
changes and passed. These are synthetic local source checks, not a test in the
user's browser; native physical keyboard and provider/device behaviour remain
unverified by this pass. Formatting and `git diff --check` passed.

Standalone checks of the actual handlers with fixture responses exercised title
selection and rebuilding, retained drafts and original PDFs, the status tag,
download/preview links, exact expiry, footer info, dialog dismissal, missing
addresses, Save-and-return reopening the same share without email, single and
multiple recipients, selection across files, explicit sending, pending locks,
unknown status, error recovery, deletion and session expiry. Earlier source
checks also exercised file-drop validation, receipt outcomes, image clipboard
recovery, pending-save navigation and loading states. Character counts still
appear only for the final 10% of the manuscript limit.

Before the spacing/control refinement, all 89 existing tests, formatting, the
dry-run build and native local runtime proof passed. Those checks were not
repeated for the CSS-only refinement. The runtime proof uses real local Better Auth, D1, OAuth and MCP
with captured synthetic mail. The browser proof script follows the new dialog
and icon controls; that browser branch has not been rerun. Source UI checks use
fixture responses and do not establish production sign-in, physical keyboard
navigation, provider acceptance or device delivery. The user's browser remained
under their control. These studio changes have not been deployed.

### Landing

On 14 November 2026, the landing page was adapted from the MIT-licensed
[SPEC-01 hardware kit](https://github.com/shuding/spec-01), using UI SDK's
`@ui-sdk/core` and `@ui-sdk/web` version `0.1.0-beta.1`. The copy key is a real SDK
web component; the navigation remains native links. Fonts and the roughly 41 KiB
browser module are self-hosted. The SDK uses constructed stylesheets under the
existing strict CSP, without allowing inline styles.

The refined landing folds the install commands under a native `connect`
disclosure on the e-ink screen and leaves sample, studio and source on the
physical keys below. The display font is preloaded. The SDK copy key stays hidden
until its component has loaded; the native disclosure, commands and links remain
available without JavaScript. Selection and keyboard focus have separate marks.

Source renders at 320px and 390px phone widths, 768px tablet width and 1280px
desktop width had no horizontal overflow. Closed layouts fit 320 × 568,
568 × 320 and 640 × 360 viewports without scrolling. The 200%-text open layout
also had no horizontal overflow; enlarged controls wrap onto separate rows.
These isolated renders inline the actual CSS, fonts and SDK bundle. A separate
no-JavaScript open render preserved the commands and links without an inert copy
key. They do not prove deployed headers, keyboard operation or a physical device.

An isolated render of the actual SDK bundle, with simulated clipboard allowance
and refusal, copied both exact commands, blocked repeated presses while pending,
announced success and selected both commands on refusal. Closing connect during
a pending refusal preserved the closed state and announced manual-copy
instructions, without claiming a hidden selection. This is not proof of real
device clipboard permissions. Actual keyboard and clipboard checks remain
unverified while the user retains the trial browser. The local Worker previously
rendered the desktop landing and upgraded the SDK button.

TypeScript, all 89 existing tests, formatting and the dry-run Worker build passed.
The deployed source remains uncommitted locally and has not been pushed to GitHub.

## What CI proves

Every push runs [the Checks workflow](../.github/workflows/checks.yml): formatting, strict
TypeScript and the behavioural contracts, a dry-run Worker bundle, a production dependency audit,
an independent EPUBCheck validation of the generated sample, and two runtime proofs that start a
real local Worker and a real Pages front door. The proofs use real Better Auth, real D1, a real
OAuth PKCE exchange and captured synthetic mail. They create no provider email, no Amazon import
and no physical Kindle state.

## What the runtime proofs cover

- Native assets, D1 identity, discovery and the authentication boundaries.
- The complete single-install plugin ZIP, served through real response headers, with its
  checksum verified.
- Native consent, PKCE, an MCP `create_book`, the download hash, refusal without a destination,
  and deletion.
- Real, independent email-code accounts, so one account cannot read another's documents or saved
  addresses, and logging out revokes the old browser session.
- The Pages front door and the real Worker service binding, preserving the public OAuth origin,
  cookies, bearer tokens, request bodies and private downloads, and refusing a wrong origin.
- The rendered landing page, the public sample and the studio in Chromium: focus contrast, the
  strict CSP, the first screen's prose, unique headings and anchors, packaged EPUB XHTML reflow,
  mobile layout, and no horizontal overflow at 200% zoom.

## What is not proven here

- Amazon converting an imported EPUB, and the representation Amazon then stores.
- Any file appearing in a Kindle library, on a device, or in a person's reading.
- A provider actually accepting and delivering a document. The proofs capture mail locally.
- A physical reader, a screen reader, or a client that has actually connected.

Those remain operator observations. The service reports what it did — a submission, a receipt, a
provider message id — and never a Kindle import or a device confirmation it cannot observe.

## Reproducing the checks

```sh
npm ci
npm run check
npm run format:check
npm run build
python3 scripts/runtime-proof.py --browser
python3 scripts/runtime-proof.py --pages --browser
```

The runtime proofs need a disposable local identity and capture mail locally. They never contact
Amazon and never send provider email.
