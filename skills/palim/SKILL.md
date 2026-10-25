---
name: palim
description: Create an illustrated EPUB from a conversation, concept, repository, research or technical decision; or forward a user-supplied EPUB/PDF unchanged to their confirmed reader. Use when the user asks to make a reading guide, publish an ebook, send reading to Kindle, or forward an existing book. Requires a connected Palim MCP for rendering and delivery.
---

# Palim

Make something worth reading, or send something the reader already has. These are separate journeys.

## Choose the actual request

**Forward an existing EPUB/PDF:** call `send_document` with the actual host-provided file or an existing Palim artifact. Do not read the whole book into context, rewrite it, repair it, change its cover or metadata, repackage it, generate a replacement, or add a credit. Do not call `create_book`. A local path is not a remote file. Never fabricate a download URL or reconstruct the bytes as Base64. Respect file-host errors; use the deployment's authenticated upload workspace when a client cannot hand off its file.

**Create a reading edition:** research and write through the tools already available to the conversation, then call `create_book`. Palim does not inspect repositories or call a writing model. A request to create a draft authorises no email. A clear request to create and send authorises both steps, subject to the host's permissions.

**Revise:** edit the exported source or the manuscript already in context and create a new edition. Sending a new edition is not an in-place Kindle update. Do not promise transferred highlights, reading position or old-copy deletion.

## Author a useful explanation

State the reader's question and what the guide should help them understand. Prefer a concrete example, its mechanism, a meaningful exception and the resulting decision. Do not substitute a file inventory for an explanation or preserve a transcript's accidental order.

For code or changing research, select a revision/date before gathering evidence. Distinguish documented intent, observed implementation, executed evidence, interpretation and proposals. Code does not prove why its author made a decision. Private material stays private; never publish or fetch a repository into another service merely because this skill is installed.

Use the smallest visual that explains a relationship. A sequence answers what happens next; a flow shows dependencies; a comparison makes trade-offs explicit; a chart compares actual supplied numbers. Never invent data to fill a chart. Label hypothetical examples prominently. Keep explanations near figures and preserve uncertainty and units.

A useful default is a short guide, not a compulsory length. The current publisher accepts at most 24 chapters, 12 figures, 50,000 Markdown characters per chapter and 240,000 manuscript characters overall. Split a genuinely larger work into deliberate editions rather than repeatedly failing its limit.

## `create_book` contract

Supply `title`, `language` (BCP 47, default `en`) and `chapters: [{ title, markdown }]`. Optional metadata: `subtitle`, `creator`, `description`, `edition`, `sourceRevision`. Credit the actual creator; do not automatically put the reader's name in the author field.

Add a figure with a unique lowercase `id`, meaningful `alt`, and explanatory `caption`. Reference it on its own line as `![description](figure:the-id)`.

Supported figure kinds:

- `mermaid`: `source` in Mermaid syntax, at most 6,000 characters/80 lines. Keep the diagram small and prefer a vertical reading path.
- `bars`: `unit`, `source`, and up to eight `{ label, value }` records with finite non-negative values. Use this only for supported quantitative data.
- `image`: `assetId` for an owned, previously uploaded PNG/JPEG. Remote image URLs are not accepted. The current publishing path does not generate images or play video.

Sources are `[{ title, url, note? }]`, using HTTPS URLs without credentials. Put the relevant source context in the chapter as well as the source list. Markdown supports ordinary emphasis, lists, narrow tables and short code excerpts. Raw HTML is escaped; arbitrary CSS and scripts are not supported. Avoid wide tables, very long code lines, unsupported interactive elements and fake widgets.

The result supplies a private download URL, manuscript export, preview URL, hash, expiry, word count and warnings. Generated files expire after 24 hours; download links expire after 15 minutes. Do not imply a permanent Palim library. Treat the browser preview as an approximation, not proof of Kindle conversion.

## `send_document` contract

Pass either `artifactId` or `file`, never both. The ChatGPT file object has `download_url` and `file_id`, with optional `mime_type` and `file_name`; use the actual host values. The account owns the destination; there is no free-form recipient argument.

Sending preserves the attachment bytes. The service rejects oversized or unsupported input rather than modifying it. Amazon may convert the imported file. A verified attachment hash proves the upload-to-attachment boundary only.

The Cloudflare route has a 5 MiB encoded-message limit, smaller than the 20 MiB upload allowance. If a valid original is too large, keep it unchanged and downloadable. Explain the limit and Amazon's separate web-upload route. Never claim that emailing a download link imports the ebook.

For an ordinary repeated call, use the original artifact and omit `resendOf`. Repeated submissions return the existing delivery record. Only an explicit request for another copy permits `resendOf: previousDeliveryId`; uncertainty alone is not a reason to send again.

## Receipts and setup

Use `get_delivery` with the returned `deliveryId` to inspect a send. `submitted` means Cloudflare accepted the submission; it does not establish Amazon import, device download or reading. `unknown` means no automatic retry. Report the distinction in plain language. Do not poll indefinitely or imply unattended future work.

An unconfirmed destination returns a setup instruction. Open the authenticated workspace, approve the exact service sender in Amazon's personal-document settings, enter the Kindle address, and use the code inside the verification book. Never ask for Amazon passwords. Do not try to retrieve the hidden code from storage, logs or the agent's environment; the reader must obtain it from their destination.

Finish with the useful artifact or truthful receipt and any material limitation. Never turn a blocked live operation into a success claim.
