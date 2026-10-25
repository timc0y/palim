import { PalimError } from './errors.js';
import { LIMITS } from './schema.js';
import type { Artifact, Delivery, User, ReaderDestination } from './types.js';

export class Store {
  constructor(
    readonly db: D1Database,
    readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}
  async user(id: string): Promise<User> {
    let user = await this.db
      .prepare(
        'SELECT u.*, d.email AS destination FROM users u LEFT JOIN reader_destinations d ON d.id=u.default_destination_id AND d.owner=u.id WHERE u.id=? AND u.disabled=0',
      )
      .bind(id)
      .first<User>();
    if (!user) throw new PalimError('SIGN_IN_REQUIRED', 'Sign in to Palim to continue.', 401);
    if (!user.sender_alias) {
      const alias = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      await this.db
        .prepare(
          'UPDATE users SET sender_alias=? WHERE id=? AND disabled=0 AND sender_alias IS NULL',
        )
        .bind(alias, id)
        .run();
      user = await this.db
        .prepare(
          'SELECT u.*, d.email AS destination FROM users u LEFT JOIN reader_destinations d ON d.id=u.default_destination_id AND d.owner=u.id WHERE u.id=? AND u.disabled=0',
        )
        .bind(id)
        .first<User>();
      if (!user?.sender_alias)
        throw new PalimError(
          'SENDER_UNAVAILABLE',
          'Your personal sender could not be assigned. Nothing was sent.',
          503,
        );
    }
    return user;
  }
  async upsertUser(id: string, name: string): Promise<User> {
    await this.db
      .prepare(
        'INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name',
      )
      .bind(id, name, this.now())
      .run();
    return this.user(id);
  }
  async admit(owner: string, kind: 'render' | 'upload'): Promise<void> {
    const floor = Math.floor(this.now() / 86400) * 86400;
    const row = await this.db
      .prepare(
        `INSERT INTO operations(id,owner,kind,created_at)
      SELECT ?,id,?,? FROM users WHERE id=? AND disabled=0
      AND (SELECT COUNT(*) FROM operations WHERE owner=? AND kind=? AND created_at>=?) < CASE WHEN ?='render' THEN daily_render_limit ELSE ? END
      AND (SELECT COUNT(*) FROM operations WHERE kind=? AND created_at>=?) < ? RETURNING id`,
      )
      .bind(
        crypto.randomUUID(),
        kind,
        this.now(),
        owner,
        owner,
        kind,
        floor,
        kind,
        LIMITS.uploads,
        kind,
        floor,
        kind === 'render' ? 160 : 500,
      )
      .first();
    if (!row)
      throw new PalimError(
        'DAILY_LIMIT',
        `The ${kind} allowance is full. Completed books remain downloadable until expiry.`,
        429,
      );
  }
  async putArtifact(a: Artifact): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO artifacts(id,owner,kind,filename,type,sha256,bytes,object_key,generated,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        a.id,
        a.owner,
        a.kind,
        a.filename,
        a.type,
        a.sha256,
        a.bytes,
        a.object_key,
        a.generated,
        a.created_at,
        a.expires_at,
      )
      .run();
  }
  async artifact(owner: string, id: string): Promise<Artifact> {
    await this.user(owner);
    const a = await this.db
      .prepare('SELECT * FROM artifacts WHERE id=? AND owner=? AND expires_at>?')
      .bind(id, owner, this.now())
      .first<Artifact>();
    if (!a)
      throw new PalimError(
        'ARTIFACT_NOT_FOUND',
        'The file is unavailable, expired or belongs to another account.',
        404,
      );
    return a;
  }
  async artifacts(owner: string): Promise<Artifact[]> {
    return (
      await this.db
        .prepare(
          'SELECT * FROM artifacts WHERE owner=? AND expires_at>? ORDER BY created_at DESC LIMIT 30',
        )
        .bind(owner, this.now())
        .all<Artifact>()
    ).results;
  }
  async delivery(owner: string, id: string): Promise<Delivery> {
    await this.user(owner);
    const r = await this.db
      .prepare('SELECT * FROM deliveries WHERE owner=? AND id=?')
      .bind(owner, id)
      .first<Delivery>();
    if (!r)
      throw new PalimError(
        'DELIVERY_NOT_FOUND',
        'No accessible delivery has that identifier.',
        404,
      );
    // A lost worker cannot finish its record. Never turn that ambiguity into another send.
    if (r.state === 'submitting' && r.updated_at < this.now() - 120)
      return { ...r, state: 'unknown' };
    return r;
  }
  async deliveryByKey(owner: string, key: string): Promise<Delivery | null> {
    return this.db
      .prepare('SELECT * FROM deliveries WHERE owner=? AND send_key=?')
      .bind(owner, key)
      .first<Delivery>();
  }
  async defaultIntent(owner: string, key: string): Promise<Delivery | null> {
    return this.db
      .prepare('SELECT * FROM deliveries WHERE owner=? AND default_intent_key=?')
      .bind(owner, key)
      .first<Delivery>();
  }
  async bindDefaultIntent(owner: string, id: string, key: string): Promise<Delivery> {
    await this.db
      .prepare(
        'UPDATE OR IGNORE deliveries SET default_intent_key=? WHERE owner=? AND id=? AND default_intent_key IS NULL',
      )
      .bind(key, owner, id)
      .run();
    const row = await this.defaultIntent(owner, key);
    if (!row)
      throw new PalimError(
        'DELIVERY_IN_PROGRESS',
        'Retry the original request to obtain its receipt.',
        409,
      );
    return row;
  }
  async reserveDelivery(r: Delivery, destinationId: string, senderAlias: string): Promise<boolean> {
    const floor = Math.floor(this.now() / 86400) * 86400;
    const d = new Date(this.now() * 1000);
    const month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    const result = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO deliveries(id,owner,send_key,purpose,artifact_id,sha256,destination_hash,destination_mask,destination_id,default_intent_key,state,resend_of,created_at,updated_at,sender)
        SELECT ?,id,?,'document',?,?,?,?,?,?,'submitting',?,?,?,? FROM users WHERE id=? AND disabled=0 AND sender_alias=?
        AND EXISTS(SELECT 1 FROM reader_destinations WHERE owner=? AND id=? AND id=?)
        AND (SELECT COUNT(*) FROM deliveries WHERE owner=? AND created_at>=?) < daily_send_limit
        AND (SELECT COUNT(*) FROM mail_attempts WHERE created_at>=?) < ?
        AND (SELECT COUNT(*) FROM mail_attempts WHERE created_at>=?) < ?
        ON CONFLICT DO NOTHING`,
        )
        .bind(
          r.id,
          r.send_key,
          r.artifact_id,
          r.sha256,
          r.destination_hash,
          r.destination_mask,
          r.destination_id ?? null,
          r.default_intent_key ?? null,
          r.resend_of,
          r.created_at,
          r.updated_at,
          r.sender ?? null,
          r.owner,
          senderAlias,
          r.owner,
          destinationId,
          r.destination_id ?? null,
          r.owner,
          floor,
          floor,
          LIMITS.globalDaily,
          month,
          LIMITS.globalMonthly,
        ),
      this.db
        .prepare(
          `INSERT INTO mail_attempts(id,purpose,owner,recipient_hash,created_at)
        SELECT id,purpose,owner,destination_hash,created_at FROM deliveries WHERE id=? ON CONFLICT(id) DO NOTHING`,
        )
        .bind(r.id),
    ]);
    return (result[0]?.meta.changes ?? 0) > 0;
  }
  async claimLogin(recipientHash: string): Promise<string | null> {
    const now = this.now(),
      floor = Math.floor(now / 86400) * 86400;
    const date = new Date(now * 1000),
      month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
    const id = crypto.randomUUID();
    const row = await this.db
      .prepare(
        `INSERT INTO mail_attempts(id,purpose,recipient_hash,created_at)
      SELECT ?,'login',?,? WHERE
      (SELECT COUNT(*) FROM mail_attempts WHERE created_at>=?)<? AND
      (SELECT COUNT(*) FROM mail_attempts WHERE created_at>=?)<? AND
      (SELECT COUNT(*) FROM mail_attempts WHERE purpose='login' AND created_at>=?)<20 AND
      (SELECT COUNT(*) FROM mail_attempts WHERE purpose='login' AND created_at>=?)<600 AND
      (SELECT COUNT(*) FROM mail_attempts WHERE purpose='login' AND recipient_hash=? AND created_at>=?)<5 AND
      NOT EXISTS(SELECT 1 FROM mail_attempts WHERE purpose='login' AND recipient_hash=? AND created_at>?) RETURNING id`,
      )
      .bind(
        id,
        recipientHash,
        now,
        floor,
        LIMITS.globalDaily,
        month,
        LIMITS.globalMonthly,
        floor,
        month,
        recipientHash,
        floor,
        recipientHash,
        now - 60,
      )
      .first();
    return row ? id : null;
  }
  async saveReader(owner: string, email: string, label: string): Promise<ReaderDestination> {
    await this.user(owner);
    const row = await this.db
      .prepare(
        `INSERT INTO reader_destinations(id,owner,label,email)
      SELECT ?,id,?,? FROM users WHERE id=? AND disabled=0
      AND ((SELECT COUNT(*) FROM reader_destinations WHERE owner=?)<5 OR EXISTS(SELECT 1 FROM reader_destinations WHERE owner=? AND email=?))
      ON CONFLICT(owner,email) DO UPDATE SET label=excluded.label RETURNING *`,
      )
      .bind(crypto.randomUUID(), label, email, owner, owner, owner, email)
      .first<ReaderDestination>();
    if (!row)
      throw new PalimError(
        'READER_LIMIT',
        'You can save up to five Kindle addresses. Remove one before adding another.',
        409,
      );
    await this.db
      .prepare(
        'UPDATE users SET default_destination_id=? WHERE id=? AND disabled=0 AND default_destination_id IS NULL AND EXISTS(SELECT 1 FROM reader_destinations WHERE id=? AND owner=?)',
      )
      .bind(row.id, owner, row.id, owner)
      .run();
    return row;
  }
  async readers(owner: string): Promise<ReaderDestination[]> {
    await this.user(owner);
    return (
      await this.db
        .prepare(
          'SELECT id,owner,label,email FROM reader_destinations WHERE owner=? ORDER BY rowid',
        )
        .bind(owner)
        .all<ReaderDestination>()
    ).results;
  }
  async reader(owner: string, id: string): Promise<ReaderDestination> {
    await this.user(owner);
    const row = await this.db
      .prepare('SELECT * FROM reader_destinations WHERE owner=? AND id=?')
      .bind(owner, id)
      .first<ReaderDestination>();
    if (!row)
      throw new PalimError('READER_NOT_FOUND', 'Choose one of your saved Kindle addresses.', 404);
    return row;
  }
  async defaultReader(owner: string, id: string): Promise<void> {
    await this.reader(owner, id);
    const row = await this.db
      .prepare(
        'UPDATE users SET default_destination_id=? WHERE id=? AND disabled=0 AND EXISTS(SELECT 1 FROM reader_destinations WHERE id=? AND owner=?) RETURNING id',
      )
      .bind(id, owner, id, owner)
      .first();
    if (!row)
      throw new PalimError('READER_NOT_FOUND', 'Choose one of your saved Kindle addresses.', 404);
  }
  async removeReader(owner: string, id: string): Promise<void> {
    await this.reader(owner, id);
    await this.db
      .prepare('DELETE FROM reader_destinations WHERE owner=? AND id=?')
      .bind(owner, id)
      .run();
  }

  async outcome(
    id: string,
    state: Delivery['state'],
    provider: string | null,
    error: string | null,
  ): Promise<void> {
    await this.db
      .prepare(
        "UPDATE deliveries SET state=?,provider_id=?,error_code=?,updated_at=? WHERE id=? AND state='submitting'",
      )
      .bind(state, provider, error, this.now(), id)
      .run();
  }
}
