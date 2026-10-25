# Security

Palim processes private documents and can send email. Do not post manuscripts, reader addresses, verification codes, access tokens, provider responses or exploit payloads containing another person's data in public issues.

Use GitHub's private vulnerability reporting when enabled on this repository. Otherwise contact the maintainer through the contact route on https://timcoy.uk and ask for a private reporting channel before sharing sensitive detail. Do not assume public issue creation is private.

Reports should identify the affected revision, the smallest reproducible case using synthetic data, expected versus actual behaviour, and the trust boundary crossed. Do not send test mail to addresses you do not control or probe another operator's deployment without permission.

Security controls are enforced in code: account ownership, constrained recipient selection, bounded inputs and archive metadata, explicit host allowlists, same-origin browser actions, maintained OAuth, secret-safe errors and atomic allowance claims. A language model is not a security boundary.

A source review or passing test suite is not a claim of external audit, safe production configuration, successful email delivery or device support. Deployment obligations are in docs/deployment.md.
