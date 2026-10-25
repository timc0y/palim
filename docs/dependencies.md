# Dependency ownership

The production versions are fixed in package.json and the committed lockfile. The following direct dependency licences were inspected from the installed package metadata on 25 October 2026.

| Dependency | Responsibility | Licence |
| --- | --- | --- |
| @cloudflare/workers-oauth-provider | MCP OAuth protocol, consent, PKCE and token storage | MIT |
| @modelcontextprotocol/sdk | MCP schemas, client contract and HTTP transport | MIT |
| @octokit/oauth-methods | GitHub's identity-only OAuth code exchange | MIT |
| @octokit/request | Bounded request transport for that exchange | MIT |
| @xmldom/xmldom | Bounded XML metadata and generated-XHTML parsing | MIT |
| jszip | ZIP container creation and bounded entry streaming | MIT or GPL-3.0-or-later; Palim uses the MIT option |
| markdown-it | Restricted Markdown rendering | MIT |
| pele | Mermaid diagram parsing and SVG layout | MIT |
| zod | Input and boundary validation | MIT |

Dependencies retain their own notices. Palim does not copy or redistribute a commercial typeface; the website and generated SVG use system font families. GitHub Actions downloads a checksum-pinned EPUBCheck distribution for validation, not for inclusion in the Worker.

The initial audit identified outdated XML, Markdown and schema-validation versions. Those pins were patched before the release gate. The unsupported Arctic adapter was replaced with the maintained Octokit boundary. `npm audit --omit=dev --audit-level=high` is a blocking CI check, not a substitute for source review or a guarantee against future vulnerabilities.

Only one package owns each operation. New packages must remove supported integration or maintenance work rather than create a second publishing or delivery path.
