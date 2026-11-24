import { tokenOwner } from './personal-token.js';
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { z } from 'zod';
import { mcpFetch } from './mcp.js';
import { appFetch } from './routes.js';
import { Palim } from './service.js';
import { json, secureHeaders, guardAuthentication } from './http.js';
import { publicError, PalimError } from './errors.js';
import type { Env } from './types.js';
const authContext = z.object({
  props: z.object({ userId: z.string().min(1) }),
  auth: z.object({ scope: z.array(z.string()) }),
});
function provider(env: Env) {
  return new OAuthProvider<Env>({
    apiRoute: '/mcp',
    apiHandler: {
      async fetch(request, env, ctx) {
        const parsed = authContext.safeParse(ctx);
        if (!parsed.success) return json({ code: 'UNAUTHORISED' }, 401);
        return mcpFetch(request, env, parsed.data.props.userId, parsed.data.auth.scope);
      },
    },
    defaultHandler: { fetch: appFetch },
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    scopesSupported: ['books:read', 'books:write', 'books:send', 'offline_access'],
    requiredScopes: ['books:read', 'books:write', 'books:send'],
    accessTokenTTL: 3600,
    refreshTokenTTL: 30 * 86400,
    clientIdMetadataDocumentEnabled: true,
    resourceMetadata: {
      resource: `${env.ORIGIN}/mcp`,
      authorization_servers: [env.ORIGIN],
      resource_name: 'Palim',
    },
  });
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      // Canonical origin prevents Host-header manipulation of OAuth metadata and redirects.
      if (url.origin !== env.ORIGIN)
        throw new PalimError('ORIGIN', 'Use this deployment’s canonical Palim address.', 400);
      const bearer = /^Bearer (palim_[^ ]*)$/i.exec(request.headers.get('Authorization') || '');
      if (url.pathname === '/mcp' && bearer) {
        const owner = await tokenOwner(bearer[1]!, env);
        if (!owner)
          return secureHeaders(
            json({ code: 'UNAUTHORISED', message: 'Invalid or revoked personal MCP token.' }, 401),
          );
        return secureHeaders(
          await mcpFetch(request, env, owner, ['books:read', 'books:write', 'books:send']),
        );
      }
      const bounded = await guardAuthentication(request, env.AUTH_RATE_LIMIT);
      return secureHeaders(await provider(env).fetch(bounded, env, ctx));
    } catch (error) {
      const e = publicError(error);
      return secureHeaders(json({ code: e.code, message: e.message }, e.status));
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await new Palim(env).cleanup();
  },
};
