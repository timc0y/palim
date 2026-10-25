# palim

**Make room for reading.**

[![Checks](https://github.com/timc0y/palim/actions/workflows/checks.yml/badge.svg)](https://github.com/timc0y/palim/actions/workflows/checks.yml)
[Open Palim](https://palim-timc0y.pages.dev) · [MIT](LICENSE) · [Deploy your own](docs/deployment.md) · [Verification](docs/verification.md) · [Connect Palim](#connect-palim)

Turn conversations, code and complex ideas into illustrated EPUBs. Or send an existing EPUB/PDF to your reader **without changing its bytes**.

An independent open-source project by [Tim Coy](https://timcoy.uk). Not affiliated with Amazon or Kindle.

## What works in the implementation

- A bounded EPUB publisher: chapters, title/creator/language metadata, automatic cover, Mermaid diagrams, labelled bar charts, uploaded PNG/JPEG figures, source notes and table of contents.
- A responsive reading workspace: create a draft, preview/download it, export the manuscript, upload an original, sign in by email code, save up to five labelled confirmed Kindle addresses, choose a default and inspect an honest delivery receipt.
- Three OAuth-protected MCP tools: `create_book`, `send_document`, `get_delivery`.
- Cloudflare Email submission with attachment hashes, registered destinations, atomic sending allowances and no blind retry after an uncertain outcome.
- Private temporary files, expiring download links, isolated accounts and scheduled cleanup.

**Release boundary:** source checks and captured-mail runtime proofs do not establish live inbox delivery or Kindle import. The app is deployed at the linked Pages hostname with dedicated resources and a verified sender. [The verification record](docs/verification.md) owns the exact deployed revision and observed results.

## Try the publisher locally

Use Node 22.16 or later.

```sh
npm ci
npm run check
npm run example
```

The example produces `artifacts/palim-sample.epub`, a browser preview and an editable JSON manuscript. It requires no AI key, provider account or email sending. The sample chart shows calculated exposure ratios, not measured camera data.

```sh
npm run build    # generate public example files and bundle Worker without deployment
npm run dev      # local Worker and website; sign-in needs dedicated secrets and an email boundary
```

The local website is at `http://localhost:8787`. A usable authenticated hosted instance requires the [deployment setup](docs/deployment.md). There is no hidden test login in product code.

## Connect Palim

Connect once, sign in and use Palim. No separate skill installation is required. Creating and downloading a reading edition needs no Kindle setup; sending is a separate requested action.

### ChatGPT

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select **+ → Add custom MCP server** and name it Palim.
2. Enter `https://palim-timc0y.pages.dev/mcp`, choose OAuth, review the connection warning and select **Create as a plugin**.
3. Complete Palim sign-in in the browser and approve consent. Start a new conversation with Palim enabled.

Availability and workspace policies depend on your account. This is a custom connection, not a public-directory listing. The server carries essential guidance and schemas, so this path does not require an additional skill. Do not paste inbox codes or tokens into chat.

### Codex

Install **one complete plugin**, which includes the connection, editorial workflow and setup guidance automatically. With a current Codex client:

```sh
codex plugin marketplace add timc0y/palim --ref main
codex plugin add palim@palim
```

The first command registers this repository's catalog; the second installs the single plugin. Complete the client's OAuth connection/sign-in when requested. Do not also add a separate Palim MCP or skill. In supported desktop clients, open this repository's marketplace in the plugin browser and install Palim once. Client discovery and actual authenticated use are separate checks; see [verification](docs/verification.md).

[Download the complete plugin ZIP](https://palim-timc0y.pages.dev/palim-plugin.zip) · [SHA-256](https://palim-timc0y.pages.dev/palim-plugin.sha256)

The archive is an inspectable Codex compatibility package, not an invented one-click installer or a public-directory listing. Use a client that supports its package format. It contains no credentials. For a self-hosted deployment, generate the same bundle with your actual origin:

```sh
npm run plugin -- https://your-real-palim-host
```

The source is `plugins/palim/`; `.agents/plugins/marketplace.json` exposes it as one repository plugin. The command writes the complete ZIP and checksum to `public/` and `artifacts/`, without installing, authorizing or publishing anything. [Official packaging](https://developers.openai.com/plugins/build/plugins/) and [connection/testing guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt/) describe the supported flows. Other clients need their own compatibility verification.

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
