import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { BookSchema, LIMITS, ReceiptSchema } from './schema.js';
import { Palim } from './service.js';
import { publicError, PalimError } from './errors.js';
import { readBytes } from './http.js';
import { agentGuide } from './guide.js';
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
      instructions: agentGuide(env.ORIGIN),
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
      return {
        content: [
          {
            type: 'text' as const,
            text: typeof value === 'string' ? value : JSON.stringify(value),
          },
        ],
      };
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
    'get_guide',
    {
      title: 'Read the Palim agent guide',
      description:
        'Read the authoring, unchanged-file and delivery guide before creating or sending a book. Read-only; no mail or data changes.',
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => run('books:read', async () => agentGuide(env.ORIGIN)),
  );
  server.registerTool(
    'create_book',
    {
      title: 'Create an illustrated EPUB',
      description:
        'Create a private temporary EPUB from supplied title, language and chapters [{title, markdown}]. Read get_guide for authoring and figures. Return download/preview, expiry and warnings. Never sends mail; no Kindle setup needed.',
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
        'Send an owned EPUB/PDF artifact or host file unchanged to a selected saved Kindle address, only when requested. Read get_guide for file transfer and setup. Repeated intent returns its receipt; resendOf requires an explicit additional copy. Acceptance is not Kindle import.',
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
