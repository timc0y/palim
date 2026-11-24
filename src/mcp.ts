import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { BookSchema, LIMITS, ReceiptSchema } from './schema.js';
import { Palim, publicReceipt } from './service.js';
import { publicError, PalimError } from './errors.js';
import { publicFileUrl } from './file-url.js';
import { readBytes } from './http.js';
import { agentGuide } from './guide.js';
import type { Env } from './types.js';

const HostFileSchema = z
  .object({
    download_url: z.url().max(8192).describe('The client-provided public HTTPS download URL.'),
    file_id: z
      .string()
      .min(1)
      .max(256)
      .describe('The host file identifier; not a Palim artifact ID.'),
    mime_type: z
      .string()
      .max(160)
      .optional()
      .describe('The host-reported MIME type, when available.'),
    file_name: z.string().max(200).optional().describe('The original file name, when available.'),
  })
  .strict();
export const ToolSendSchema = z
  .object({
    artifactId: z.uuid().optional(),
    file: HostFileSchema.optional(),
    resendOf: z.uuid().optional(),
    destinationId: z
      .uuid()
      .optional()
      .describe(
        'A saved destination ID confirmed to match the user’s requested recipient. Omit to use the account default.',
      ),
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
      const result = {
        content: [
          {
            type: 'text' as const,
            text: typeof value === 'string' ? value : JSON.stringify(value),
          },
        ],
      };
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? { ...result, structuredContent: value as Record<string, unknown> }
        : result;
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
    'get_artifact',
    {
      title: 'Refresh an artifact’s private links',
      description:
        'Get fresh download and preview links for one owned, unexpired artifact. Keeps its artifact ID, bytes and content unchanged; does not render, import or send. The linksExpireAt field is separate from the artifact’s 24-hour expiresAt.',
      inputSchema: z
        .object({
          artifactId: z
            .uuid()
            .describe('The ID returned when the artifact was created or uploaded.'),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ artifactId }) =>
      run('books:read', async () =>
        palim.artifactResult(await palim.store.artifact(owner, artifactId)),
      ),
  );
  server.registerTool(
    'create_book',
    {
      title: 'Create an illustrated EPUB',
      description:
        'Create a private illustrated EPUB from the supplied manuscript. Example: {"title":"A short guide","language":"en","chapters":[{"title":"Start","markdown":"A clear first page."}]}. Returns artifact ID, private links, expiry and warnings. Never sends mail.',
      inputSchema: BookSchema.describe(
        'The complete manuscript and optional metadata/figures used to render a new EPUB. The supplied manuscript is authored by the agent; Palim does not infer or add content.',
      ),
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
    'list_destinations',
    {
      title: 'List saved Kindle destinations',
      description:
        'List this signed-in account’s saved destination labels and IDs; the stored email field is omitted. Use only when a label clearly matches the recipient requested by the user; otherwise ask the user to choose in Settings. Read-only; never sends mail.',
      inputSchema: z.object({}).strict(),
      _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['books:send'] }] },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      run('books:send', async () => {
        const user = await palim.store.user(owner);
        const destinations = (await palim.store.readers(owner)).map(({ id, label }) => ({
          id,
          label,
          isDefault: id === user.default_destination_id,
        }));
        return {
          destinations,
          defaultDestinationId:
            destinations.find((destination) => destination.isDefault)?.id ?? null,
          setupUrl: `${env.ORIGIN}/app#studio-settings`,
        };
      }),
  );
  server.registerTool(
    'import_image',
    {
      title: 'Import an image for a book',
      description:
        'Import a client-provided PNG or JPEG as a private temporary figure asset. Returns an owned artifactId for create_book. Uses the shared upload allowance; never sends mail.',
      inputSchema: z.object({ file: HostFileSchema }).strict(),
      _meta: {
        'openai/fileParams': ['file'],
        securitySchemes: [{ type: 'oauth2', scopes: ['books:write'] }],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ file }) =>
      run('books:write', () =>
        palim.importHostFile(
          owner,
          {
            download_url: file.download_url,
            filename: file.file_name || 'image',
          },
          true,
        ),
      ),
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
        if (!input.artifactId) {
          publicFileUrl(input.file!.download_url);
          await palim.verifyDestination(owner, input.destinationId);
        }
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
