# Dependency ownership

The production versions are fixed in package.json and the committed lockfile. These direct dependency licences were inspected from the installed package metadata on 25 October 2026.

- `@cloudflare/workers-oauth-provider`: MCP OAuth, consent, PKCE and token storage. MIT.
- `@modelcontextprotocol/sdk`: MCP schemas, client contract and HTTP transport. MIT.
- `@octokit/oauth-methods`: GitHub identity-only OAuth code exchange. MIT.
- `@octokit/request`: bounded transport for that exchange. MIT.
- `@xmldom/xmldom`: bounded XML metadata and generated-XHTML parsing. MIT.
- `jszip`: ZIP creation and bounded entry streaming. MIT or GPL-3.0-or-later; Palim uses the MIT option.
- `markdown-it`: restricted Markdown rendering. MIT.
- `pele`: Mermaid parsing and SVG layout. MIT.
- `zod`: input and boundary validation. MIT.

Dependencies retain their own notices. Palim does not copy or redistribute a commercial typeface; the website and generated SVG use system font families. GitHub Actions downloads a checksum-pinned EPUBCheck distribution for validation, not for inclusion in the Worker.

The initial audit identified outdated XML, Markdown and schema-validation versions. Those pins were patched before the release gate. The unsupported Arctic adapter was replaced with the maintained Octokit boundary. `npm audit --omit=dev --audit-level=high` is a blocking CI check, not a substitute for source review or a guarantee against future vulnerabilities.

Only one package owns each operation. New packages must remove supported integration or maintenance work rather than create a second publishing or delivery path.
