import { exchangeWebFlowCode, getWebFlowAuthorizationUrl } from '@octokit/oauth-methods';
import { request } from '@octokit/request';
import { z } from 'zod';
import { PalimError } from './errors.js';
import type { Env } from './types.js';

function config(env: Env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new PalimError('CONFIGURATION', 'The operator must configure GitHub sign-in.', 503);
  }
  return { clientType: 'oauth-app' as const, clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, redirectUrl: `${env.ORIGIN}/auth/callback` };
}

export function githubAuthorizationUrl(env: Env, state: string): string {
  return getWebFlowAuthorizationUrl({ ...config(env), state, scopes: [] }).url;
}

export async function githubAccessToken(env: Env, code: string): Promise<string> {
  const bounded = request.defaults({ request: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error' }) } });
  const result = await exchangeWebFlowCode({ ...config(env), code, request: bounded });
  return z.string().min(1).max(2048).parse(result.authentication.token);
}
