# palim

Turn a conversation into an illustrated EPUB, or forward an existing EPUB or PDF to a Kindle
address without changing a byte of it. No model runs inside the service.

[![Checks](https://github.com/timc0y/palim/actions/workflows/checks.yml/badge.svg)](https://github.com/timc0y/palim/actions/workflows/checks.yml)

[Studio](https://palim-timc0y.pages.dev/app) · [Sample](https://palim-timc0y.pages.dev/sample.html) ·
[MIT](LICENSE) · [Connect an agent](#connect-an-agent)

Independent open-source software by [Tim Coy](https://timcoy.uk). Not affiliated with Amazon or
Kindle.

## What Palim does

- Publishes a bounded, illustrated EPUB from a manuscript: title, author, language, chapters,
  Mermaid diagrams, labelled charts, uploaded PNG/JPEG figures, source notes and a table of contents.
- Forwards an existing EPUB or PDF to a Kindle address with its bytes unchanged.
- Keeps up to five labelled Kindle addresses and a personal sender per account. Saving an address
  sends no mail.
- Exposes seven MCP tools for the guide, book creation, image import, private-link recovery,
  saved-recipient discovery, document sending and delivery receipts.
- Keeps every file private and temporary: 24 hours for the file, 15 minutes for a download link.

## Status

The refreshed sample and MCP interface on `main` are not deployed yet. The hosted
instance serves the release identified in the [verification record](docs/verification.md).

The publisher, the unchanged-forwarding path and the MCP connection are exercised in CI. Amazon
import and physical Kindle rendering are not. The [verification record](docs/verification.md)
states what the checks cover.

## Try the publisher locally

Use Node 22.16 or later.

```sh
npm ci
npm run check
npm run example
```

The example produces `artifacts/palim-sample.epub`, a self-contained HTML preview and an editable
JSON manuscript. The HTML opens directly without a server or network. It requires no AI key,
provider account or email sending. The sample chart shows calculated exposure ratios,
not measured camera data.

```sh
npm run build    # generate public example files and bundle Worker without deployment
npm run dev      # local Worker and website; sign-in needs dedicated secrets and an email boundary
```

The local website is at `http://localhost:8787`. A usable authenticated hosted instance requires
the [deployment setup](docs/deployment.md).

## Connect an agent

Connect once and sign in. Your agent reads `get_guide`, then creates a reading edition or forwards
an original unchanged, when you ask.

- There is no skill to install and no setup hook.
- Creating and downloading need no Kindle setup.
- Save up to five Kindle addresses with labels and a default; saving sends no mail.
- Approve your account's exact personal sender once in Amazon. Palim asks for no Kindle code.
- Sending is always a separate, requested action.

### ChatGPT

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select **+ → Add custom MCP server** and
   name it Palim.
2. Enter `https://palim-timc0y.pages.dev/mcp`, choose OAuth, review the connection warning and
   select **Create as a plugin**.
3. Complete Palim sign-in in the browser and approve consent. Start a new conversation with Palim
   enabled.

Availability and workspace policies depend on your account. This is a custom connection, not a
public-directory listing. The server guide explains both workflows; mutation tools independently
enforce authorization, ownership and sending safety. Do not paste inbox codes or tokens into chat.

### Codex

With a current Codex client:

```sh
codex plugin marketplace add timc0y/palim --ref main
codex plugin add palim@palim
```

The first command registers this repository's marketplace; the second installs the single plugin
from it. Complete the client's OAuth connection and sign-in when requested. Do not add a duplicate
Palim connection. Client discovery and actual authenticated use are separate checks; see
[verification](docs/verification.md).

[Download the complete plugin ZIP](https://palim-timc0y.pages.dev/palim-plugin.zip) ·
[SHA-256](https://palim-timc0y.pages.dev/palim-plugin.sha256)

The archive is an inspectable Codex compatibility package. Use a client that supports its package
format. It contains no credentials. For a self-hosted deployment, generate the same bundle with
your actual origin:

```sh
npm run plugin -- https://your-real-palim-host
```

| Tool                | Responsibility                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `get_guide`         | Read the canonical authoring/import guide; no data changes or mail.                                             |
| `get_artifact`      | Refresh private links to an owned, unexpired file without recreating or sending it.                             |
| `import_image`      | Import a client-provided PNG/JPEG for an illustrated book; no mail.                                             |
| `create_book`       | Publish the agent's supplied manuscript. A draft never sends email.                                             |
| `list_destinations` | Read owned Kindle labels, IDs and the default; omits the email field. Requires sending permission; never sends. |
| `send_document`     | Deliver an owned artifact or supported host file, unchanged.                                                    |
| `get_delivery`      | Read submission evidence without resending.                                                                     |

Object results include structured data alongside the same JSON text for clients that use it.
Agents can choose a saved label with `list_destinations`, then pass its ID to `send_document`.
Omitting the ID keeps the existing default-recipient behaviour. Use the studio to resolve
missing or ambiguous setup; discovery never saves an address or sends a document.

Use `get_artifact` when a private link expires. `linksExpireAt` identifies the shared expiry of
the returned links; `expiresAt` is the file's original expiry. Refreshing links does not extend
file retention or consume an upload, render or send.

## Original means original

Forwarding never calls the publisher. The service inspects bounded metadata, stores the original
bytes, verifies their SHA-256 hash and attaches those same bytes. It does not repair, recompress,
watermark, rewrite or change embedded metadata. Amazon may convert what it imports; Palim cannot
control that representation, replace an existing personal document, transfer highlights or read
your library. See [architecture](docs/architecture.md).

## Limits worth knowing

Uploads are 20 MiB; Cloudflare's ordinary email limit is 5 MiB including encoding and headers, so
some valid uploads cannot be emailed. A book holds at most 24 chapters and 12 figures, with images
of at most four million pixels and 8 MiB in total. Files expire after 24 hours and download links
after 15 minutes. Accounts default to two renders, six uploads and three email submissions per UTC
day, with shared ceilings on top.

The hosted service processes your manuscript and Cloudflare and Amazon process requested
deliveries. There is no server-side writing model and no repository crawler. The full statement,
including retention and operator duties, is in
[privacy and limits](https://palim-timc0y.pages.dev/privacy).

## Development

```sh
npm run check
npm run format:check
npm run build
```

`npm run check` rejects unused TypeScript code and checks the syntax of the studio,
landing and Pages JavaScript before running the tests.

Tests use real SQLite for the application's D1 queries and explicit doubles for external R2/email
operations. Separate runtime checks exercise local workerd, D1, R2, OAuth PKCE and MCP. CI
validates the generated sample with a checksum-pinned EPUBCheck distribution.

## Repository map

- `src/book.ts`, `figures.ts`, `archive.ts` — EPUB creation, artwork and original-file inspection.
- `src/book-styles.ts` — shared EPUB and browser-preview styles, also used by the sample build.
- `src/service.ts`, `store.ts`, `mail.ts` — publishing, ownership, allowances and delivery.
- `src/index.ts`, `routes.ts`, `mcp.ts`, `auth.ts`, `login.ts` — HTTP, MCP and identity.
- `public/` — landing, studio, styles and self-hosted assets.
- `pages/` — the thin Pages front door; `migrations/` — the D1 schema.
- `test/`, `scripts/`, `examples/` — behavioural checks, local runtime proofs and the sample book.
- `plugins/palim/` — the optional connection package.

[Architecture](docs/architecture.md) · [Authoring](docs/authoring.md) ·
[Deployment](docs/deployment.md) · [Verification](docs/verification.md) ·
[Design](DESIGN.md) · [Licences](THIRD_PARTY.md) · [Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md)

## Connection troubleshooting

Use the canonical Pages address. If a saved consent screen mentions ORIGIN, start the connection
again from the client instead of replaying that form. Never paste codes, cookies or tokens into an
issue.
