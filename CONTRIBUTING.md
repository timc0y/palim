# Contributing

Read AGENTS.md and SIMPLE.md before changing behaviour. Use Node 22.16 or later, run `npm ci`, and use `npm run check`, `npm run format:check` and `npm run build` before proposing a change.

Use synthetic books and addresses in tests. Never commit a real private book, token, reader address or provider response. Test doubles belong in test fixtures, not hidden production modes. Changes to forwarding must retain byte-identity tests. Changes to delivery must cover concurrent calls and an uncertain provider outcome. Changes to generated EPUB must pass the independent conformance fixture.

Keep the product small: agent authorship, one publisher, one unchanged-forwarding path and one email provider. Add a package when it removes work we otherwise must own, not just because it is popular. Do not add a repository crawler, another model call or a permanent library without a demonstrated requirement.

A useful pull request explains the user-visible change, the owning paths, the failure/recovery behaviour, and exactly which checks ran. Live provider changes and physical Kindle claims need separate evidence.
