/** Canonical workflow, shared by MCP initialization and get_guide. */
export function agentGuide(origin: string): string {
  return `# Palim agent guide

Create a reading edition or forward an existing EPUB/PDF unchanged. Read get_guide before either workflow. This guide is advisory; tools independently enforce authorization, ownership and limits.

## Create an edition

Research and write within the user's authorized scope. Palim renders the supplied manuscript; it does not call an authoring model or crawl repositories. Start with the reader's question, explain one useful worked example, cite actual HTTPS sources and distinguish evidence from interpretation. Credit the actual creator.

Call create_book with title, language and chapters [{title, markdown}]. The schema defines optional metadata and size limits. Use short sections, readable code and narrow tables. Define figures with unique ids, meaningful alt text and captions, then reference each on its own line: ![description](figure:id). Use mermaid for small relationships, bars for supported numbers with units/source, or image with an owned uploaded assetId. Never invent data. Raw HTML, scripts and remote image URLs are unsupported.

A draft never sends email or needs Kindle setup. Return its private download/preview, expiry and warnings. Files expire after 24 hours; signed links after 15 minutes.

## Forward an original

Call send_document with an owned artifactId or the client's actual file object: download_url and file_id, optionally mime_type and file_name. Downloads must use public HTTPS/443 without credentials or redirects. If the client cannot supply a downloadable file, use ${origin}/app for authenticated upload.

Never call create_book to forward an original. Preserve its bytes and metadata: do not repair, convert, repackage, invent a URL, turn a local path into a URL or reconstruct it as Base64. Oversized originals stay downloadable; do not shrink them silently.

## Account and Kindle setup

Sign in through the client's browser flow; never request inbox codes, tokens, cookies or Amazon passwords in chat. No skill installation is required. The workspace at ${origin}/app saves up to five labelled Kindle addresses and a default. Saving sends no email. Copy the complete Kindle address from Amazon, including any suffix; never derive it from an inbox address or guess destinationId.

Approve the account's exact personal Palim sender in Amazon once, not the whole domain. Setup instructions and the sender are in the workspace. Addresses and documents are private to their account. The sign-in inbox receives no extra book copy.

## Send and check

Send only when the user requests this document to the selected saved recipient. Use destinationId only when established from the account. For ordinary repeated intent, reuse the artifact and omit resendOf. An explicit additional-copy request permits resendOf; an unknown outcome does not. Use get_delivery instead of blindly resending.

submitted means Cloudflare acceptance, not Amazon import or device receipt. Amazon controls conversion. Keep private links private and report only the evidence available.`;
}
