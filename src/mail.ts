import { invariant } from './errors.js';
import { LIMITS } from './schema.js';
import { sha256 } from './xml.js';
export interface EmailPayload {
  from: { email: string; name: string };
  to: string;
  subject: string;
  text: string;
  attachments: { content: string; filename: string; type: string; disposition: 'attachment' }[];
  headers: Record<string, string>;
}
export interface EmailBinding {
  send(message: EmailPayload): Promise<{ messageId: string }>;
}
export function safeFilename(value: string, type: string): string {
  const ext = type === 'application/pdf' ? '.pdf' : '.epub';
  return (
    (value
      .replace(/\.(epub|pdf)$/i, '')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 100)
      .trim() || 'reading') + ext
  );
}
export function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function messageBudget(bytes: number): number {
  const encoded = 4 * Math.ceil(bytes / 3);
  return encoded + 2 * Math.ceil(encoded / 76) + 32 * 1024;
}
export function canEmail(bytes: number): boolean {
  return messageBudget(bytes) <= LIMITS.message;
}
export async function prepareEmail(input: {
  bytes: Uint8Array;
  expectedHash: string;
  type: string;
  filename: string;
  from: string;
  to: string;
  receiptId: string;
}): Promise<EmailPayload> {
  invariant(
    (await sha256(input.bytes)) === input.expectedHash,
    'INTEGRITY_ERROR',
    'The stored document no longer matches its recorded hash.',
  );
  invariant(
    canEmail(input.bytes.length),
    'EMAIL_TOO_LARGE',
    'The unchanged document exceeds Cloudflare’s 5 MiB encoded-message limit. Download it for Amazon’s web uploader instead.',
  );
  invariant(
    /^[^\s<>\r\n]+@[^\s<>\r\n]+$/.test(input.from) &&
      /^[a-z0-9._+-]+@(?:kindle\.com|free\.kindle\.com)$/.test(input.to),
    'INVALID_ADDRESS',
    'Invalid sender or registered Kindle destination.',
  );
  const filename = safeFilename(input.filename, input.type);
  return {
    from: { email: input.from, name: 'Palim' },
    to: input.to,
    subject: filename.replace(/\.(epub|pdf)$/, ''),
    text: 'Your requested reading is attached. Palim preserves this file’s original bytes. Amazon controls conversion and library import.',
    attachments: [
      { content: base64(input.bytes), filename, type: input.type, disposition: 'attachment' },
    ],
    headers: { 'X-Palim-Receipt': input.receiptId },
  };
}
export const maskAddress = (address: string) => address.replace(/^(.{2}).*(@.*)$/, '$1…$2');
