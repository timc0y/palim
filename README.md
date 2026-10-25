# palim.

**From thought to page.**

An open-source agent publishing tool by Tim Coy. Create illustrated EPUBs from a supplied manuscript, or forward an existing EPUB/PDF without changing its bytes. Delivery uses Cloudflare Email.

## Build status

Implementation is in progress. No public deployment, live email delivery or physical Kindle test is claimed by this initial commit. Verification evidence will be recorded in `docs/verification.md` as checks actually run.

## Product boundary

Your agent researches and writes. Palim formats and packages. The delivery service sends to a registered destination. Amazon controls conversion and library state; email acceptance is not proof that a book appeared on Kindle.

Existing books must never be rewritten, repaired, recompressed, watermarked or given new metadata while forwarding. Their original bytes are the product contract.

MIT licensed. Independently built; not affiliated with Amazon or Kindle.
