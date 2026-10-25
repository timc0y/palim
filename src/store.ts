import { PalimError } from './errors.js';
import { LIMITS } from './schema.js';
import type { Artifact, Challenge, Delivery, User } from './types.js';

export class Store {
  constructor(
    readonly db: D1Database,
    readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}
  async user(id: string): Promise<User> {
    const user = await this.db
      .prepare('SELECT * FROM users WHERE id = ? AND disabled = 0')
      .bind(id)
      .first<User>();
    if (!user) throw new PalimError('SIGN_IN_REQUIRED', 'Sign in to Palim to continue.', 401);
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
    const daily = kind === 'render' ? LIMITS.renders : LIMITS.uploads;
    const floor = Math.floor(this.now() / 86400) * 86400;
    const row = await this.db
      .prepare(
        `INSERT INTO operations(id,owner,kind,created_at)
      SELECT ?,id,?,? FROM users WHERE id=? AND disabled=0
      AND (SELECT COUNT(*) FROM operations WHERE owner=? AND kind=? AND created_at>=?) < ?
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
        daily,
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
  async reserveDelivery(r: Delivery, destinationVersion: string): Promise<boolean> {
    const floor = Math.floor(this.now() / 86400) * 86400;
    const d = new Date(this.now() * 1000);
    const month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    const result = await this.db
      .prepare(
        `INSERT INTO deliveries(id,owner,send_key,purpose,artifact_id,sha256,destination_hash,destination_mask,state,resend_of,created_at,updated_at)
      SELECT ?,id,?,?,?,?,?,?,'submitting',?,?,? FROM users WHERE id=? AND disabled=0
      AND (? = 'challenge' OR (destination IS NOT NULL AND destination_version=?))
      AND (SELECT COUNT(*) FROM deliveries WHERE owner=? AND created_at>=?) < ?
      AND (SELECT COUNT(*) FROM deliveries WHERE created_at>=?) < ?
      AND (SELECT COUNT(*) FROM deliveries WHERE created_at>=?) < ?
      AND (? <> 'challenge' OR ((SELECT COUNT(*) FROM deliveries WHERE destination_hash=? AND purpose='challenge' AND created_at>=?) < 2 AND (SELECT COUNT(*) FROM deliveries WHERE purpose='challenge' AND created_at>=?) < 20 AND (SELECT COUNT(*) FROM deliveries WHERE purpose='challenge' AND created_at>=?) < 600))
      ON CONFLICT(owner,send_key) DO NOTHING RETURNING id`,
      )
      .bind(
        r.id,
        r.send_key,
        r.purpose,
        r.artifact_id,
        r.sha256,
        r.destination_hash,
        r.destination_mask,
        r.resend_of,
        r.created_at,
        r.updated_at,
        r.owner,
        r.purpose,
        destinationVersion,
        r.owner,
        floor,
        LIMITS.sends,
        floor,
        LIMITS.globalDaily,
        month,
        LIMITS.globalMonthly,
        r.purpose,
        r.destination_hash,
        floor,
        floor,
        month,
      )
      .first();
    return !!result;
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
  async challenge(owner: string): Promise<Challenge | null> {
    return this.db.prepare('SELECT * FROM challenges WHERE owner=?').bind(owner).first<Challenge>();
  }
  async setChallenge(c: Challenge): Promise<void> {
    const claim = await this.db
      .prepare(
        'INSERT INTO challenges(owner,destination,generation,code_hash,attempts,expires_at) VALUES(?,?,?,?,0,?) ON CONFLICT(owner) DO UPDATE SET destination=excluded.destination,generation=excluded.generation,code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at WHERE challenges.expires_at<=? RETURNING owner',
      )
      .bind(c.owner, c.destination, c.generation, c.code_hash, c.expires_at, this.now())
      .first();
    if (!claim)
      throw new PalimError(
        'CHALLENGE_ACTIVE',
        'A verification book is already active. Use its code, or wait for it to expire.',
      );
  }
  async confirm(owner: string, codeHash: string): Promise<boolean> {
    // Count attempts before comparing; all concurrent requests consume an attempt.
    const challenge = await this.db
      .prepare(
        'UPDATE challenges SET attempts=attempts+1 WHERE owner=? AND attempts<5 AND expires_at>? RETURNING *',
      )
      .bind(owner, this.now())
      .first<Challenge>();
    if (!challenge || challenge.code_hash !== codeHash) return false;
    const rows = await this.db.batch([
      this.db
        .prepare(
          'UPDATE users SET destination=?,destination_version=? WHERE id=? AND disabled=0 AND EXISTS(SELECT 1 FROM challenges WHERE owner=? AND generation=? AND code_hash=? AND expires_at>?)',
        )
        .bind(
          challenge.destination,
          challenge.generation,
          owner,
          owner,
          challenge.generation,
          codeHash,
          this.now(),
        ),
      this.db
        .prepare('DELETE FROM challenges WHERE owner=? AND generation=?')
        .bind(owner, challenge.generation),
    ]);
    return (rows[0]?.meta.changes ?? 0) > 0;
  }
}
