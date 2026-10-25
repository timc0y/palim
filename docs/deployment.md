# Deploy your own Palim

The hosted app is deployed; end-to-end inbox and Kindle acceptance remain separate release gates. Deploy only to resources you control. The checked-in configuration now targets Tim's dedicated personal-account resources and the reserved `palim-timc0y.pages.dev` hostname. Resource creation is not a deployed or verified application. Other operators must replace the account, resource IDs, origin, project name, sender and landing-page canonical metadata with their own values.

## Pages front door

The user selected a `pages.dev` address. The personal `tims` account owns the direct-upload Pages project `palim-timc0y`; Cloudflare assigned `https://palim-timc0y.pages.dev`. The selected production deployment is recorded in docs/verification.md. Do not assume `palim.pages.dev` is available.

`pages/public/_worker.js` forwards every request unchanged through the `PALIM` service binding to the `palim` Worker. That Worker still owns static assets, email-code sign-in, MCP OAuth, D1, private R2, email, rate limiting and scheduled cleanup. There is no cross-origin browser API or duplicate authentication layer. Worker `ORIGIN` must be the canonical Pages origin; OAuth callbacks and signed downloads use that same origin. The Worker public `workers.dev` route and version URLs are disabled. Alternate Pages preview hostnames must fail the canonical origin check.

Deploy the Worker first, once identity and signing credentials are approved and configured, then publish the Pages front door from the same verified source:

```sh
npm run deploy
npm run deploy:pages
```

The Pages helper runs from `pages/` so Wrangler reads its Pages configuration, and passes the Worker configuration’s account ID through `CLOUDFLARE_ACCOUNT_ID`. Pages rejects `account_id` inside its own Wrangler file; the helper keeps the chosen account explicit. Its production branch is `main`. A service binding is required; do not replace it with a public fetch proxy or rewrite the URL, Origin, cookies or authorization headers. Direct upload does not establish Git-connected automatic deployment. Pages adds no replacement for the Worker's cleanup schedule or rate limiter.

Run `python3 scripts/runtime-proof.py --pages --browser` to exercise the actual local Pages-to-Worker binding over HTTPS, in addition to the direct-Worker proof. Both disposable configurations set local and upstream protocols to HTTPS: Wrangler otherwise forwards local multi-Worker requests with an HTTP origin. Do not weaken the production origin check to accommodate that development default.

## Account setup

Use Node 22.16 or later and a Cloudflare account with Workers Paid and outbound Email Sending enabled for the intended recipients. Install dependencies with `npm ci`, then authenticate Wrangler with `npx wrangler login` and inspect `npx wrangler whoami`.

Create dedicated resources, or explicitly select existing Palim-owned ones:

```sh
npx wrangler d1 create palim
npx wrangler kv namespace create OAUTH_KV
npx wrangler r2 bucket create palim-books
```

Put the returned IDs in `wrangler.jsonc`. Keep the R2 bucket private. Configure an R2 lifecycle rule deleting objects after two days as crash-orphan protection; the application denies access after one day and deletes ordinary expired objects through its schedule. Do not enable a public R2 URL.

Set `ORIGIN` to the actual HTTPS origin, without a path or trailing slash. For the selected deployment this is the Pages front door; the Worker is reached through its service binding. The canonical origin check is intentional. Set `SENDER` to an address on a verified Cloudflare Email sending domain. Disable stored email previews for private books and verify provider daily/monthly quotas. Do not enable email routing or change DNS on an unrelated domain as an incidental setup step.

Choose the Cloudflare rate-limiting namespace configured for this Worker so it does not unintentionally share counters with another application. The edge limiter is approximate protection for anonymous authentication traffic, not the application's global spend or sending budget.

## Identity and secrets

Better Auth owns email-code sign-in and the only browser session. It uses the existing D1 database and Cloudflare email binding; no GitHub app or third-party identity tenant is required. MCP clients still use the maintained Cloudflare OAuth server with consent and PKCE at the same public origin.

Provision separate cryptographically random secrets with at least 32 bytes of entropy through Wrangler's secret store, never committed vars or public workflow inputs:

```sh
npx wrangler secret put AUTH_SECRET
npx wrangler secret put SIGNING_SECRET
```

Wrangler also supports an additive `deploy --secrets-file` containing both secrets. Keep that file private, ignored and mode 600; remove the temporary local copy after upload. Never reuse another project's secrets. Authentication-secret rotation invalidates sessions and outstanding encrypted login codes. Signing-secret rotation invalidates private links. Personal sender aliases are stored independently and remain stable. Plan rotation deliberately.

`FILE_ORIGINS` is empty by default. To support a client's file attachments, verify that client's actual download origin and explicitly add its exact HTTPS origin. Never use a wildcard or allow an arbitrary user-controlled host. The fetch path refuses credentials and redirects, uses a deadline and bounds downloaded bytes. A host whose redirects cannot meet that contract is unsupported; use the authenticated file-upload workspace instead.

## Initialise and deploy

```sh
npx wrangler d1 migrations apply palim --remote
npm run deploy
```

Deployment runs static preflight, TypeScript/tests, example generation and Wrangler. It does not prove that remote bindings, sender verification, OAuth credentials or a Kindle destination work. The local build command does not deploy:

```sh
npm run build
```

## Prove the actual offered journey

Open `/` and `/app` on the real HTTPS host. Verify that unauthenticated `/mcp` responds with OAuth discovery guidance. Complete a fresh email-code login, connect a real MCP client and approve consent. Wrong-origin writes and invalid bearer tokens must fail.

In the authenticated workspace, copy the account's personal sender into Amazon's approved personal-document email list as an exact address, not the whole domain. Confirm personal-document archiving for library use, then save up to five labelled Kindle addresses and select one. Palim does not send verification books or request Kindle codes. Existing users must update Amazon from the former shared sender to their personal sender.

Create one guide through the intended phone/client workflow. Inspect its download, sources, cover, table of contents, diagrams, code and larger-font reflow. Send it and independently check Amazon import and the physical device. Then upload an existing EPUB and compare its source hash with the decoded attachment in a controlled mail test. A real send must never rewrite that original.

Record actual deployment version, client/device versions and each observed result in `docs/verification.md` without addresses, access tokens, private books or codes. Until these steps pass, call the deployment unverified rather than production-ready.

## Operation and recovery

Migration 0005 adds an operator-managed `users.daily_send_limit`, defaulting to three and bounded between one and ten. Approved account-specific changes do not reset attempts or alter the shared mail budgets. The authenticated account response reports its actual limit. No browser or MCP input can change this allowance.

Default sending allowance: three document submissions per account per UTC day, 80 shared emails per day and 2,400 per month. Sign-in codes and documents all consume this same atomic ledger. Login has a lower ceiling of 20 per day and 600 per month. Login requests also have a per-address one-minute cooldown and five-per-day cap. These ceilings deliberately count uncertain attempts. The edge limiter and Better Auth D1 rate counters add anonymous abuse controls. Review the actual Cloudflare account allowances, which may be shared with other projects. Rate limiting is not a monetary guarantee.

A `submitted` record has a provider message ID. Inspect it in Cloudflare if troubleshooting is needed. `unknown` must not automatically become a new submission. A user can explicitly request another copy, accepting the possibility of a duplicate.

Disable an abusive or compromised account by setting its `users.disabled` field; every tool rechecks the user. Revoke corresponding grants through the owning OAuth/provider facilities when needed. There is no operator dashboard or bulk customer email tool in this version.

To remove an account, first list and remove its owned private objects, revoke its grants, then delete its Better Auth `auth_users` row and the matching application `users` row so sessions, private saved destinations and account records cascade. Deleting only the application row does not delete the identity. Keep required provider audit information under the provider's policy; deleting local records cannot recall email or erase an Amazon library copy.

Review the scheduled cleanup and bucket lifecycle. Backups and provider-side retention are separate from the application's expiry. Never claim total deletion from all processors merely because an R2 object was removed.

## One connection and one guide

Connect /mcp, sign in through browser OAuth, then let the agent read get_guide before creating or forwarding a book. src/guide.ts is the sole workflow source; MCP initialization and get_guide use that same text. The guide is read-only and advisory. Mutation tools enforce safety without requiring a prior guide call. There are no installed skills or setup hooks.

The optional Codex connection/branding package lives in plugins/palim and the repository catalog. Its documented compatibility layout is recognized by the installed Mac client. Build/deploy generates the ZIP/checksum in public and CI artifacts. npm run plugin can select a self-hosted origin. The allowlisted builder never installs, creates credentials/grants, sends mail or submits a listing. Actual client installation and OAuth consent remain separate gates.

Control HTML uses Referrer-Policy: same-origin so browser consent/logout forms retain the canonical Origin; cross-origin referrers remain suppressed. checkOrigin still rejects foreign, null and missing origins. Private previews/downloads retain no-referrer. Test normal browser forms, not only HTTP clients injecting Origin. The --origin-only native proof exits before login, registration, consent or grants; it submits an empty invalid sign-in form and checks hostile-origin refusal. Full OAuth-consent tests require authorization for disposable local grants.

## Saved addresses

Apply migrations through 0004 before deploying the personal-sender flow. These additive changes preserve saved/confirmed address IDs, labels, defaults and historical receipts/challenges; legacy confirmation state is no longer used for admission. Each enabled account atomically receives an immutable random sender alias on first authenticated access. Documents use only that alias on the existing onboarded SENDER domain; the shared address remains for login mail. No new credential or provider is needed. A missing/invalid domain or alias fails closed without falling back to the shared sender. Changing the domain requires users to update Amazon's approved sender.

Saving, labelling, choosing a default and selecting an address send no mail. Document delivery checks current account/recipient ownership and personal sender binding in atomic D1 admission, along with all existing budgets. No Palim Kindle verification endpoint remains. The grant-free --saved-addresses-only native proof uses synthetic local browser-session fixtures and captured mail, never OAuth registration/consent or actual provider mail. Full native OAuth tests remain subject to their separate grant approval.
