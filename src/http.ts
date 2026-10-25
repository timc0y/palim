import { PalimError } from './errors.js';
export async function readBytes(request: Request | Response, max: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > max))
    throw new PalimError('FILE_SIZE', 'The input exceeds the supported size.', 413);
  if (!request.body) throw new PalimError('EMPTY_INPUT', 'No file or manuscript was supplied.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max)
        throw new PalimError('FILE_SIZE', 'The input exceeds the supported size.', 413);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}
export async function readJson(request: Request, max: number): Promise<unknown> {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request, max)),
    );
  } catch (e) {
    if (e instanceof PalimError) throw e;
    throw new PalimError('INVALID_JSON', 'Supply valid UTF-8 JSON.');
  }
}
export async function hmac(secret: string, message: string): Promise<string> {
  if (!secret || secret.length < 32)
    throw new PalimError('CONFIGURATION', 'The operator must configure a signing secret.', 503);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function equalToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function checkOrigin(request: Request, origin: string): void {
  if (
    request.headers.get('origin') !== origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new PalimError('ORIGIN', 'Open this action from the Palim site.', 403);
}
export function secureHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  // Native HTML form POSTs inherit this policy; no-referrer turns their Origin into null.
  // Keep private responses' explicit no-referrer policy and never send referrers cross-origin.
  if (!headers.has('Referrer-Policy'))
    headers.set(
      'Referrer-Policy',
      headers.get('Content-Type')?.startsWith('text/html') ? 'same-origin' : 'no-referrer',
    );
  headers.set('X-Frame-Options', 'DENY');
  if (!headers.has('Content-Security-Policy'))
    headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export async function guardAuthentication(request: Request, limiter: RateLimit): Promise<Request> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/auth/') && !path.startsWith('/oauth/') && path !== '/authorize')
    return request;
  // A coarse pre-identity control, not a global sending or spending guarantee.
  const outcome = await limiter.limit({
    key: request.headers.get('CF-Connecting-IP') ?? 'unidentified',
  });
  if (!outcome.success)
    throw new PalimError(
      'AUTH_RATE_LIMIT',
      'Too many authentication requests. Try again after a minute.',
      429,
    );
  if (request.method === 'POST')
    return new Request(request, {
      body: new Uint8Array(await readBytes(request, 32 * 1024)).buffer,
    });
  return request;
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
