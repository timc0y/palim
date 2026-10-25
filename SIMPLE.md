# Simple

## Reality

- Tim authorised the public MIT `timc0y/palim` repository and implementation on 25 October 2026. Palim is an agent publishing and unchanged-document delivery tool, not a Kindle client or repository crawler.
- The source implements one Cloudflare Worker, D1, private R2, OAuth KV and Cloudflare Email, with a thin Pages service-binding front door for the user's selected `pages.dev` address. Dedicated personal-account resources and a Pages hostname are provisioned; current deployment evidence is recorded separately.
- The existing agent owns research/authorship. A strict bounded manuscript is rendered without an additional model. Existing EPUB/PDF forwarding bypasses that renderer.
- `docs/verification.md` owns executed checks and unverified provider/device boundaries. Local evidence must not be restated as a live release.

## Preserve

- Original upload and decoded email attachment are byte-identical. No implicit repair, conversion, branding or metadata rewrite.
- A draft never sends mail. Delivery uses the authenticated account's selected saved destination, not a model-provided recipient.
- Repeated delivery intent returns one receipt. Timeout/unknown never authorises an automatic second submission. Explicit intentional resends are distinct.
- Private manuscripts, addresses, tokens, provider text and other repositories' content stay out of Git and logs. Input, render work, external fetches and email are bounded.
- Missing evidence stays missing: submitted is not Amazon conversion, library import, device receipt or reading.

## Current boundary

- `get_guide`, `create_book`, `send_document` and `get_delivery` are the MCP operations. The workspace owns sign-in, uploads, destination confirmation and temporary downloads.
- Better Auth owns email-code identity and the sole browser session; no social-provider application is needed. Private labelled Kindle destinations are application data, with at most five saved labelled addresses and a default. Saving sends no mail. Each account has a persistent random personal sender on the configured sending domain; the user approves that exact sender in Amazon once. Palim has no Kindle verification-book/code flow. A maintained Cloudflare OAuth provider owns MCP consent, PKCE, tokens and discovery. The tested SDK is pinned; new host compatibility requires its own proof.
- Diagrams and the automatic cover are embedded SVG; supplied PNG/JPEG assets are supported. Physical Kindle rendering remains unverified. No browser runtime, JEV/Clef dependency or alternate email provider is required.
- Hosted artifacts expire after 24 hours, signed links after 15 minutes, and minimal delivery records after 35 days. Provider retention is separate. R2 lifecycle is a deployment obligation for crash-orphan cleanup.

## Ordinary paths

- `src/schema.ts` owns manuscript shapes and quotas. `src/book.ts` owns EPUB packaging, `src/figures.ts` figures, and `src/archive.ts` bounded original inspection.
- `src/service.ts` owns artifact/delivery operations; `src/store.ts` owns atomic D1 admission and recovery, including the shared mail ledger across login and documents. `src/mail.ts` owns the provider payload and integrity/size boundary.
- `src/login.ts` configures Better Auth on native D1; `src/auth.ts` exposes only sign-in code request/redemption and logout. `src/index.ts` and the maintained Cloudflare OAuth package own downstream MCP authorization. `src/mcp.ts` and `src/routes.ts` expose the same service rather than reimplement policy.
- `pages/public/_worker.js` passes public requests unchanged to the Worker. `pages/wrangler.jsonc` owns that service binding; the Worker configuration owns the canonical Pages origin and all data, email, rate limiting and cleanup. The front door introduces no separate identity or browser API origin.
- `src/guide.ts` owns the canonical agent guide, served through MCP initialization and the read-only `get_guide` tool. `plugins/palim/` owns the optional client connection/branding package without installed skills or setup hooks; `.agents/plugins/marketplace.json` exposes that one package. The packaging script produces its credential-free downloadable ZIP and can select a self-hosted endpoint. No separate skill install is required.
- `docs/deployment.md` owns provider setup and acceptance. `docs/verification.md` owns proof. Change those owners instead of creating parallel status pages.

## Proof

- `npm run check`: strict TypeScript plus SQLite-backed publishing, forwarding, tenant, quota, recovery and MCP tests. External email is a test double here.
- `npm run build`: local Worker bundling, not deployment. `npm run example`: the actual downloadable publication.
- CI EPUBCheck tests the produced sample through an independent validator. Native runtime and browser/device evidence are named separately in the verification record.
- No write, feature flag or hidden fixture mode is added to product code merely for testing. Disposable local databases hold synthetic runtime-test identities.

## Reconsider when

A real supported client needs an adapter, measured work exceeds the runtime, demonstrated readability defects justify a new renderer, or external users establish a compatibility promise. Do not add queues, models, library sync, alternate providers or output formats merely because a dependency supports them.
