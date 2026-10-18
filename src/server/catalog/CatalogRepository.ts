import type {
  PublicationModeration,
  StoredCreation,
  StoredCreator,
} from '../../types/community';

export interface PublishedPage {
  items: StoredCreation[];
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
}

/** Thrown by `createCreator` when the handle is already claimed (race-safe uniqueness). */
export class HandleTakenError extends Error {
  constructor(handle: string) {
    super(`Handle ${handle} is already claimed`);
    this.name = 'HandleTakenError';
  }
}

export interface DocKeys {
  /** Secondary lookup keys (also the uniqueness pair when both are set). */
  k1?: string | null;
  k2?: string | null;
  /** Numeric sort/schedule key (e.g. epoch ms for job due times). */
  n1?: number | null;
}

export interface DocRow<T> {
  id: string;
  data: T;
  keys: Required<DocKeys>;
}

/**
 * Minimal document store for governance and distribution entities (reports, blocklist, shows,
 * webhooks, jobs, praise...). Keeps those features independent of the creation tables and keeps
 * driver code small: Postgres maps it to one JSONB table, the file driver to in-memory maps.
 */
export interface DocStore {
  putDoc<T>(collection: string, id: string, data: T, keys?: DocKeys): Promise<void>;
  /**
   * Inserts only when no document with the same id, nor the same (k1, k2) pair when both are
   * set, exists in the collection. Returns false (and writes nothing) on conflict.
   */
  insertDocUnique<T>(collection: string, id: string, data: T, keys?: DocKeys): Promise<boolean>;
  getDoc<T>(collection: string, id: string): Promise<T | null>;
  deleteDoc(collection: string, id: string): Promise<void>;
  /** Filters on any provided key; results ordered by n1 then id. */
  findDocs<T>(collection: string, filter?: { k1?: string; k2?: string; limit?: number }): Promise<DocRow<T>[]>;
  /**
   * Atomically claims the next document with k1 in ('queued','leased') and n1 <= now (by n1):
   * sets k1='leased', n1=leaseUntil and returns it. Safe across workers/processes.
   */
  claimDue<T>(collection: string, now: number, leaseUntil: number): Promise<DocRow<T> | null>;
}

/**
 * Durable catalog persistence contract. Implementations: file/JSON (local development)
 * and PostgreSQL (production). Route code must only depend on this interface.
 */
export interface CatalogRepository extends DocStore {
  readonly driver: string;
  init(): Promise<void>;
  close(): Promise<void>;

  getCreatorById(id: string): Promise<StoredCreator | null>;
  getCreatorByHandle(handle: string): Promise<StoredCreator | null>;
  getCreatorsByIds(ids: string[]): Promise<StoredCreator[]>;
  createCreator(creator: StoredCreator): Promise<void>;

  createCreation(creation: StoredCreation): Promise<void>;
  getCreation(id: string): Promise<StoredCreation | null>;
  getCreationByClientRef(creatorId: string, clientRef: string): Promise<StoredCreation | null>;
  /** Replaces the stored record (matched by id). */
  updateCreation(creation: StoredCreation): Promise<void>;
  countByCreator(creatorId: string): Promise<number>;
  listByCreator(creatorId: string): Promise<StoredCreation[]>;
  /** Published AND moderation-approved only, newest first. */
  listPublished(opts: { limit: number; cursor?: string | null }): Promise<PublishedPage>;
  /** Removes the creation and its moderation row. */
  deleteCreation(id: string): Promise<void>;
  /** Every creation in a remix tree, including the root itself (rootId = tree id). */
  listByRoot(rootId: string): Promise<StoredCreation[]>;
  /** Revoked creations whose purge window has elapsed (purgeAfter <= nowIso). */
  listPurgeDue(nowIso: string, limit: number): Promise<StoredCreation[]>;
  /** Looks up a stored creation by audio content hash across all creators (blocklist checks). */
  countByContentHash(hash: string): Promise<number>;

  getModeration(creationId: string): Promise<PublicationModeration | null>;
  /** Upserts by `creationId`. */
  saveModeration(moderation: PublicationModeration): Promise<void>;
}

/** Cursor helpers shared by drivers: `${createdAt}|${id}`, sorted descending. */
export function encodeCursor(c: Pick<StoredCreation, 'createdAt' | 'id'>): string {
  return Buffer.from(`${c.createdAt}|${c.id}`).toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Strictly "after" in descending (createdAt, id) order. */
export function isAfterCursor(
  item: Pick<StoredCreation, 'createdAt' | 'id'>,
  cursor: { createdAt: string; id: string }
): boolean {
  if (item.createdAt !== cursor.createdAt) return item.createdAt < cursor.createdAt;
  return item.id < cursor.id;
}
