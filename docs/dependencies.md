# Dependency ownership

The production versions are fixed in package.json and the committed lockfile. These direct dependency licences were inspected from the installed package metadata on 25 October 2026.

- `@cloudflare/workers-oauth-provider`: MCP OAuth, consent, PKCE and token storage. MIT.
- `@modelcontextprotocol/sdk`: MCP schemas, client contract and HTTP transport. MIT.
- `better-auth` 1.7.12: email-code identity, native D1 sessions, encrypted OTP storage and database rate limiting. MIT. It replaces the GitHub adapter and custom session tables rather than adding a second session owner.
- `@xmldom/xmldom`: bounded XML metadata and generated-XHTML parsing. MIT.
- `jszip`: ZIP creation and bounded entry streaming. MIT or GPL-3.0-or-later; Palim uses the MIT option.
- `markdown-it`: restricted Markdown rendering. MIT.
- `pele`: Mermaid parsing and SVG layout. MIT.
- `zod`: input and boundary validation. MIT.

Dependencies retain their own notices. The website self-hosts Instrument Serif regular/italic from Google Fonts under the included SIL Open Font License (`public/fonts/OFL.txt`); body controls and generated book SVG retain system-font fallbacks. GitHub Actions downloads a checksum-pinned EPUBCheck distribution for validation, not for inclusion in the Worker.

The initial audit identified outdated XML, Markdown and schema-validation versions. Those pins were patched before the release gate. The unsupported Arctic adapter was replaced with the maintained Octokit boundary. `npm audit --omit=dev --audit-level=high` is a blocking CI check, not a substitute for source review or a guarantee against future vulnerabilities.

Only one package owns each operation. New packages must remove supported integration or maintenance work rather than create a second publishing or delivery path.
