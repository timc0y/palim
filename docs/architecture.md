# Architecture

Palim has two complete journeys. New books pass through a deterministic publisher. Existing books do not.

## Creation

The authoring agent supplies metadata, chapter Markdown, figure specifications, owned image handles and sources. Zod validates the whole bounded manuscript. Markdown-it renders escaped XHTML; Pele renders bounded Mermaid SVG; the chart renderer uses only explicitly supplied numbers. JSZip packages the EPUB with a first, stored `mimetype`, OPF metadata, spine, navigation, stylesheet and embedded assets.

The service stores the EPUB, canonical JSON source and script-free HTML preview under private owned R2 keys. D1 stores ownership, hashes, sizes and expiry. A short-lived HMAC URL gives access to one artifact part. Every access checks the account and current artifact expiry. The preview has its own sandboxed Content Security Policy.

## Unchanged forwarding

The service takes an owned upload or an exact allowlisted host attachment URL. It does not fetch arbitrary web pages or follow redirects. Host URL admission is deny-by-default. An upload is bounded by actual streamed bytes, not just Content-Length.

EPUB inspection preflights the ZIP directory and then reads only bounded metadata streams. PDF inspection checks the header and size; it is not a complete PDF validator. Font obfuscation and content encryption are distinguished. No source archive is extracted to disk or rewritten. The original bytes are stored and hashed.

Delivery reads the stored bytes and verifies the hash before encoding the attachment. The encoded-message budget includes line and header headroom. Oversized input is refused without alteration. Cloudflare owns SMTP retries after accepting a submission; Palim never sends a second message to simulate a retry.

## Identity and authority

Better Auth is the sole browser identity/session owner, with native D1 tables, five-minute encrypted email OTPs and three verification attempts. The browser cookie is host-only, Secure, HttpOnly and SameSite=Lax, with seven-day sessions and database revocation. Only sign-in code request/redemption and logout are exposed: unused password reset, email-change and verification-inspection endpoints are refused. Exact-origin checks protect browser mutations. Return paths reject control characters and foreign origins. Missing dedicated authentication or signing secrets fail closed.

A request-local internal mail claim must be admitted before Better Auth can mutate its OTP. Shared daily/monthly D1 counters include login, verification books and documents, with smaller login/challenge allowances. Login recipients have a keyed-hash cooldown and daily cap before identity establishment. A throttled resend never replaces the previously mailed code. Unknown or failed submissions conservatively retain their slot. Database rate limits supplement the edge rate limiter and persist across Worker instances.

The maintained Cloudflare OAuth provider owns the MCP authorisation protocol. Consent is bound both to the provider's transaction and the signed-in Palim account. Each tool checks its required scope and current account access. A client may select only an owned, already confirmed destination ID; arbitrary recipient emails are never accepted by a send operation. Private labelled addresses and default selection belong to application data, not the authentication package.

Reader confirmation sends a short-lived code inside a verification EPUB. The code/file is never returned to the initiating client, stored on the artifact shelf or written to logs. Atomic challenge ownership prevents competing requests from invalidating the mailed code. Codes are keyed hashes with a five-attempt budget. Challenge sending has its own smaller shared allowance.

## Side effects and recovery

A send key combines owner, content hash, confirmed destination ID and optional explicit resend parent. Browser and agent requests share that key. A unique default-intent alias freezes the first implicit recipient, so changing or removing the default never silently redirects an ordinary retry. D1 atomically claims this logical submission while checking per-user and shared allowances. It returns the first receipt on repetition. A deliberate resend names a previous owned receipt and creates a new logical action.

States are `submitting`, `submitted`, `rejected` and `unknown`. The submission call is not part of a transaction with the email provider; exactly-once external delivery is not promised. If acceptance may have happened, the record remains unknown and no automatic second call is made. The current version records provider submission only; it does not consume delivery-event queues or infer Kindle receipt.

## What this does not own

Repository truth, research quality and authorial judgement stay with the authoring agent and original sources. Amazon owns imported personal documents, conversion and library state. The service has no Kindle read API, annotation sync, permanent library, repository index or model-based security gate.

## Bounded choices

SVG figures are standards-based and independently validated, but their Kindle conversion must be tested before promising device support. The current MCP v1 SDK version is pinned and exercised through its official client and web-standard transport; review its supported maintenance window before upgrading or claiming a newer protocol generation. The public service needs provider setup, fresh-client OAuth proof and device evidence, not only a bundle that compiles.
