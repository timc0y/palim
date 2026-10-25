import { z } from 'zod';
import { authRoute, requireSession } from './auth.js';
import { Palim, publicReceipt } from './service.js';
import { checkOrigin, json, readBytes, readJson } from './http.js';
import { PalimError } from './errors.js';
import { LIMITS, SendSchema } from './schema.js';
import type { Env } from './types.js';
export async function appFetch(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const auth = await authRoute(request, env);
  if (auth) return auth;
  const palim = new Palim(env);
  const download = /^\/download\/([a-f0-9-]{36})\/(file|source|preview)$/.exec(path);
  if (download && request.method === 'GET')
    return palim.download(request, download[1]!, download[2]!);
  if (path.startsWith('/api/')) {
    const owner = await requireSession(request, env);
    if (!['GET', 'HEAD'].includes(request.method)) checkOrigin(request, env.ORIGIN);
    if (path === '/api/account' && request.method === 'GET')
      return json(await palim.account(owner));
    if (path === '/api/books' && request.method === 'POST')
      return json(await palim.create(owner, await readJson(request, LIMITS.manuscript * 2)), 201);
    if (path === '/api/files' && request.method === 'POST')
      return json(
        await palim.upload(
          owner,
          await readBytes(request, LIMITS.upload),
          request.headers.get('X-Filename') ?? 'reading',
          new URL(request.url).searchParams.get('kind') === 'image',
        ),
        201,
      );
    if (path === '/api/send' && request.method === 'POST') {
      const value = SendSchema.safeParse(await readJson(request, 2048));
      if (!value.success) throw new PalimError('INVALID_REQUEST', 'Choose a document to send.');
      return json(
        await palim.send(
          owner,
          value.data.artifactId,
          value.data.resendOf,
          value.data.destinationId,
        ),
      );
    }
    if (path === '/api/destination' && request.method === 'POST') {
      const value = z
        .object({ email: z.string(), label: z.string().trim().min(1).max(40).default('My reader') })
        .strict()
        .safeParse(await readJson(request, 1024));
      if (!value.success) throw new PalimError('INVALID_REQUEST', 'Enter your Kindle address.');
      return json(await palim.challenge(owner, value.data.email, value.data.label));
    }
    if (path === '/api/confirm' && request.method === 'POST') {
      const value = z
        .object({ code: z.string().max(100) })
        .strict()
        .safeParse(await readJson(request, 1024));
      if (!value.success) throw new PalimError('INVALID_REQUEST', 'Enter the confirmation code.');
      return json(await palim.confirm(owner, value.data.code));
    }
    const receipt = /^\/api\/deliveries\/([a-f0-9-]{36})$/.exec(path);
    if (receipt && request.method === 'GET')
      return json(publicReceipt(await palim.store.delivery(owner, receipt[1]!)));
    const file = /^\/api\/files\/([a-f0-9-]{36})$/.exec(path);
    if (file && request.method === 'DELETE') return json(await palim.remove(owner, file[1]!));
    const reader = /^\/api\/destinations\/([a-f0-9-]{36})(\/default)?$/.exec(path);
    if (reader && reader[2] && request.method === 'POST') {
      await palim.store.defaultReader(owner, reader[1]!);
      return json({ updated: true });
    }
    if (reader && !reader[2] && request.method === 'DELETE') {
      await palim.store.removeReader(owner, reader[1]!);
      return json({ deleted: true });
    }
    throw new PalimError('NOT_FOUND', 'No such operation.', 404);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405 });
  return env.ASSETS.fetch(request);
}
