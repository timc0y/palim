# Deploy your own Palim

The repository is not yet a verified live hosted service. Deploy only to resources you control. The checked-in configuration now targets Tim's dedicated personal-account resources and the reserved `palim-timc0y.pages.dev` hostname. Resource creation is not a deployed or verified application. Other operators must replace the account, resource IDs, origin, project name and sender with their own values.

## Pages front door

The user selected a `pages.dev` address. The personal `tims` account owns the direct-upload Pages project `palim-timc0y`; Cloudflare assigned `https://palim-timc0y.pages.dev`. No first deployment has been published yet. Do not assume `palim.pages.dev` is available.

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

Wrangler also supports an additive `deploy --secrets-file` containing both secrets. Keep that file private, ignored and mode 600; remove the temporary local copy after upload. Never reuse another project's secrets. Authentication-secret rotation invalidates sessions and outstanding encrypted login codes. Signing-secret rotation invalidates private links and reader confirmation hashes. Plan rotation deliberately.

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

Add the exact sender to Amazon's approved personal-document email list, confirm personal-document archiving for library use, enter your Kindle address and request one verification book. Read the code from the Kindle—not logs or a captured local fixture—and submit it in the workspace.

Create one guide through the intended phone/client workflow. Inspect its download, sources, cover, table of contents, diagrams, code and larger-font reflow. Send it and independently check Amazon import and the physical device. Then upload an existing EPUB and compare its source hash with the decoded attachment in a controlled mail test. A real send must never rewrite that original.

Record actual deployment version, client/device versions and each observed result in `docs/verification.md` without addresses, access tokens, private books or codes. Until these steps pass, call the deployment unverified rather than production-ready.

## Operation and recovery

Default sending allowance: three document/verification submissions per account per UTC day, 80 shared emails per day and 2,400 per month. Sign-in codes, confirmation books and documents all consume this same atomic ledger. Login and confirmation each have a lower ceiling of 20 per day and 600 per month. Login requests also have a per-address one-minute cooldown and five-per-day cap; verification books have a two-per-destination daily cap. These ceilings deliberately count uncertain attempts. The edge limiter and Better Auth D1 rate counters add anonymous abuse controls. Review the actual Cloudflare account allowances, which may be shared with other projects. Rate limiting is not a monetary guarantee.

A `submitted` record has a provider message ID. Inspect it in Cloudflare if troubleshooting is needed. `unknown` must not automatically become a new submission. A user can explicitly request another copy, accepting the possibility of a duplicate.

Disable an abusive or compromised account by setting its `users.disabled` field; every tool rechecks the user. Revoke corresponding grants through the owning OAuth/provider facilities when needed. There is no operator dashboard or bulk customer email tool in this version.

To remove an account, first list and remove its owned private objects, revoke its grants, then delete its Better Auth `auth_users` row and the matching application `users` row so sessions, private saved destinations and account records cascade. Deleting only the application row does not delete the identity. Keep required provider audit information under the provider's policy; deleting local records cannot recall email or erase an Amazon library copy.

Review the scheduled cleanup and bucket lifecycle. Backups and provider-side retention are separate from the application's expiry. Never claim total deletion from all processors merely because an R2 object was removed.
