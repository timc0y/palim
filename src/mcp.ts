import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { BookSchema, LIMITS, ReceiptSchema } from './schema.js';
import { Palim } from './service.js';
import { publicError, PalimError } from './errors.js';
import { readBytes } from './http.js';
import type { Env } from './types.js';

export const ToolSendSchema = z
  .object({
    artifactId: z.uuid().optional(),
    file: z
      .object({
        download_url: z.url().max(8192),
        file_id: z.string().min(1).max(256),
        mime_type: z.string().max(160).optional(),
        file_name: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    resendOf: z.uuid().optional(),
    destinationId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (v) => !!v.artifactId !== !!v.file,
    'Supply either an existing Palim artifact or one host-provided file.',
  );
export function makeMcp(env: Env, owner: string, scopes: string[]) {
  const server = new McpServer(
    { name: 'palim', version: '0.1.0' },
    {
      instructions: `Palim works through this connection alone; no separate skill installation is required. The agent researches and writes; Palim publishes supplied manuscripts or forwards existing EPUB/PDF files unchanged. For a new edition, use create_book with title, language and chapters [{title, markdown}]. Include source-backed explanations and HTTPS sources. Figures need a defined id, alt and caption, referenced on its own line as ![description](figure:id). Use mermaid for small relationships, bars only for supported numeric data with units/source, or an already owned image asset. Never invent data or fetch a private repository into Palim. A draft never authorizes email. Return its private download/preview and material warnings; artifacts expire after 24 hours and signed links after 15 minutes. Only a clear delivery request authorizes send_document. Forward originals without editing, conversion, repackaging, invented download URLs or Base64 reconstruction. Use the client's actual host file object, or an owned artifactId. If host transfer is unsupported, direct the user to ${env.ORIGIN}/app for authenticated upload. Saved confirmed destinations belong to the signed-in account; never supply an arbitrary recipient or guess a destinationId. The same workspace manages optional Kindle setup and multiple saved addresses. Creation/download needs no Kindle setup. Let the user sign in through the client's OAuth browser flow; never request inbox codes, tokens or Amazon passwords in chat. Verification books are real email and require a requested recipient/purpose, not automatic setup testing. Repeated ordinary sends use the original artifact and omit resendOf. Only an explicit additional-copy request permits resendOf. For uncertainty use get_delivery; never blindly retry. submitted means provider acceptance, not Amazon import or device delivery; unknown remains uncertain. Keep private download links private.`,
    },
  );
  const palim = new Palim(env);
  const run = async (scope: string, work: () => Promise<unknown>) => {
    try {
      if (!scopes.includes(scope))
        throw new PalimError(
          'SCOPE_REQUIRED',
          `Reconnect and grant ${scope} to use this operation.`,
          403,
        );
      const value = await work();
      return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
    } catch (e) {
      const p = publicError(e);
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: JSON.stringify({ code: p.code, message: p.message }) },
        ],
      };
    }
  };
  server.registerTool(
    'create_book',
    {
      title: 'Create an illustrated EPUB',
      description:
        'Build a new EPUB from a supplied manuscript. This writes a private temporary artifact, never sends mail. Works without a separate skill: supply title, language and chapters [{title, markdown}]. Use sources and ![description](figure:id) for defined figures. Return download/preview and warnings. No Kindle setup is needed. Does not fetch repositories or call an authoring model.',
      inputSchema: BookSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => run('books:write', () => palim.create(owner, input)),
  );
  server.registerTool(
    'send_document',
    {
      title: 'Send a book unchanged',
      description:
        'Send an owned EPUB/PDF artifact or supported host-provided file to your confirmed Kindle destination. Preserves the attachment bytes, title and cover; never edits or repacks. Only use when the user requests delivery. Repeats return the original receipt. resendOf is only for an explicitly requested new copy. If setup or host transfer is unavailable, open the Palim workspace; never request a separate skill install. Provider acceptance is not Kindle import.',
      inputSchema: ToolSendSchema,
      _meta: {
        'openai/fileParams': ['file'],
        securitySchemes: [{ type: 'oauth2', scopes: ['books:send'] }],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      run('books:send', async () => {
        const artifactId =
          input.artifactId ??
          (
            await palim.importHostFile(owner, {
              download_url: input.file!.download_url,
              filename: input.file!.file_name || 'reading',
            })
          ).artifactId;
        return palim.send(owner, artifactId, input.resendOf, input.destinationId);
      }),
  );
  server.registerTool(
    'get_delivery',
    {
      title: 'Read a delivery receipt',
      description:
        'Read the latest submission evidence for one owned delivery. Does not resend, access your Amazon library or claim that a book was read.',
      inputSchema: ReceiptSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      run('books:read', async () => {
        const { publicReceipt } = await import('./service.js');
        return publicReceipt(await palim.store.delivery(owner, input.deliveryId));
      }),
  );
  return server;
}
export async function mcpFetch(
  request: Request,
  env: Env,
  owner: string,
  scopes: string[],
): Promise<Response> {
  await new Palim(env).store.user(owner);
  if (request.headers.has('origin') && request.headers.get('origin') !== env.ORIGIN)
    return new Response('Origin not allowed', { status: 403 });
  let bounded = request;
  if (request.method === 'POST') {
    const bytes = await readBytes(request, LIMITS.manuscript * 2);
    bounded = new Request(request, { body: new Uint8Array(bytes).buffer });
  }
  const server = makeMcp(env, owner, scopes),
    transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    const result = await transport.handleRequest(bounded);
    const body = await result.arrayBuffer();
    return new Response(body.byteLength ? body : null, {
      status: result.status,
      headers: result.headers,
    });
  } finally {
    await server.close();
  }
}
