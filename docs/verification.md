# Verification record

## Current integration — 25 October 2026

The user approved Better Auth, Palim-only Cloudflare secrets, deployment to the personal `tims` account and a cooler ethereal redesign. The assigned canonical hostname is `https://palim-timc0y.pages.dev`. The initial Worker version `c2a41974-c1f8-4009-9646-f43d7a175b8e` deployed source `833d3fc71ae6f1281f7d8af916e31fd3acfc7818`. Pages published successfully after deployment-only correction `a5da954d1cd52814c0eeb8ccd3c1833031c36b1a`; its production hostname responds over HTTPS. A later UI refinement must be identified by its own deployed version below.

Better Auth 1.7.12 replaces the GitHub adapter and custom browser sessions. It owns native D1 email-code identity, encrypted five-minute OTPs, three attempts, seven-day secure host-only cookies and database rate limiting. The existing MCP OAuth consent/PKCE server remains separate. Up to five private labelled confirmed Kindle addresses can be saved, with explicit per-send selection and optional default.

All 68 behavioral tests and strict TypeScript passed on the Mac with Node 22.23.3. Eight focused authentication/security regressions cover encrypted codes, replay/expiry/exhaustion/concurrent redemption, cookie attributes, logout, disabled accounts, origin and unused-endpoint refusal, pre-rotation resend admission, private addresses, frozen default intent and concurrent cross-channel deduplication. SQLite exercises the actual queries; storage/email are explicit test doubles at this level.

The actual local HTTPS Pages-to-Worker service binding passed with native workerd, D1, private R2 and OAuth KV. Real Better Auth email-code signup/redemption established independent accounts. Only the external mail binding was replaced by a capture wrapper generated into a disposable local directory; no fixture route, flag or mail capture exists in product code. The proof covers secure cookies, encrypted OTP storage, replay refusal, consent, PKCE, MCP creation, download hashes, refused unconfirmed sending, account isolation, session revocation, wrong-origin and invalid-bearer refusal, browser creation, unchanged upload and mobile layouts. Browser proof also captures login errors, saved/pending addresses, synthetic submission receipts, reduced-motion and 200% mobile zoom. These are captured-mail checks, not Cloudflare or Kindle acceptance.

Independent read-only security review identified and verified corrections for missing-secret fail-closed behavior and cross-channel duplicate delivery. Concurrent explicit/default requests now share one original receipt even after changing the default. No remaining critical defect was found in the reviewed auth, budget, destination and retry paths. This is agent review, not an external audit.

Astra supplied the revised reading-atelier direction and inspected Mobbin references for hierarchy, login and address selection. Original CSS/SVG and self-hosted OFL Instrument Serif implement the visual system in DESIGN.md. The one-time UI detector identified small inherited text and a generic hero eyebrow; those were corrected. The additional local UI Skills Root, colour, typography, accessibility, metadata and interface-writing pass removed redundant labels/cards, added linked error/busy states and skip navigation, set private-workspace noindex, and replaced TTF with self-hosted WOFF2. Latest rendered screenshots and final reviewer disposition belong to the exact-source CI evidence, not the design proposal alone.

## Live production checks

The canonical `https://palim-timc0y.pages.dev` passed real HTTPS asset/font/sample requests, correct OAuth issuer, anonymous API/MCP refusal, invalid bearer refusal, wrong-origin login refusal and blocked unused auth endpoints. No live email was requested.

The operator seeded two temporary ten-minute Better Auth sessions and synthetic saved-reader fixtures directly in the dedicated production D1 solely for scoped acceptance. No fixture route or bypass was deployed. Through the actual public Pages origin, account/file creation, private download SHA-256, no-store headers, refused foreign file deletion/sending, private reader listing, refused foreign reader default/deletion, owned default selection, disabled-account refusal, object deletion and logout revocation all passed. All temporary identities, sessions, readers and private objects were then removed and absence checked. This establishes live session and data boundaries, not email-code inbox delivery or real Kindle confirmation. No provider send was invoked.

[Exact-source CI run 40189194527](https://github.com/timc0y/palim/actions/runs/40189194527) passed for `833d3fc71ae6f1281f7d8af916e31fd3acfc7818`; downloaded SHA, test, EPUBCheck and native/Pages logs were inspected. Screenshot artifact `12596832684` contains landing, email/code/error, empty/populated workspace, saved/pending addresses, synthetic receipt and mobile-zoom views. Newer source must pass its own CI.

## Provider preparation

Dedicated personal-account resources are D1 `palim`, private Standard R2 `palim-books`, OAuth KV `palim-oauth`, Worker `palim` and Pages `palim-timc0y`. Public R2 access is disabled with no custom bucket domains; the verified `palim-expiry` lifecycle removes objects after two days. The application denies ordinary artifact access after 24 hours and signed links after 15 minutes. Unrelated infrastructure was not reused or changed.

The separately approved sender is `reading@palim.timc0y.com`. Cloudflare enabled the dedicated sending subdomain and its isolated MX, SPF, DKIM and DMARC records. Authoritative DNS was checked. A documented API GET verified `preview_enabled=false` and `enabled=true`. No real email was submitted. Account-specific sending quota and actual recipient acceptance still require live evidence; application ceilings are not a provider or monetary guarantee.

The Worker disables public `workers.dev` and version URLs. Pages passes requests unchanged through a native service binding, preserving one browser/API/OAuth origin. Alternate preview hosts must fail the canonical-origin check. No new subscription was started.

## Earlier verified source

- Baseline `00c7d5c5a199189f94e1ac14172c36899cd6459e`: 62 tests, Node 22/26 TypeScript and local build, zero production audit vulnerabilities, checksum-pinned EPUBCheck 5.4.0 with zero fatals/errors/warnings/infos, and disposable native/browser proof. [CI run 40177778587](https://github.com/timc0y/palim/actions/runs/40177778587) passed; downloaded artifact identity and logs were inspected.
- Pages front-door preparation `9961200bde0a83b9b4f5b31803535f700a1aae30`: [CI run 40186430843](https://github.com/timc0y/palim/actions/runs/40186430843) passed and artifacts were inspected. This used a seeded local identity and the former GitHub source; it did not establish production login or the later Better Auth implementation.

## Remaining acceptance gates

A real inbox login, Cloudflare provider message acceptance, recipient delivery, Amazon import, physical Kindle rendering and a fresh intended MCP-client connection are distinct unverified gates. No live test mail is authorized until its recipient, document and purpose are established. A successful captured email or provider receipt must never be described as Kindle acceptance.

SVG EPUB conformance and browser preview do not establish Amazon conversion fidelity. Original-document inspection is bounded, not antivirus or proof of every EPUB/PDF feature. External host-file transfer remains deny-by-default until its exact origin and client behavior are verified.

The Checks workflow records the exact source SHA, tests, build, production dependency audit, independent EPUBCheck and both direct/native Pages browser proof. Inspect that revision and its logs rather than treating this record as proof of later code. Source verification, deployed version, real email and physical-device evidence remain separate.
