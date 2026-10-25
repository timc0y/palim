import { isIP } from 'node:net';
import { invariant } from './errors.js';

export function publicFileUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  invariant(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      !isIP(host.replace(/^\[|\]$/g, '')) &&
      host.includes('.') &&
      !['localhost', 'local', 'internal', 'lan', 'home', 'home.arpa', 'onion'].some(
        (name) => host === name || host.endsWith('.' + name),
      ),
    'FILE_URL_UNSAFE',
    'Use a public HTTPS file URL on port 443 without credentials, IP literals, local names or fragments.',
  );
  // DNS-resolved addresses are filtered at connection time by workerd's public
  // network policy. Keep global_fetch_strictly_public; never use a private binding.
  return url;
}
