# palim.

**From thought to page.**

[![Checks](https://github.com/timc0y/palim/actions/workflows/checks.yml/badge.svg)](https://github.com/timc0y/palim/actions/workflows/checks.yml)
[MIT](LICENSE) · [Deploy your own](docs/deployment.md) · [Verification](docs/verification.md) · [Agent skill](skills/palim/SKILL.md)

Turn conversations, code and complex ideas into illustrated EPUBs. Or send an existing EPUB/PDF to your reader **without changing its bytes**.

An independent open-source project by [Tim Coy](https://timcoy.uk). Not affiliated with Amazon or Kindle.

## What works in the implementation

- A bounded EPUB publisher: chapters, title/creator/language metadata, automatic cover, Mermaid diagrams, labelled bar charts, uploaded PNG/JPEG figures, source notes and table of contents.
- A responsive reading workspace: create a draft, preview/download it, export the manuscript, upload an original, confirm a reader and inspect a delivery receipt.
- Three OAuth-protected MCP tools: `create_book`, `send_document`, `get_delivery`.
- Cloudflare Email submission with attachment hashes, registered destinations, atomic sending allowances and no blind retry after an uncertain outcome.
- Private temporary files, expiring download links, isolated accounts and scheduled cleanup.

**Release boundary:** the source and local runtime are tested; a public hosted deployment, real GitHub account sign-in, Cloudflare mail submission and physical Kindle import are not claimed. Resource IDs and the sender in `wrangler.jsonc` are deliberate placeholders. [The verification record](docs/verification.md) distinguishes each check.

## Try the publisher locally

Use Node 22.16 or later.

```sh
npm ci
npm run check
npm run example
```

The example produces `artifacts/palim-sample.epub`, a browser preview and an editable JSON manuscript. It requires no AI key, provider account or email sending. The sample chart is explicitly hypothetical.

```sh
npm run build    # generate public example files and bundle Worker without deployment
npm run dev      # local Worker and website; sign-in still needs configured OAuth
```

The local website is at `http://localhost:8787`. A usable authenticated hosted instance requires the [deployment setup](docs/deployment.md). There is no hidden test login in product code.

## Connect your agent

Deploy one instance, then connect its canonical `/mcp` address using OAuth. Install the canonical `skills/palim` instructions in a host that supports Agent Skills. The repository includes a portable Agent Plugins manifest, not a published marketplace listing.

```sh
npm run plugin -- https://your-real-palim-host
```

This packages the skill with your endpoint in `.local/plugin`. It does not deploy, register or publish the plugin. Client support must be tested through that client's actual connection flow; an official SDK protocol test is not proof of every host.

| Tool            | Responsibility                                                      |
| --------------- | ------------------------------------------------------------------- |
| `create_book`   | Publish the agent's supplied manuscript. A draft never sends email. |
| `send_document` | Deliver an owned artifact or supported host file, unchanged.        |
| `get_delivery`  | Read submission evidence without resending.                         |

Examples:

> Explain this architectural decision with a worked example and a small diagram. Make a reading edition, but do not send it yet.

> Send this existing EPUB to my confirmed reader. Do not change its title, cover or contents.

> Did the previous submission finish? Read its receipt; do not send another copy.

## Original means original

Forwarding never calls the publisher. The service inspects bounded metadata, stores the original bytes, checks their SHA-256 hash and attaches those same bytes. It does not repair, recompress, watermark, rewrite or change embedded metadata. The email attachment filename is sanitised to prevent header injection.

Amazon may convert what it imports. Palim cannot control that representation, replace an old Kindle personal document in place, transfer highlights or read your library. Oversized originals stay downloadable; they are not silently made smaller.

## Limits worth knowing

Uploads: 20 MiB. Cloudflare ordinary email: 5 MiB including encoding and headers, with a conservative admission calculation. Some valid uploads therefore cannot be emailed. Sources: at most 24 chapters and 12 figures, with bounded text, diagrams and decoded image dimensions.

Private files expire after 24 hours; download links after 15 minutes. Accounts default to two renders, six uploads and three email submissions per UTC day. Shared quotas also apply. These controls are not a guarantee of a zero provider bill.

The hosted service processes your manuscript/file. Cloudflare and Amazon process requested deliveries. There is no server-side writing model or repository crawler. See [privacy](public/privacy.html) and [deployment](docs/deployment.md).

## Development

```sh
npm run check
npm run format:check
npm run build
```

Tests use real SQLite for the application's D1 queries and explicit doubles for external R2/email operations. Separate runtime checks exercise local workerd, D1, R2, OAuth PKCE and MCP. CI validates the generated sample with a checksum-pinned EPUBCheck distribution.

Implementation owners and limits are in [SIMPLE.md](SIMPLE.md) and [architecture](docs/architecture.md). Report vulnerabilities as described in [SECURITY.md](SECURITY.md).
