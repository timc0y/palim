# Simple

## Reality

- Tim authorised the public `timc0y/palim` repository and implementation on 25 October 2026. The product name is Palim; previous Readparcel planning is background.
- Intended users create illustrated reading guides through an existing agent or forward existing EPUB/PDF files unchanged. Hosted use is intended to be free within limits.
- Existing external users, deployment, retained production data and device compatibility are unknown at repository creation.

## Preserve

- Forwarded bytes are unchanged; no implicit authoring, repair, conversion or branding.
- Creating a draft does not send email. Destination access, artifact ownership and user authority are checked at delivery.
- An uncertain send is never blindly retried. Provider submission is not Kindle receipt.
- Private books and credentials stay out of Git and logs. Input size, rendering work and sending are bounded.

## Current boundary

The initial commit establishes product constraints, not a running product. Implementation and verification will update this profile. Cloudflare Email is the requested delivery provider; no alternate provider or server-side LLM is required.

## Ordinary paths

The agent owns research and authorship; one publishing core will own EPUB output; one delivery owner will own unchanged forwarding and receipts. `docs/verification.md` will own executed proof and remaining deployment/device checks.

## Proof

No implementation checks have run at this initial commit. Tests must cover EPUB structure, original attachment hashes, tenant isolation, quotas and uncertain-send recovery. Real email and physical Kindle tests require their own evidence.

## Reconsider when

A representative bounded book cannot fit the chosen runtime; a real supported client needs a new adapter; measured publishing defects justify an additional component; or external users establish a compatibility obligation.
