import { buildBook } from './book.js';
import { inspectDocument } from './archive.js';
import { BookSchema, DestinationSchema, LIMITS, type Book } from './schema.js';
import { invariant, PalimError } from './errors.js';
import { canEmail, maskAddress, prepareEmail, safeFilename } from './mail.js';
import { equalToken, hmac, readBytes } from './http.js';
import { sha256 } from './xml.js';
import { Store } from './store.js';
import type { Asset } from './figures.js';
import type { Artifact, Delivery, Env } from './types.js';

const REJECTED = new Set([
  'E_VALIDATION_ERROR',
  'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS',
  'E_TOO_MANY_ATTACHMENTS',
  'E_SENDER_NOT_VERIFIED',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_RECIPIENT_SUPPRESSED',
  'E_ACCOUNT_SUSPENDED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE',
  'E_CONTENT_TOO_LARGE',
  'E_RATE_LIMIT_EXCEEDED',
  'E_DAILY_LIMIT_EXCEEDED',
  'E_HEADER_NOT_ALLOWED',
  'E_HEADER_USE_API_FIELD',
  'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG',
  'E_HEADER_NAME_INVALID',
  'E_HEADERS_TOO_LARGE',
  'E_HEADERS_TOO_MANY',
]);
export function errorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^E_[A-Z_]{1,60}$/.test(error.code)
  )
    return error.code;
  return null;
}
export function publicReceipt(row: Delivery) {
  return {
    deliveryId: row.id,
    state: row.state,
    providerMessageId: row.provider_id,
    attachmentSha256: row.sha256,
    destination: row.destination_mask,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    errorCode: row.error_code,
    kindleReceipt: 'unverified',
    message:
      row.state === 'submitted'
        ? 'Cloudflare accepted this email submission. Amazon import and device receipt are not confirmed.'
        : row.state === 'rejected'
          ? 'The provider rejected the request. It was not automatically retried.'
          : row.state === 'unknown'
            ? 'The email may or may not have been submitted. No second copy was sent.'
            : 'This delivery is being submitted. Do not resend it.',
  };
}
function imageType(bytes: Uint8Array): Asset['type'] {
  let width = 0,
    height = 0,
    type: Asset['type'];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) {
    type = 'image/png';
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    type = 'image/jpeg';
    let p = 2;
    while (p + 4 < bytes.length) {
      if (bytes[p] !== 255) break;
      const marker = bytes[p + 1]!;
      if (marker === 217 || marker === 218) break;
      const size = v.getUint16(p + 2);
      if (size < 2 || p + 2 + size > bytes.length) break;
      if ([192, 193, 194].includes(marker) && size >= 8) {
        height = v.getUint16(p + 5);
        width = v.getUint16(p + 7);
        break;
      }
      p += 2 + size;
    }
  } else throw new PalimError('IMAGE_FORMAT', 'Use a PNG or JPEG image.');
  invariant(
    width > 0 && height > 0 && width * height <= LIMITS.assetPixels,
    'IMAGE_DIMENSIONS',
    'Image dimensions are missing or exceed four million pixels.',
  );
  return type;
}
export class Palim {
  readonly store: Store;
  constructor(
    readonly env: Env,
    readonly clock: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.store = new Store(env.DB, clock);
  }
  async account(owner: string) {
    const user = await this.store.user(owner);
    const challenge = await this.store.challenge(owner);
    return {
      name: user.name,
      destination: user.destination ? maskAddress(user.destination) : null,
      pendingDestination:
        challenge && challenge.expires_at > this.clock()
          ? maskAddress(challenge.destination)
          : null,
      sender: this.env.SENDER,
      limits: {
        renders: LIMITS.renders,
        sends: LIMITS.sends,
        uploads: LIMITS.uploads,
        retentionHours: 24,
      },
      artifacts: await Promise.all(
        (await this.store.artifacts(owner)).map((a) => this.artifactResult(a)),
      ),
    };
  }
  async artifactResult(a: Artifact) {
    const result = {
      artifactId: a.id,
      kind: a.kind,
      filename: a.filename,
      mimeType: a.type,
      bytes: a.bytes,
      sha256: a.sha256,
      generated: !!a.generated,
      emailEligible: a.kind === 'document' && canEmail(a.bytes),
      expiresAt: new Date(a.expires_at * 1000).toISOString(),
      downloadUrl: await this.link(a, 'file'),
      sourceUrl: a.generated ? await this.link(a, 'source') : null,
      previewUrl: a.generated ? await this.link(a, 'preview') : null,
    };
    return result;
  }
  async link(a: Artifact, part: 'file' | 'source' | 'preview'): Promise<string> {
    const expires = Math.min(a.expires_at, this.clock() + 900);
    const signature = await hmac(
      this.env.SIGNING_SECRET,
      `${a.owner}\n${a.id}\n${part}\n${expires}`,
    );
    return `${this.env.ORIGIN}/download/${a.id}/${part}?owner=${encodeURIComponent(a.owner)}&expires=${expires}&signature=${signature}`;
  }
  async download(request: Request, id: string, part: string): Promise<Response> {
    invariant(['file', 'source', 'preview'].includes(part), 'NOT_FOUND', 'No such download.');
    const u = new URL(request.url),
      owner = u.searchParams.get('owner') ?? '',
      expires = u.searchParams.get('expires') ?? '',
      signature = u.searchParams.get('signature') ?? '';
    invariant(
      /^\d{10}$/.test(expires) &&
        Number(expires) > this.clock() &&
        Number(expires) <= this.clock() + 900 &&
        signature.length === 64,
      'LINK_EXPIRED',
      'This private link expired. Open Palim to obtain a fresh link.',
    );
    invariant(
      equalToken(
        signature,
        await hmac(this.env.SIGNING_SECRET, `${owner}\n${id}\n${part}\n${expires}`),
      ),
      'ACCESS_DENIED',
      'This private link is invalid.',
    );
    const a = await this.store.artifact(owner, id);
    invariant(
      part === 'file' || a.generated === 1,
      'NOT_FOUND',
      'This original has no generated source or preview.',
    );
    const object = await this.env.BOOKS.get(a.object_key + (part === 'file' ? '' : `.${part}`));
    if (!object)
      throw new PalimError('ARTIFACT_NOT_FOUND', 'This file is no longer available.', 404);
    const type =
      part === 'source'
        ? 'application/json'
        : part === 'preview'
          ? 'text/html; charset=utf-8'
          : a.type;
    const headers = new Headers({
      'Content-Type': type,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    if (part !== 'preview')
      headers.set(
        'Content-Disposition',
        `attachment; filename="${part === 'source' ? 'manuscript.json' : a.filename}"`,
      );
    else
      headers.set(
        'Content-Security-Policy',
        "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      );
    return new Response(object.body, { headers });
  }
  async upload(owner: string, bytes: Uint8Array, filename: string, image = false) {
    await this.store.user(owner);
    await this.store.admit(owner, 'upload');
    return this.saveUpload(owner, bytes, filename, image);
  }
  private async saveUpload(owner: string, bytes: Uint8Array, filename: string, image = false) {
    invariant(
      bytes.length > 0 && bytes.length <= LIMITS.upload,
      'FILE_SIZE',
      'Supply a file up to 20 MiB.',
    );
    const info = image
      ? { type: imageType(bytes), sha256: await sha256(bytes), bytes: bytes.length }
      : await inspectDocument(bytes);
    const id = crypto.randomUUID(),
      key = `${owner}/${id}`;
    const a: Artifact = {
      id,
      owner,
      kind: image ? 'image' : 'document',
      filename: image
        ? `image.${info.type === 'image/png' ? 'png' : 'jpg'}`
        : safeFilename(filename, info.type),
      type: info.type,
      sha256: info.sha256,
      bytes: bytes.length,
      object_key: key,
      generated: 0,
      created_at: this.clock(),
      expires_at: this.clock() + LIMITS.retention,
    };
    await this.env.BOOKS.put(key, bytes, { httpMetadata: { contentType: a.type } });
    try {
      await this.store.putArtifact(a);
    } catch (e) {
      await this.env.BOOKS.delete(key);
      throw e;
    }
    return this.artifactResult(a);
  }
  async create(owner: string, value: unknown) {
    await this.store.user(owner);
    const parsed = BookSchema.safeParse(value);
    if (!parsed.success)
      throw new PalimError(
        'INVALID_MANUSCRIPT',
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')
          .slice(0, 1600),
      );
    await this.store.admit(owner, 'render');
    const book: Book = parsed.data;
    const assets = new Map<string, Asset>();
    let total = 0;
    for (const f of book.figures) {
      if (f.kind !== 'image' || assets.has(f.assetId)) continue;
      const a = await this.store.artifact(owner, f.assetId);
      invariant(
        a.kind === 'image' && (a.type === 'image/png' || a.type === 'image/jpeg'),
        'IMAGE_FORMAT',
        'The supplied asset is not an image.',
      );
      total += a.bytes;
      invariant(
        total <= 8 * 1024 * 1024,
        'ASSETS_TOO_LARGE',
        'Reduce image assets below 8 MiB in total.',
      );
      const object = await this.env.BOOKS.get(a.object_key);
      invariant(object, 'MISSING_ASSET', 'A figure has expired.');
      assets.set(f.assetId, { bytes: new Uint8Array(await object.arrayBuffer()), type: a.type });
    }
    const built = await buildBook(book, assets, new Date(this.clock() * 1000));
    const id = crypto.randomUUID(),
      key = `${owner}/${id}`;
    const a: Artifact = {
      id,
      owner,
      kind: 'document',
      filename: built.filename,
      type: 'application/epub+zip',
      sha256: built.hash,
      bytes: built.bytes.length,
      object_key: key,
      generated: 1,
      created_at: this.clock(),
      expires_at: this.clock() + LIMITS.retention,
    };
    try {
      await this.env.BOOKS.put(key, built.bytes);
      await this.env.BOOKS.put(`${key}.source`, built.source);
      await this.env.BOOKS.put(`${key}.preview`, built.preview);
      await this.store.putArtifact(a);
    } catch (e) {
      await this.env.BOOKS.delete([key, `${key}.source`, `${key}.preview`]);
      throw e;
    }
    return {
      ...(await this.artifactResult(a)),
      wordCount: built.wordCount,
      warnings: built.warnings,
    };
  }
  async importHostFile(owner: string, file: { download_url: string; filename: string }) {
    const url = new URL(file.download_url),
      origins = (this.env.FILE_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    invariant(
      url.protocol === 'https:' && !url.username && !url.password && origins.includes(url.origin),
      'FILE_HOST_UNSUPPORTED',
      'This host is not configured for secure file transfer. Upload the file in the Palim workspace instead.',
    );
    await this.store.user(owner);
    await this.store.admit(owner, 'upload');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    invariant(
      response.ok,
      'FILE_UNAVAILABLE',
      'The host could not provide this file. Reattach it or upload it in Palim.',
    );
    return this.saveUpload(owner, await readBytes(response, LIMITS.upload), file.filename);
  }
  async send(owner: string, artifactId: string, resendOf?: string) {
    const user = await this.store.user(owner),
      a = await this.store.artifact(owner, artifactId);
    invariant(a.kind === 'document', 'DOCUMENT_REQUIRED', 'Choose an EPUB or PDF document.');
    invariant(
      user.destination,
      'DESTINATION_REQUIRED',
      'Open the Palim workspace and confirm your Kindle address first.',
    );
    invariant(
      canEmail(a.bytes),
      'EMAIL_TOO_LARGE',
      'This original is too large for Cloudflare email. It has not been changed or sent. Download it for Amazon’s web uploader.',
    );
    if (resendOf) {
      const previous = await this.store.delivery(owner, resendOf);
      invariant(
        previous.purpose === 'document' && previous.sha256 === a.sha256,
        'RESEND_MISMATCH',
        'A resend must refer to this same document.',
      );
      invariant(
        previous.state !== 'submitting',
        'DELIVERY_IN_PROGRESS',
        'This send is still in progress.',
      );
    }
    const key = await sha256(
      `${owner}\n${a.sha256}\n${user.destination_version}\n${resendOf ?? 'original'}`,
    );
    const previous = await this.store.deliveryByKey(owner, key);
    if (previous) return publicReceipt(await this.store.delivery(owner, previous.id));
    const object = await this.env.BOOKS.get(a.object_key);
    invariant(object, 'ARTIFACT_NOT_FOUND', 'This document has expired.');
    const bytes = new Uint8Array(await object.arrayBuffer());
    const r = await this.newReceipt(
      owner,
      key,
      'document',
      a.sha256,
      user.destination,
      a.id,
      resendOf,
    );
    const payload = await prepareEmail({
      bytes,
      expectedHash: a.sha256,
      type: a.type,
      filename: a.filename,
      from: this.env.SENDER,
      to: user.destination,
      receiptId: r.id,
    });
    if (!(await this.store.reserveDelivery(r, user.destination_version))) {
      const existing = await this.store.deliveryByKey(owner, key);
      if (existing) return publicReceipt(await this.store.delivery(owner, existing.id));
      throw new PalimError(
        'SEND_LIMIT',
        'The sending allowance is full or the destination changed. Nothing new was submitted.',
        429,
      );
    }
    await this.submit(r.id, payload);
    return publicReceipt(await this.store.delivery(owner, r.id));
  }
  private async newReceipt(
    owner: string,
    key: string,
    purpose: Delivery['purpose'],
    hash: string,
    to: string,
    artifact: string | null,
    resendOf?: string,
  ): Promise<Delivery> {
    return {
      id: crypto.randomUUID(),
      owner,
      send_key: key,
      purpose,
      artifact_id: artifact,
      sha256: hash,
      destination_hash: await hmac(this.env.SIGNING_SECRET, to),
      destination_mask: maskAddress(to),
      state: 'submitting',
      provider_id: null,
      error_code: null,
      resend_of: resendOf ?? null,
      created_at: this.clock(),
      updated_at: this.clock(),
    };
  }
  private async submit(id: string, payload: Parameters<Env['EMAIL']['send']>[0]) {
    try {
      const result = await this.env.EMAIL.send(payload);
      invariant(
        typeof result.messageId === 'string' && result.messageId.length > 0,
        'PROVIDER_RESPONSE',
        'The provider did not return a receipt.',
      );
      await this.store.outcome(id, 'submitted', result.messageId, null);
    } catch (error) {
      const code = errorCode(error);
      await this.store.outcome(id, code && REJECTED.has(code) ? 'rejected' : 'unknown', null, code);
    }
  }
  async challenge(owner: string, email: unknown) {
    const user = await this.store.user(owner);
    const parsed = DestinationSchema.safeParse({ email });
    if (!parsed.success)
      throw new PalimError('KINDLE_ADDRESS', 'Enter your Amazon @kindle.com document address.');
    const destination = parsed.data.email,
      existing = await this.store.challenge(owner);
    if (existing && existing.expires_at > this.clock())
      throw new PalimError(
        'CHALLENGE_ACTIVE',
        'A verification book is already active. Use its code, or wait for it to expire.',
      );
    const generation = crypto.randomUUID();
    const raw = crypto.getRandomValues(new Uint8Array(5));
    const code = Array.from(raw, (n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const codeHash = await hmac(this.env.SIGNING_SECRET, `${owner}\n${generation}\n${code}`);
    const built = await buildBook(
      {
        title: 'Confirm your Palim reader',
        chapters: [
          {
            title: 'Your private confirmation code',
            markdown: `Enter **${code}** in the Palim workspace within one hour.\n\nIf you did not request this test book, ignore it. This does not grant anybody access to your Amazon account.`,
          },
        ],
      },
      new Map(),
      new Date(this.clock() * 1000),
    );
    const r = await this.newReceipt(
      owner,
      `challenge:${generation}`,
      'challenge',
      built.hash,
      destination,
      null,
    );
    const payload = await prepareEmail({
      bytes: built.bytes,
      expectedHash: built.hash,
      type: 'application/epub+zip',
      filename: 'Confirm-Palim.epub',
      from: this.env.SENDER,
      to: destination,
      receiptId: r.id,
    });
    await this.store.setChallenge({
      owner,
      destination,
      generation,
      code_hash: codeHash,
      attempts: 0,
      expires_at: this.clock() + 3600,
    });
    if (!(await this.store.reserveDelivery(r, user.destination_version))) {
      await this.env.DB.prepare('DELETE FROM challenges WHERE owner=? AND generation=?')
        .bind(owner, generation)
        .run();
      throw new PalimError(
        'SEND_LIMIT',
        'The verification sending allowance is full. No new code was sent.',
        429,
      );
    }
    // The challenge is never persisted as a downloadable artifact or returned to the caller.
    await this.submit(r.id, payload);
    const receipt = await this.store.delivery(owner, r.id);
    if (receipt.state === 'rejected')
      await this.env.DB.prepare('DELETE FROM challenges WHERE owner=? AND generation=?')
        .bind(owner, generation)
        .run();
    return publicReceipt(receipt);
  }
  async confirm(owner: string, code: unknown) {
    await this.store.user(owner);
    invariant(
      typeof code === 'string' && /^[A-Fa-f0-9]{10}$/.test(code.trim()),
      'INVALID_CODE',
      'Enter the ten-character code from your Kindle.',
    );
    const challenge = await this.store.challenge(owner);
    if (!challenge)
      throw new PalimError('INVALID_CODE', 'The code is invalid, expired or already used.');
    const hash = await hmac(
      this.env.SIGNING_SECRET,
      `${owner}\n${challenge.generation}\n${code.trim().toUpperCase()}`,
    );
    invariant(
      await this.store.confirm(owner, hash),
      'INVALID_CODE',
      'The code is invalid, expired or has no attempts remaining.',
    );
    return { confirmed: true, destination: maskAddress(challenge.destination) };
  }
  async remove(owner: string, id: string) {
    const a = await this.store.artifact(owner, id);
    await this.env.BOOKS.delete([
      a.object_key,
      `${a.object_key}.source`,
      `${a.object_key}.preview`,
    ]);
    await this.env.DB.prepare('DELETE FROM artifacts WHERE owner=? AND id=?').bind(owner, id).run();
    return { deleted: true };
  }
  async cleanup() {
    const expired = (
      await this.env.DB.prepare('SELECT * FROM artifacts WHERE expires_at<=? LIMIT 100')
        .bind(this.clock())
        .all<Artifact>()
    ).results;
    for (const a of expired) {
      await this.env.BOOKS.delete([
        a.object_key,
        `${a.object_key}.source`,
        `${a.object_key}.preview`,
      ]);
      await this.env.DB.prepare('DELETE FROM artifacts WHERE id=? AND expires_at<=?')
        .bind(a.id, this.clock())
        .run();
    }
    await this.env.DB.batch([
      this.env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(this.clock()),
      this.env.DB.prepare('DELETE FROM login_states WHERE expires_at<=?').bind(this.clock()),
      this.env.DB.prepare('DELETE FROM challenges WHERE expires_at<=?').bind(this.clock()),
      this.env.DB.prepare('DELETE FROM operations WHERE created_at<?').bind(
        this.clock() - 2 * 86400,
      ),
      this.env.DB.prepare('DELETE FROM deliveries WHERE created_at<?').bind(
        this.clock() - LIMITS.receiptRetention,
      ),
    ]);
    return { deletedArtifacts: expired.length };
  }
}
