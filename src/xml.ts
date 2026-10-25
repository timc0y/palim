import { DOMParser } from '@xmldom/xmldom';
import { PalimError } from './errors.js';
import { LIMITS } from './schema.js';
export const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
export function parseXml(source: string) {
  if (source.length > LIMITS.xml || /<!DOCTYPE|<!ENTITY/i.test(source))
    throw new PalimError('UNSAFE_XML', 'Unsupported or oversized XML metadata.');
  const errors: string[] = [];
  const doc = new DOMParser({
    errorHandler: {
      warning: (s) => errors.push(s),
      error: (s) => errors.push(s),
      fatalError: (s) => errors.push(s),
    },
  }).parseFromString(source, 'application/xml');
  if (errors.length || !doc.documentElement)
    throw new PalimError('INVALID_XML', 'The document has malformed XML metadata.');
  return doc;
}
export function xhtml(title: string, language: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}"><head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
}
export async function sha256(bytes: Uint8Array | string): Promise<string> {
  const source = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(source).buffer);
  return Array.from(new Uint8Array(result), (n) => n.toString(16).padStart(2, '0')).join('');
}
