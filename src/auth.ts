import { authentication } from './login.js';
import { z } from 'zod';
import { PalimError, invariant } from './errors.js';
import { checkOrigin, equalToken, hmac, readJson, json } from './http.js';
import { escapeXml as e } from './xml.js';
import { Store } from './store.js';
import type { Env } from './types.js';
export function returnPath(value: string | null): string {
  if (
    !value ||
    value.length > 4000 ||
    /[\u0000-\u001f\u007f\\]/.test(value) ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/app';
  const parsed = new URL(value, 'https://palim.invalid');
  return parsed.origin === 'https://palim.invalid' ? parsed.pathname + parsed.search : '/app';
}
export async function session(request: Request, env: Env): Promise<string | null> {
  const current = await authentication(env).api.getSession({ headers: request.headers });
  if (!current) return null;
  await new Store(env.DB).upsertUser(current.user.id, current.user.name);
  return current.user.id;
}
export async function requireSession(request: Request, env: Env): Promise<string> {
  const owner = await session(request, env);
  if (!owner) throw new PalimError('SIGN_IN_REQUIRED', 'Sign in to Palim to continue.', 401);
  return owner;
}
export async function authRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/auth/login' && request.method === 'GET') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/app?returnTo=${encodeURIComponent(returnPath(url.searchParams.get('returnTo')))}`,
        'Cache-Control': 'no-store',
      },
    });
  }
  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    checkOrigin(request, env.ORIGIN);
    const response = await authentication(env).handler(
      new Request(`${env.ORIGIN}/auth/sign-out`, request),
    );
    if (!response.ok) return response;
    const headers = new Headers(response.headers);
    headers.set('Location', '/app');
    return new Response(null, { status: 303, headers });
  }
  if (url.pathname.startsWith('/auth/')) {
    if (
      request.method !== 'POST' ||
      !['/auth/email-otp/send-verification-otp', '/auth/sign-in/email-otp'].includes(url.pathname)
    )
      throw new PalimError('NOT_FOUND', 'No such sign-in operation.', 404);
    checkOrigin(request, env.ORIGIN);
    if (url.pathname === '/auth/email-otp/send-verification-otp') {
      const parsed = z
        .object({
          email: z
            .email()
            .max(254)
            .transform((s) => s.trim().toLowerCase()),
          type: z.literal('sign-in'),
        })
        .strict()
        .safeParse(await readJson(request, 2048));
      if (!parsed.success) throw new PalimError('LOGIN_EMAIL', 'Enter a valid inbox email.', 400);
      const claim = await new Store(env.DB).claimLogin(
        await hmac(env.SIGNING_SECRET, `login\n${parsed.data.email}`),
      );
      if (claim) {
        await authentication(env, claim).handler(
          new Request(request, { body: JSON.stringify(parsed.data) }),
        );
      }
      return json({
        message: 'If a code can be sent, it will arrive shortly. Check your inbox and spam folder.',
      });
    }
    const parsed = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase()),
        otp: z.string().regex(/^\d{6}$/),
      })
      .strict()
      .safeParse(await readJson(request, 2048));
    if (!parsed.success)
      throw new PalimError('LOGIN_CODE', 'Enter the six-digit sign-in code from your inbox.', 400);
    const response = await authentication(env).handler(
      new Request(request, { body: JSON.stringify(parsed.data) }),
    );
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  }
  if (url.pathname === '/authorize') {
    const owner = await session(request, env);
    if (!owner)
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`,
          'Cache-Control': 'no-store',
        },
      });
    if (request.method === 'GET') {
      const auth = await env.OAUTH_PROVIDER.parseAuthRequest(request),
        details = await env.OAUTH_PROVIDER.describeConsent(auth),
        consent = await env.OAUTH_PROVIDER.beginConsent(auth);
      consent.headers.set('Content-Type', 'text/html; charset=utf-8');
      consent.headers.set('Cache-Control', 'no-store');
      const ownerProof = await hmac(env.SIGNING_SECRET, `${owner}\n${consent.handle}`);
      const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Connect your agent · Palim</title><link rel="stylesheet" href="/style.css"/></head><body><main class="consent"><a class="wordmark" href="/">palim<span>.</span></a><p class="eyebrow">AGENT CONNECTION</p><h1>Let your agent<br/><em>turn the page.</em></h1><p><strong>${e(details.clientName)}</strong> requests access to Palim.</p><p>Redirect destination: <strong>${e(details.redirectHost)}</strong>. ${details.redirectIsLoopback ? 'This is a local application; another local process could be listening.' : ''}</p><p>The client name is supplied by the client. Verify the destination before continuing.</p><ul>${details.scope.map((s) => `<li>${e(s)}</li>`).join('')}</ul><p>Access can create and download your books, and send documents to your confirmed reader when you ask. It does not grant access to your Amazon account.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${e(consent.handle)}"/><input type="hidden" name="ownerProof" value="${ownerProof}"/><button name="decision" value="allow">Connect agent</button><button class="secondary" name="decision" value="deny">Cancel</button></form></main></body></html>`;
      return new Response(page, { headers: consent.headers });
    }
    if (request.method === 'POST') {
      checkOrigin(request, env.ORIGIN);
      const form = await request.formData();
      const handle = form.get('handle');
      invariant(
        typeof handle === 'string' && handle.length < 1000,
        'CONSENT',
        'Invalid consent request.',
      );
      invariant(
        typeof form.get('ownerProof') === 'string' &&
          equalToken(
            String(form.get('ownerProof')),
            await hmac(env.SIGNING_SECRET, `${owner}\n${handle}`),
          ),
        'CONSENT',
        'This consent belongs to a different signed-in account.',
      );
      if (form.get('decision') !== 'allow') {
        const denied = await env.OAUTH_PROVIDER.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await env.OAUTH_PROVIDER.approveConsent(request, handle);
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: approved.request,
        userId: owner,
        metadata: {},
        scope: approved.request.scope,
        props: { userId: owner },
      });
      approved.headers.set('Location', redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
  }
  return null;
}
