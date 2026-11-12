# Verification record

What has actually been checked for the current release, and what has not.

## Latest deployment

On 12 November 2026, commit `f14ae0f` was deployed to the `tims` account. The Worker `palim` version is `1931bb4d-a604-4746-901e-e4f94900bc17`. The existing Pages front door at https://palim-timc0y.pages.dev serves that Worker. Remote D1 was left as already migrated.

The live host returned the current landing: the word, the small mark, the two commands, three books and four keys, with no horizontal overflow at 320px. Unauthenticated `/mcp` answered `401` with OAuth discovery for that same origin. This check did not sign in, send mail, import a file to Amazon, or read a device.

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
