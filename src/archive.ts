import JSZip from 'jszip';
import { invariant, PalimError } from './errors.js';
import { LIMITS } from './schema.js';
import { parseXml, sha256 } from './xml.js';

export interface DocumentInfo {
  type: 'application/epub+zip' | 'application/pdf';
  sha256: string;
  bytes: number;
  title?: string;
  creator?: string;
}
const utf8 = new TextDecoder('utf-8', { fatal: true });
function safePath(name: string): boolean {
  return (
    !!name &&
    !name.startsWith('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    !/^[a-z]:/i.test(name) &&
    !name.split('/').includes('..')
  );
}

/** Inspect ZIP metadata before asking JSZip to inflate even a small entry. */
export function inspectZip(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  invariant(end >= 0, 'INVALID_EPUB', 'The EPUB has no valid ZIP directory.');
  const count = view.getUint16(end + 10, true),
    start = view.getUint32(end + 16, true),
    size = view.getUint32(end + 12, true);
  invariant(
    view.getUint16(end + 4, true) === 0 &&
      view.getUint16(end + 6, true) === 0 &&
      view.getUint16(end + 8, true) === count,
    'UNSUPPORTED_ZIP',
    'Multi-volume ZIP files are not supported.',
  );
  invariant(
    count > 0 && count < 65535 && count <= LIMITS.entries && start + size === end,
    'INVALID_EPUB',
    'Unsupported or oversized ZIP directory.',
  );
  const names = new Set<string>();
  let offset = start,
    inflated = 0;
  for (let i = 0; i < count; i++) {
    invariant(
      offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50,
      'INVALID_EPUB',
      'Malformed ZIP directory entry.',
    );
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true);
    const packed = view.getUint32(offset + 20, true),
      unpacked = view.getUint32(offset + 24, true);
    const n = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    invariant(
      offset + 46 + n + extra + comment <= end && local + 30 <= start,
      'INVALID_EPUB',
      'ZIP entry is out of bounds.',
    );
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + n));
    invariant(
      safePath(name) && !names.has(name.toLowerCase()),
      'UNSAFE_ARCHIVE',
      'Unsafe or duplicate ZIP path.',
    );
    names.add(name.toLowerCase());
    invariant(
      !(flags & 1) &&
        (method === 0 || method === 8) &&
        unpacked !== 0xffffffff &&
        packed !== 0xffffffff,
      'UNSUPPORTED_ZIP',
      'Encrypted, ZIP64 or unsupported ZIP compression.',
    );
    invariant(
      view.getUint32(local, true) === 0x04034b50 &&
        view.getUint16(local + 6, true) === flags &&
        view.getUint16(local + 8, true) === method,
      'INVALID_EPUB',
      'ZIP headers disagree.',
    );
    const ln = view.getUint16(local + 26, true),
      le = view.getUint16(local + 28, true);
    invariant(
      local + 30 + ln + le + packed <= start &&
        utf8.decode(bytes.subarray(local + 30, local + 30 + ln)) === name,
      'INVALID_EPUB',
      'ZIP data is out of bounds.',
    );
    inflated += unpacked;
    invariant(
      inflated <= LIMITS.inflated && unpacked <= 32 * 1024 * 1024,
      'ARCHIVE_TOO_LARGE',
      'The EPUB expands beyond the supported budget.',
    );
    offset += 46 + n + extra + comment;
  }
  invariant(offset === end, 'INVALID_EPUB', 'ZIP directory length mismatch.');
}
async function readEntry(zip: JSZip, name: string, max = LIMITS.xml): Promise<string> {
  const file = zip.file(name);
  invariant(file, 'INVALID_EPUB', `Missing EPUB metadata: ${name}`);
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let stopped = false;
    // JSZip exposes internalStream at runtime; its object typings omit this supported streaming API.
    const stream = (
      file as unknown as { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }
    ).internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return;
      total += chunk.length;
      if (total > max) {
        stopped = true;
        stream.pause();
        reject(new PalimError('METADATA_TOO_LARGE', 'EPUB metadata exceeds its decoded limit.'));
      } else chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (stopped) return;
      try {
        const all = new Uint8Array(total);
        let p = 0;
        for (const c of chunks) {
          all.set(c, p);
          p += c.length;
        }
        resolve(utf8.decode(all));
      } catch (e) {
        reject(e);
      }
    });
    stream.resume();
  });
}
export async function inspectDocument(bytes: Uint8Array): Promise<DocumentInfo> {
  invariant(
    bytes.length > 8 && bytes.length <= LIMITS.upload,
    'FILE_SIZE',
    'Supply an EPUB or PDF up to 20 MiB.',
  );
  const hash = await sha256(bytes);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-')
    return { type: 'application/pdf', sha256: hash, bytes: bytes.length };
  inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes, { createFolders: false });
  invariant(
    (await readEntry(zip, 'mimetype', 64)) === 'application/epub+zip',
    'INVALID_EPUB',
    'The file is not an EPUB.',
  );
  const container = parseXml(await readEntry(zip, 'META-INF/container.xml'));
  const root = container.getElementsByTagNameNS('*', 'rootfile').item(0)?.getAttribute('full-path');
  invariant(root && safePath(root), 'INVALID_EPUB', 'The EPUB has no safe package document.');
  const pkg = parseXml(await readEntry(zip, root));
  const version = pkg.documentElement?.getAttribute('version');
  invariant(
    version === '2.0' || version === '3.0',
    'UNSUPPORTED_EPUB',
    'Only EPUB 2 and EPUB 3 are supported.',
  );
  if (zip.file('META-INF/encryption.xml')) {
    const encrypted = parseXml(
      await readEntry(zip, 'META-INF/encryption.xml'),
    ).getElementsByTagNameNS('*', 'EncryptionMethod');
    for (let i = 0; i < encrypted.length; i++)
      invariant(
        ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'].includes(
          encrypted.item(i)?.getAttribute('Algorithm') ?? '',
        ),
        'PROTECTED_EPUB',
        'Protected content cannot be delivered through this workflow. Font obfuscation is supported.',
      );
  }
  return {
    type: 'application/epub+zip',
    sha256: hash,
    bytes: bytes.length,
    title:
      pkg.getElementsByTagNameNS('*', 'title').item(0)?.textContent?.slice(0, 240) || undefined,
    creator:
      pkg.getElementsByTagNameNS('*', 'creator').item(0)?.textContent?.slice(0, 160) || undefined,
  };
}
