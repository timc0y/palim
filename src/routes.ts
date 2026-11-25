import { changeToken } from './personal-token.js';
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
  if (download && request.method === 'GET') {
    try {
      return await palim.download(request, download[1]!, download[2]!);
    } catch (error) {
      if (
        !(error instanceof PalimError) ||
        !['LINK_EXPIRED', 'ACCESS_DENIED', 'ARTIFACT_NOT_FOUND'].includes(error.code) ||
        !request.headers.get('Accept')?.includes('text/html')
      )
        throw error;
      const fileUnavailable = error.code === 'ARTIFACT_NOT_FOUND';
      const title = fileUnavailable ? 'File unavailable' : 'Link unavailable';
      const shelfAction = {
        preview: 'Find preview on Shelf',
        source: 'Find manuscript on Shelf',
        file: 'Find download on Shelf',
      }[download[2] as 'preview' | 'source' | 'file'];
      const guidance = fileUnavailable
        ? 'This file is no longer on Shelf.'
        : 'Private links last 15 minutes. Files expire 24 hours after creation or upload.';
      const actions = fileUnavailable
        ? '<div class="consent-actions"><a class="button secondary" href="/app#create-panel">Recreate from manuscript</a><a class="button secondary" href="/app#upload-panel">Upload original file</a></div><p class="shared-link-help">If someone shared this file with you, ask them for another copy.</p>'
        : `<a class="button" href="/app?file=${download[1]}&amp;part=${download[2]}#files-panel">${shelfAction}</a><p class="shared-link-help">For a shared file, ask the sender for a new link.</p>`;
      return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Palim</title><meta name="theme-color" content="#eeeeea"><link rel="icon" href="/mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"></head><body><main class="consent file-recovery"><a class="wordmark" href="/" aria-label="Palim home"><img src="/mark.svg" width="24" height="24" alt="">Palim</a><h1>${title}</h1><p>${guidance}</p>${actions}</main></body></html>`,
        {
          status: error.status,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
            'X-Robots-Tag': 'noindex',
            Vary: 'Accept',
          },
        },
      );
    }
  }
  if (path.startsWith('/api/')) {
    const { id: owner, email } = await requireSession(request, env);
    if (!['GET', 'HEAD'].includes(request.method)) checkOrigin(request, env.ORIGIN);
    if (path === '/api/mcp-token' && ['POST', 'DELETE'].includes(request.method))
      return changeToken(owner, request.method, env);
    if (path === '/api/account' && request.method === 'GET')
      return json({ ...(await palim.account(owner)), email });
    if (path === '/api/account' && request.method === 'DELETE') {
      await palim.deleteAccount(owner);
      return new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': '__Host-palim=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
        },
      });
    }
    const grant = /^\/api\/oauth-grants\/([^/]+)$/.exec(path);
    if (grant && request.method === 'DELETE') {
      let grantId: string;
      try {
        grantId = decodeURIComponent(grant[1]!);
      } catch {
        throw new PalimError('INVALID_REQUEST', 'Invalid connected agent identifier.');
      }
      return json(await palim.revokeGrant(owner, grantId));
    }
    if (path === '/api/books' && request.method === 'POST')
      return json(await palim.create(owner, await readJson(request, LIMITS.manuscript * 2)), 201);
    if (path === '/api/files' && request.method === 'POST') {
      const encoded = request.headers.get('X-Filename-Encoded');
      let filename = request.headers.get('X-Filename') ?? 'reading';
      if (encoded !== null) {
        try {
          filename = decodeURIComponent(encoded);
        } catch {
          throw new PalimError('INVALID_FILENAME', 'Choose a file with a valid filename.');
        }
      }
      return json(
        await palim.upload(
          owner,
          await readBytes(request, LIMITS.upload),
          filename,
          new URL(request.url).searchParams.get('kind') === 'image',
        ),
        201,
      );
    }
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
    if (path === '/api/destinations' && request.method === 'POST') {
      const value = z
        .object({ email: z.string(), label: z.string().optional() })
        .strict()
        .safeParse(await readJson(request, 1024));
      if (!value.success) throw new PalimError('INVALID_REQUEST', 'Enter your Kindle address.');
      return json(await palim.saveDestination(owner, value.data.email, value.data.label));
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
  const asset = await env.ASSETS.fetch(request);
  if (path.startsWith('/fonts/') && path.endsWith('.woff2') && asset.ok) {
    // Public fonts are anonymous resources, including in an opaque-origin preview sandbox.
    const headers = new Headers(asset.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(asset.body, { status: asset.status, headers });
  }
  return asset;
}
