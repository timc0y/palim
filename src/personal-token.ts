import { json } from './http.js';
import type { Env } from './types.js';

async function digest(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function changeToken(owner: string, method: string, env: Env): Promise<Response> {
  const token =
    method === 'POST'
      ? 'palim_' +
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('')
      : null;
  const result = await env.DB.prepare(
    'UPDATE users SET mcp_token_digest = ? WHERE id = ? AND disabled = 0',
  )
    .bind(token ? await digest(token) : null, owner)
    .run();
  if (!result.meta.changes) return json({ message: 'Account unavailable.' }, 403);
  return token
    ? json({ token, hasMcpToken: true }, 201)
    : json({ revoked: true, hasMcpToken: false });
}

export async function tokenOwner(token: string, env: Env): Promise<string | null> {
  if (!/^palim_[a-f0-9]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    'SELECT id FROM users WHERE mcp_token_digest = ? AND disabled = 0',
  )
    .bind(await digest(token))
    .first<{ id: string }>();
  return row?.id ?? null;
}
