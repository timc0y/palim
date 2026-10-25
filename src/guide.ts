/** Canonical agent workflow. Both MCP initialization and get_guide use this text. */
export function agentGuide(origin: string): string {
  return `# Palim agent guide

Use this connection directly; no skill installation is required. Read get_guide before creating a reading edition or forwarding an original. The guide is advisory: authorization, ownership, validation and sending limits are always enforced by the service.

## Create a reading edition

The existing agent researches and writes; Palim does not call an authoring model or crawl repositories. Start with the reader's question, a concrete worked example, its mechanism and the useful decision. Cite actual HTTPS sources; distinguish evidence, interpretation and proposals. Keep private material within the user's authorized scope.

Call create_book with title, language and chapters: [{title, markdown}]. Optional metadata includes subtitle, creator, description, edition and sourceRevision. Credit the actual creator. Use short sections, ordinary text, narrow tables and readable code. Explain uncertainty rather than inventing facts.

Define each figure with a unique id, meaningful alt and caption. Reference it on its own line as ![description](figure:id). Use mermaid for a small relationship or sequence, bars only for supported numbers with units and a source, or image with an already owned uploaded assetId. Never invent chart values. Raw HTML, scripts and remote image URLs are unsupported. The tool schema supplies size/count limits.

A draft never sends email and needs no Kindle setup. Return its private download/preview, expiry and material warnings. Artifacts expire after 24 hours and signed links after 15 minutes; this is not a permanent library. Browser/EPUB validation is not Kindle conversion evidence.

## Forward an existing EPUB or PDF

Use send_document with either an owned artifactId or the client's actual host file object: download_url and file_id, optionally mime_type and file_name. Never call create_book to forward an original. Do not rewrite, repair, convert, repackage, change metadata/cover, invent a URL, turn a local path into a remote file, or reconstruct bytes as Base64.

If host file transfer is unsupported, open ${origin}/app for authenticated upload. Oversized originals remain unchanged and downloadable; never shrink them silently or claim an emailed link imports a book.

## Send only when requested

A clear delivery request is required. Saved confirmed destinations belong to the signed-in account; never supply an arbitrary recipient or guess destinationId. The workspace at ${origin}/app manages optional Kindle confirmation, multiple addresses and the default. Creation/download works without destination setup.

Sign-in and consent happen in the client's browser OAuth flow. Never request inbox codes, tokens, cookies or Amazon passwords in chat. A verification book is real mail: establish recipient and purpose and obtain the user's delivery request. Its confirmation code must come from the destination, never logs or storage.

For repeated ordinary intent, reuse the artifact and omit resendOf. Only an explicit additional-copy request permits resendOf. For uncertainty, use get_delivery instead of blindly resending. submitted means provider acceptance, not Amazon import, device receipt or reading; unknown remains uncertain. Preserve original attachment bytes and keep private links private.`;
}
