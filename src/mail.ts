import { invariant } from './errors.js';
import { LIMITS } from './schema.js';
import { sha256 } from './xml.js';
export interface EmailPayload {
  from: { email: string; name: string };
  to: string;
  subject: string;
  text: string;
  attachments: { content: Uint8Array; filename: string; type: string; disposition: 'attachment' }[];
  headers: Record<string, string>;
}
export interface EmailBinding {
  send(message: EmailPayload): Promise<{ messageId: string }>;
}
export function safeFilename(value: string, type: string): string {
  const ext = type === 'application/pdf' ? '.pdf' : '.epub';
  const stem = value
    .normalize('NFC')
    .replace(/\.(epub|pdf)$/i, '')
    .replace(/[^\p{L}\p{M}\p{N}._ -]/gu, '_')
    .trim()
    .replace(/^\.+/, '');
  return (Array.from(stem).slice(0, 100).join('').trim() || 'reading') + ext;
}
export function messageBudget(bytes: number): number {
  const encoded = 4 * Math.ceil(bytes / 3);
  return encoded + 2 * Math.ceil(encoded / 76) + 32 * 1024;
}
export function canEmail(bytes: number): boolean {
  return messageBudget(bytes) <= LIMITS.message;
}
export const MAX_EMAIL_DOCUMENT_BYTES = (() => {
  let low = 0,
    high = LIMITS.upload;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (canEmail(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
})();
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
    'The unchanged document exceeds Cloudflare’s 25 MiB total-message limit. Download it for Amazon’s web uploader instead.',
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
      // The binding accepts binary content. A Base64 string can become literal
      // attachment text; leave MIME transfer encoding to the email service.
      {
        content: new Uint8Array(input.bytes),
        filename,
        type: input.type,
        disposition: 'attachment',
      },
    ],
    headers: { 'X-Palim-Receipt': input.receiptId },
  } satisfies EmailMessageBuilder;
}
export const maskAddress = (address: string) => address.replace(/^(.{2}).*(@.*)$/, '$1…$2');
