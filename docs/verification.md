# Verification record

## 25 October 2026 release candidate

[Checks run 40177170759](https://github.com/timc0y/palim/actions/runs/40177170759) verified source `2012c3a1061cfbd0ade6aebfc0d1501d554bbd01`. The downloaded artifact logs were inspected, not just the job status. The workflow uses explicit Bash failure propagation, including failures before `tee`.

### Executed acceptance checks

- Strict TypeScript, formatting and **61 Node tests passed**. Tests exercise real SQLite with the application's D1 queries; R2 and Email are explicit test doubles at this level.
- `npm audit --omit=dev --audit-level=high` reported **0 vulnerabilities** for the installed production dependency tree at that time. This is not a guarantee against future advisories or application defects.
- Wrangler bundled the actual Worker and generated the public example. This was a local build, not a deployment.
- Checksum-pinned EPUBCheck 5.4.0 validated the illustrated sample with `--failonwarnings`: **0 fatal errors, 0 errors, 0 warnings and 0 infos**. The validator reports its current EPUB 3.4 rules; the publisher uses the established EPUB 3 subset, not draft-only features.
- Native local workerd, D1, R2 and OAuth KV completed HTTPS discovery, dynamic client registration, account-bound consent, PKCE exchange, authenticated MCP initialise/list/create, a private download with the expected SHA-256, unconfirmed-send refusal, artifact deletion and invalid-token refusal.
- Real Chromium navigated the HTTPS local service, rendered the landing page at desktop and 390-pixel width, entered the authenticated workspace, created a book through the real page JavaScript, and uploaded the original sample EPUB. No page errors or horizontal mobile overflow were observed in those journeys.

The native identity was deliberately seeded in a disposable local database. This proves the application/OAuth protocol journey after identity establishment, not a real GitHub account login. A separate automated test exercises the official Octokit exchange and identity lookup against controlled provider responses, including state replay prevention and token non-retention.

The verification artifact includes the exact source SHA, logs, sample EPUB, native-runtime EPUB, manuscript and real browser screenshots. Its success markers are:

```text
Native assets, D1 identity, discovery and authentication boundaries passed.
Native consent, PKCE, MCP create, download hash, unconfirmed-send refusal and deletion passed.
Real Chromium navigation, mobile layout, browser create and original-upload journeys passed.
PASS: disposable local runtime proof. Synthetic local identity; no live GitHub sign-in, provider email, Amazon import or physical Kindle claim.
```

### Behaviours covered

The suite checks EPUB container structure, XML/navigation/metadata, source escaping, diagram output, bounded archives, font obfuscation versus content protection, original EPUB/PDF attachment hashes, tenant isolation, concurrent send and confirmation races, quotas, unsafe sign-in return paths, expiring links, deletion and unknown-send recovery.

The official MCP client exercises all three promised tools, including sending an owned artifact, forwarding a host-provided file unchanged, reading receipts, repeated-intent deduplication, scope refusal and cross-account refusal. The host-file test checks the actual supported file-input shape and controlled fetch path; it is not a fresh ChatGPT installation test.

### Review and corrections

Six bounded agent sessions were used: five specialist/source reviews and one independent execution review. The latter checked `878a3af20ca827ebba8e600d62614c42983c6e86` with Node 22.23.3, reproduced its 52 passing tests and successful example/build, and identified missing MCP send/receipt coverage. That coverage is included in the later 61-test gate. Agent review is not an external security audit.

Confirmed findings were fixed and tested: competing reader-confirmation requests, control-character return redirects, account switching during consent, challenge-budget exhaustion, missing MCP delivery coverage and three security-advised dependency pins. The unsupported sign-in adapter was replaced with maintained Octokit methods.

An early bootstrap pipeline masked a browser-cookie failure because a shell pipe returned the logger's status. Its green badge is not browser evidence. The temporary workflow was removed, the permanent gate now propagates failures, and browser acceptance runs over HTTPS for real secure-cookie semantics. The successful run above contains the actual completed browser result.

### Remaining live acceptance

No production Cloudflare deployment was provisioned or verified. No real GitHub OAuth application was configured. No live Cloudflare email submission, Amazon conversion, Kindle-library item, physical-device reading experience or fresh ChatGPT/Claude/Codex connection was observed. The checked-in resource IDs and sender remain deliberate placeholders.

The current book embeds SVG figures. EPUB conformance and browser appearance do not establish Kindle conversion fidelity. Existing-document inspection is bounded and defensive, not an antivirus engine or proof that every EPUB/PDF feature is supported.

The portable skill/plugin package is present but not listed in a public plugin directory. Remote file handoff requires an exact operator-configured host origin; the default denies all external file fetching.

## Release acceptance

A live release requires the actual provider setup and complete user journey in deployment.md, including physical-device evidence. Keep each stage separate: committed source, tests, native runtime, deployment identity, email submission, recipient-server delivery, Amazon import and human-observed Kindle receipt.

A subsequent 390-pixel visual review found undersized chart labels. The chart layout was changed to stack and wrap labels above the bars, preserve exact values, and mark rounded display values explicitly. The additional regression brings the suite to 62 tests; those tests and the updated sample passed locally. The native browser gate now also opens the actual private illustrated preview and captures both figures. Its current run is the authority for that later source.

The ongoing Checks workflow is the current source-level gate. Consult its exact checked SHA instead of treating this historical record as proof of later changes. Documentation-only updates still run the full gate.
