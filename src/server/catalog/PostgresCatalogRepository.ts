import type {
  PublicationModeration,
  StoredCreation,
  StoredCreator,
} from '../../types/community';
import {
  CatalogRepository,
  DocKeys,
  DocRow,
  HandleTakenError,
  PublishedPage,
  decodeCursor,
  encodeCursor,
} from './CatalogRepository';

type PgPool = import('pg').Pool;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS creators (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS creations (
  id               TEXT PRIMARY KEY,
  creator_id       TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  genre            TEXT NOT NULL,
  audio_url        TEXT NOT NULL,
  waveform_json    TEXT,
  lyrics           TEXT NOT NULL DEFAULT '',
  is_published     BOOLEAN NOT NULL DEFAULT FALSE,
  remix_of_id      TEXT,
  provenance       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'music',
  duration_label   TEXT,
  vocal_arrangement TEXT,
  narrator_info    TEXT,
  audio_key        TEXT NOT NULL,
  audio_mime       TEXT NOT NULL,
  audio_bytes      BIGINT NOT NULL,
  client_ref       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS creations_client_ref_idx
  ON creations (creator_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS creations_published_idx
  ON creations (created_at DESC, id DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS creations_creator_idx ON creations (creator_id, created_at DESC);
CREATE TABLE IF NOT EXISTS publication_moderation (
  id           TEXT PRIMARY KEY,
  creation_id  TEXT NOT NULL UNIQUE REFERENCES creations(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  flag_reason  TEXT,
  reviewed_at  TIMESTAMPTZ
);
-- Phase 4: governance. Additive and idempotent, safe to re-run on existing databases.
ALTER TABLE publication_moderation DROP CONSTRAINT IF EXISTS publication_moderation_status_check;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS remix_permitted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS root_id TEXT;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS remix_depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE creations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS revoked_because TEXT;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS revocation_mode TEXT;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS public_key TEXT;
UPDATE creations SET root_id = id WHERE root_id IS NULL;
CREATE INDEX IF NOT EXISTS creations_root_idx ON creations (root_id);
CREATE INDEX IF NOT EXISTS creations_hash_idx ON creations (content_hash);
CREATE INDEX IF NOT EXISTS creations_purge_idx ON creations (purge_after) WHERE revoked_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS docs (
  collection  TEXT NOT NULL,
  id          TEXT NOT NULL,
  k1          TEXT,
  k2          TEXT,
  n1          DOUBLE PRECISION,
  data        JSONB NOT NULL,
  PRIMARY KEY (collection, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS docs_unique_pair_idx ON docs (collection, k1, k2) WHERE k1 IS NOT NULL AND k2 IS NOT NULL;
CREATE INDEX IF NOT EXISTS docs_lookup_idx ON docs (collection, k1, n1);
`;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

function toCreator(r: any): StoredCreator {
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? null,
    createdAt: iso(r.created_at),
  };
}

function toCreation(r: any): StoredCreation {
  return {
    id: r.id,
    creatorId: r.creator_id,
    title: r.title,
    genre: r.genre,
    audioUrl: r.audio_url,
    waveformJson: r.waveform_json ?? null,
    lyrics: r.lyrics,
    isPublished: r.is_published,
    remixOfId: r.remix_of_id ?? null,
    provenance: r.provenance,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    kind: r.kind,
    durationLabel: r.duration_label ?? null,
    vocalArrangement: r.vocal_arrangement ?? null,
    narratorInfo: r.narrator_info ?? null,
    audioKey: r.audio_key,
    audioMime: r.audio_mime,
    audioBytes: Number(r.audio_bytes),
    clientRef: r.client_ref ?? null,
    remixPermitted: Boolean(r.remix_permitted),
    rootId: r.root_id ?? r.id,
    remixDepth: Number(r.remix_depth ?? 0),
    contentHash: r.content_hash ?? '',
    revokedAt: isoOrNull(r.revoked_at),
    revokedBecause: r.revoked_because ?? null,
    revocationMode: r.revocation_mode ?? null,
    purgeAfter: isoOrNull(r.purge_after),
    publicKey: r.public_key ?? null,
  };
}

function toModeration(r: any): PublicationModeration {
  return {
    id: r.id,
    creationId: r.creation_id,
    status: r.status,
    flagReason: r.flag_reason ?? null,
    reviewedAt: isoOrNull(r.reviewed_at),
  };
}

/** PostgreSQL catalog for production. `pg` is imported lazily and only when configured. */
export class PostgresCatalogRepository implements CatalogRepository {
  readonly driver = 'postgres';
  private pool!: PgPool;

  constructor(private readonly connectionString: string) {}

  async init(): Promise<void> {
    const { default: pg } = await import('pg');
    this.pool = new pg.Pool({
      connectionString: this.connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    await this.pool.query(SCHEMA);
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }

  async getCreatorById(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM creators WHERE id = $1', [id]);
    return rows[0] ? toCreator(rows[0]) : null;
  }

  async getCreatorByHandle(handle: string) {
    const { rows } = await this.pool.query('SELECT * FROM creators WHERE handle = $1', [handle]);
    return rows[0] ? toCreator(rows[0]) : null;
  }

  async getCreatorsByIds(ids: string[]) {
    if (!ids.length) return [];
    const { rows } = await this.pool.query('SELECT * FROM creators WHERE id = ANY($1::text[])', [ids]);
    return rows.map(toCreator);
  }

  async createCreator(c: StoredCreator) {
    try {
      await this.pool.query(
        'INSERT INTO creators (id, handle, display_name, avatar_url, created_at) VALUES ($1,$2,$3,$4,$5)',
        [c.id, c.handle, c.displayName, c.avatarUrl, c.createdAt]
      );
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') throw new HandleTakenError(c.handle);
      throw err;
    }
  }

  /** Column / value pairs, in one place so insert and update can never drift apart. */
  private creationColumns(c: StoredCreation): [string, unknown][] {
    return [
      ['id', c.id], ['creator_id', c.creatorId], ['title', c.title], ['genre', c.genre],
      ['audio_url', c.audioUrl], ['waveform_json', c.waveformJson], ['lyrics', c.lyrics],
      ['is_published', c.isPublished], ['remix_of_id', c.remixOfId], ['provenance', c.provenance],
      ['created_at', c.createdAt], ['updated_at', c.updatedAt], ['kind', c.kind],
      ['duration_label', c.durationLabel], ['vocal_arrangement', c.vocalArrangement],
      ['narrator_info', c.narratorInfo], ['audio_key', c.audioKey], ['audio_mime', c.audioMime],
      ['audio_bytes', c.audioBytes], ['client_ref', c.clientRef],
      ['remix_permitted', c.remixPermitted], ['root_id', c.rootId ?? c.id], ['remix_depth', c.remixDepth],
      ['content_hash', c.contentHash], ['revoked_at', c.revokedAt], ['revoked_because', c.revokedBecause],
      ['revocation_mode', c.revocationMode], ['purge_after', c.purgeAfter], ['public_key', c.publicKey],
    ];
  }

  async createCreation(c: StoredCreation) {
    const cols = this.creationColumns(c);
    await this.pool.query(
      `INSERT INTO creations (${cols.map(([n]) => n).join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map(([, v]) => v)
    );
  }

  async getCreation(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM creations WHERE id = $1', [id]);
    return rows[0] ? toCreation(rows[0]) : null;
  }

  async getCreationByClientRef(creatorId: string, clientRef: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM creations WHERE creator_id = $1 AND client_ref = $2',
      [creatorId, clientRef]
    );
    return rows[0] ? toCreation(rows[0]) : null;
  }

  async updateCreation(c: StoredCreation) {
    const cols = this.creationColumns(c).filter(([n]) => n !== 'id');
    const res = await this.pool.query(
      `UPDATE creations SET ${cols.map(([n], i) => `${n} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [c.id, ...cols.map(([, v]) => v)]
    );
    if (!res.rowCount) throw new Error('Creation not found');
  }

  async countByCreator(creatorId: string) {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM creations WHERE creator_id = $1', [creatorId]);
    return rows[0].n as number;
  }

  async listByCreator(creatorId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM creations WHERE creator_id = $1 ORDER BY created_at DESC, id DESC',
      [creatorId]
    );
    return rows.map(toCreation);
  }

  async listPublished({ limit, cursor }: { limit: number; cursor?: string | null }): Promise<PublishedPage> {
    const decoded = decodeCursor(cursor);
    const params: unknown[] = [limit + 1];
    let where = `c.is_published AND c.revoked_at IS NULL AND m.status = 'approved'`;
    if (decoded) {
      params.push(decoded.createdAt, decoded.id);
      where += ' AND (c.created_at, c.id) < ($2::timestamptz, $3::text)';
    }
    const { rows } = await this.pool.query(
      `SELECT c.* FROM creations c
         JOIN publication_moderation m ON m.creation_id = c.id
        WHERE ${where}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $1`,
      params
    );
    const all = rows.map(toCreation);
    const items = all.slice(0, limit);
    return {
      items,
      nextCursor: all.length > limit && items.length ? encodeCursor(items[items.length - 1]) : null,
    };
  }

  async deleteCreation(id: string) {
    await this.pool.query('DELETE FROM creations WHERE id = $1', [id]);
  }

  async getModeration(creationId: string) {
    const { rows } = await this.pool.query('SELECT * FROM publication_moderation WHERE creation_id = $1', [creationId]);
    return rows[0] ? toModeration(rows[0]) : null;
  }

  async saveModeration(m: PublicationModeration) {
    await this.pool.query(
      `INSERT INTO publication_moderation (id, creation_id, status, flag_reason, reviewed_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (creation_id) DO UPDATE
         SET status = EXCLUDED.status, flag_reason = EXCLUDED.flag_reason, reviewed_at = EXCLUDED.reviewed_at`,
      [m.id, m.creationId, m.status, m.flagReason, m.reviewedAt]
    );
  }

  async listByRoot(rootId: string) {
    const { rows } = await this.pool.query('SELECT * FROM creations WHERE root_id = $1', [rootId]);
    return rows.map(toCreation);
  }

  async listPurgeDue(nowIso: string, limit: number) {
    const { rows } = await this.pool.query(
      'SELECT * FROM creations WHERE revoked_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= $1 ORDER BY purge_after LIMIT $2',
      [nowIso, limit]
    );
    return rows.map(toCreation);
  }

  async countByContentHash(hash: string) {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM creations WHERE content_hash = $1', [hash]);
    return rows[0].n as number;
  }

  // ------------------------------------------------------------- document store
  private toDoc<T>(r: any): DocRow<T> {
    return { id: r.id, data: r.data as T, keys: { k1: r.k1 ?? null, k2: r.k2 ?? null, n1: r.n1 ?? null } };
  }

  async putDoc<T>(collection: string, id: string, data: T, keys: DocKeys = {}) {
    await this.pool.query(
      `INSERT INTO docs (collection, id, k1, k2, n1, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (collection, id) DO UPDATE SET k1 = EXCLUDED.k1, k2 = EXCLUDED.k2, n1 = EXCLUDED.n1, data = EXCLUDED.data`,
      [collection, id, keys.k1 ?? null, keys.k2 ?? null, keys.n1 ?? null, JSON.stringify(data)]
    );
  }

  async insertDocUnique<T>(collection: string, id: string, data: T, keys: DocKeys = {}) {
    const res = await this.pool.query(
      `INSERT INTO docs (collection, id, k1, k2, n1, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
      [collection, id, keys.k1 ?? null, keys.k2 ?? null, keys.n1 ?? null, JSON.stringify(data)]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async getDoc<T>(collection: string, id: string) {
    const { rows } = await this.pool.query('SELECT data FROM docs WHERE collection = $1 AND id = $2', [collection, id]);
    return rows[0] ? (rows[0].data as T) : null;
  }

  async deleteDoc(collection: string, id: string) {
    await this.pool.query('DELETE FROM docs WHERE collection = $1 AND id = $2', [collection, id]);
  }

  async findDocs<T>(collection: string, filter: { k1?: string; k2?: string; limit?: number } = {}) {
    const params: unknown[] = [collection];
    let where = 'collection = $1';
    if (filter.k1 !== undefined) {
      params.push(filter.k1);
      where += ` AND k1 = $${params.length}`;
    }
    if (filter.k2 !== undefined) {
      params.push(filter.k2);
      where += ` AND k2 = $${params.length}`;
    }
    params.push(filter.limit ?? 500);
    const { rows } = await this.pool.query(
      `SELECT * FROM docs WHERE ${where} ORDER BY n1 NULLS FIRST, id LIMIT $${params.length}`,
      params
    );
    return rows.map((r) => this.toDoc<T>(r));
  }

  async claimDue<T>(collection: string, now: number, leaseUntil: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM docs
          WHERE collection = $1 AND k1 IN ('queued','leased') AND n1 <= $2
          ORDER BY n1 LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [collection, now]
      );
      if (!rows[0]) {
        await client.query('COMMIT');
        return null;
      }
      await client.query(`UPDATE docs SET k1 = 'leased', n1 = $3 WHERE collection = $1 AND id = $2`, [
        collection,
        rows[0].id,
        leaseUntil,
      ]);
      await client.query('COMMIT');
      return this.toDoc<T>({ ...rows[0], k1: 'leased', n1: leaseUntil });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
