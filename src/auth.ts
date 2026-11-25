import { authentication } from './login.js';
import { z } from 'zod';
import { PalimError, invariant } from './errors.js';
import { checkOrigin, equalToken, hmac, readJson, json } from './http.js';
import { escapeXml as e } from './xml.js';
import { LIMITS } from './schema.js';
import { Store } from './store.js';
import type { Env } from './types.js';
import { permissionLabel } from './permissions.js';

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
async function currentSession(
  request: Request,
  env: Env,
): Promise<{ id: string; name: string; email: string } | null> {
  const current = await authentication(env).api.getSession({ headers: request.headers });
  if (!current) return null;
  await new Store(env.DB).upsertUser(current.user.id, current.user.name);
  return {
    id: current.user.id,
    name: current.user.name,
    email: current.user.email,
  };
}
export async function session(request: Request, env: Env): Promise<string | null> {
  return (await currentSession(request, env))?.id ?? null;
}
export async function requireSession(request: Request, env: Env) {
  const account = await currentSession(request, env);
  if (!account) throw new PalimError('SIGN_IN_REQUIRED', 'Sign in to Palim to continue.', 401);
  return account;
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
    headers.set('Location', returnPath(url.searchParams.get('returnTo')));
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
      const delivery = { failed: false };
      if (claim) {
        await authentication(env, claim, delivery).handler(
          new Request(request, { body: JSON.stringify(parsed.data) }),
        );
      }
      if (delivery.failed) {
        return json(
          {
            code: 'LOGIN_EMAIL',
            message:
              'The sign-in email could not be sent right now. Request another code after a minute.',
          },
          503,
        );
      }
      return json({
        resendAfterSeconds: LIMITS.loginResendSeconds,
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
    const account = await currentSession(request, env);
    if (!account)
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`,
          'Cache-Control': 'no-store',
        },
      });
    const owner = account.id;
    if (request.method === 'GET') {
      const auth = await env.OAUTH_PROVIDER.parseAuthRequest(request),
        details = await env.OAUTH_PROVIDER.describeConsent(auth),
        consent = await env.OAUTH_PROVIDER.beginConsent(auth);
      consent.headers.set('Content-Type', 'text/html; charset=utf-8');
      consent.headers.set('Cache-Control', 'no-store');
      const ownerProof = await hmac(env.SIGNING_SECRET, `${owner}\n${consent.handle}`);
      const destination = new URL(auth.redirectUri).host || details.redirectHost;
      const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Connect your agent · Palim</title><meta name="robots" content="noindex, nofollow"/><meta name="theme-color" content="#eeeeea"/><link rel="icon" href="/mark.svg" type="image/svg+xml"/><link rel="stylesheet" href="/style.css"/></head><body><a class="skip-link" href="#main-content">Skip to content</a><main id="main-content" class="consent" tabindex="-1"><a class="wordmark" href="/" aria-label="Palim home"><img src="/mark.svg" width="24" height="24" alt=""/>Palim</a><h1>Connect your agent</h1><div class="consent-account"><span>Signed in as <strong>${e(account.email || account.name)}</strong></span><form method="post" action="/auth/logout?returnTo=${e(encodeURIComponent(url.pathname + url.search))}"><button type="submit" class="plain-button">Switch account</button></form></div><section class="consent-destination"><h2>Application</h2><dl><dt>Name</dt><dd><bdi>${e(details.clientName)}</bdi></dd><dt>Destination</dt><dd><code class="consent-host">${e(destination)}</code></dd></dl><p>Check the destination. The application chooses its own name.</p>${details.redirectIsLoopback ? '<p>Another process on this device could be listening at this local destination.</p>' : ''}</section><section aria-labelledby="requested-access"><h2 id="requested-access">Requested permissions</h2><ul>${details.scope.map((s) => `<li>${e(permissionLabel(s))}</li>`).join('')}</ul><p><a href="/privacy#agent-access" target="_blank" rel="noreferrer" aria-label="Access lasts up to 30 days (opens in a new tab)">Access lasts up to 30 days</a>. Disconnect sooner under Connected applications in Settings.</p></section><form class="consent-actions" method="post" action="/authorize"><input type="hidden" name="handle" value="${e(consent.handle)}"/><input type="hidden" name="ownerProof" value="${ownerProof}"/><button name="decision" value="allow">Connect agent</button><button class="secondary" name="decision" value="deny">Cancel</button></form></main></body></html>`;
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
      let clientName = approved.request.clientId;
      try {
        clientName =
          (await env.OAUTH_PROVIDER.lookupClient?.(approved.request.clientId))?.clientName ||
          clientName;
      } catch {
        // Keep clientId fallback when client metadata cannot be resolved.
      }
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: approved.request,
        userId: owner,
        metadata: { clientName },
        scope: approved.request.scope,
        props: { userId: owner },
      });
      approved.headers.set('Location', redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
  }
  return null;
}
