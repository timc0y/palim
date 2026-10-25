# Verification record

## 25 October 2026 build

The implementation was created through Forge on public `main`. Five bounded specialist sessions reviewed EPUB/runtime, Cloudflare Email, security, MCP/client contracts and a pinned source snapshot. Their suggestions were checked against actual code. A separate execution review is recorded when its output is available; reviewer statements alone are not test evidence.

### Executed locally

- TypeScript checks and 52 Node tests passed after the file-input contract correction. Tests exercise real SQLite with the same D1 SQL; R2 and Email are explicit test doubles.
- Tests cover stored first EPUB mimetype, XML/navigation/metadata, source escaping, diagrams, unsafe inputs, original EPUB/PDF attachment hashes, tenant isolation, concurrent send/confirmation races, quotas, malformed return paths, expiring downloads, unknown outcomes and the official MCP client/transport.
- Wrangler produced a Worker bundle. Local workerd applied the real D1 migration and served the landing page and workspace. A redirect loop found through this runtime check was removed.
- Native workerd/D1/R2 created an EPUB, returned a private download with the matching SHA-256, refused an unconfirmed send, deleted the artifact and refused a subsequent download.
- Native OAuth provider/KV completed dynamic client registration, consent binding, PKCE code exchange and authenticated MCP initialise/list/create calls. Invalid bearer access was refused. The user identity was deliberately seeded in a disposable local database: this is not a real GitHub sign-in test.
- Chromium rendered the actual landing-page HTML/CSS at desktop and 390-pixel width without horizontal overflow. The local browser environment blocked network navigation by policy, so these screenshots used document injection. They are visual checks, not browser end-to-end proof.

### Independent EPUB validation

[GitHub Actions run 40174912532](https://github.com/timc0y/palim/actions/runs/40174912532), source `89c8570fcfa8a7308b8c94e7340b45681c7d1828`, generated the illustrated sample and ran checksum-pinned EPUBCheck 5.4.0 with `--failonwarnings`. Result: **0 fatal errors, 0 errors, 0 warnings and 0 infos**. EPUBCheck reports its current 3.4 rules; the publisher uses the established EPUB 3 subset rather than draft-only features.

The ongoing `Checks` workflow is the current source-level gate. Consult its exact checked SHA rather than treating this historical run as proof of later changes. Its artifact includes the example EPUB and verification logs.

### Not established by these checks

No production Cloudflare deployment was provisioned or verified. No live GitHub OAuth application was configured. No live Cloudflare email, Amazon conversion, Kindle-library item, physical-device reading experience or fresh ChatGPT/Claude/Codex installation was observed. The configured resource IDs and sender remain placeholders.

The current book embeds SVG figures. EPUB conformance and browser appearance do not establish Kindle conversion fidelity. Existing-document inspection is bounded and defensive, not an antivirus engine or proof that every EPUB/PDF feature is supported.

The repository includes the portable skill/plugin package, but it is not listed in a public plugin directory. File handoff requires an exact configured host origin; the default denies all external file fetching.

## Release acceptance

A live release requires the actual provider setup and complete user journey in `deployment.md`, including physical device evidence. Keep each stage separate: committed source, tests, native runtime, deployment identity, email submission, recipient-server delivery, Amazon import and human-observed Kindle receipt.
