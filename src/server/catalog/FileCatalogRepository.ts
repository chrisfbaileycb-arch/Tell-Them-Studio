import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
  isAfterCursor,
} from './CatalogRepository';

interface FileState {
  version: 1;
  creators: Record<string, StoredCreator>;
  creations: Record<string, StoredCreation>;
  moderation: Record<string, PublicationModeration>;
  docs: Record<string, Record<string, DocRow<unknown>>>;
}

const emptyState = (): FileState => ({ version: 1, creators: {}, creations: {}, moderation: {}, docs: {} });

/** Fills governance fields for records persisted before Phase 4. */
function upgrade(c: StoredCreation): StoredCreation {
  return {
    ...c,
    remixPermitted: c.remixPermitted ?? false,
    rootId: c.rootId ?? c.id,
    remixDepth: c.remixDepth ?? 0,
    revokedAt: c.revokedAt ?? null,
    revokedBecause: c.revokedBecause ?? null,
    revocationMode: c.revocationMode ?? null,
    purgeAfter: c.purgeAfter ?? null,
    publicKey: c.publicKey ?? null,
    contentHash: c.contentHash ?? '',
  };
}

/**
 * Zero-dependency catalog for local development and tests.
 * State is held in memory and persisted as JSON with atomic write-then-rename.
 * Pass `dataDir = null` for a purely in-memory catalog.
 */
export class FileCatalogRepository implements CatalogRepository {
  readonly driver: string;
  private state: FileState = emptyState();
  private writeChain: Promise<void> = Promise.resolve();
  private readonly file: string | null;

  constructor(private readonly dataDir: string | null) {
    this.file = dataDir ? path.join(dataDir, 'catalog.json') : null;
    this.driver = dataDir ? 'file' : 'memory';
  }

  async init(): Promise<void> {
    if (!this.file || !this.dataDir) return;
    await mkdir(this.dataDir, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as FileState;
      if (parsed && parsed.version === 1) {
        this.state = {
          version: 1,
          creators: parsed.creators ?? {},
          creations: Object.fromEntries(
            Object.entries(parsed.creations ?? {}).map(([id, c]) => [id, upgrade(c)])
          ),
          moderation: parsed.moderation ?? {},
          docs: parsed.docs ?? {},
        };
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }
  }

  async close(): Promise<void> {
    await this.writeChain;
  }

  /** Serialises disk writes so concurrent requests can never interleave a partial file. */
  private persist(): Promise<void> {
    const file = this.file;
    if (!file) return Promise.resolve();
    const next = this.writeChain.then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(this.state), 'utf8');
      await rename(tmp, file);
    });
    // Keep the chain alive after a failure; the caller still observes the rejection.
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  async getCreatorById(id: string) {
    return this.state.creators[id] ?? null;
  }

  async getCreatorByHandle(handle: string) {
    return Object.values(this.state.creators).find((c) => c.handle === handle) ?? null;
  }

  async getCreatorsByIds(ids: string[]) {
    return ids.map((id) => this.state.creators[id]).filter((c): c is StoredCreator => Boolean(c));
  }

  async createCreator(creator: StoredCreator) {
    // Check-and-set is synchronous, so concurrent claims cannot both succeed.
    if (Object.values(this.state.creators).some((c) => c.handle === creator.handle)) {
      throw new HandleTakenError(creator.handle);
    }
    this.state.creators[creator.id] = creator;
    await this.persist();
  }

  async createCreation(creation: StoredCreation) {
    this.state.creations[creation.id] = creation;
    await this.persist();
  }

  async getCreation(id: string) {
    return this.state.creations[id] ?? null;
  }

  async getCreationByClientRef(creatorId: string, clientRef: string) {
    return (
      Object.values(this.state.creations).find(
        (c) => c.creatorId === creatorId && c.clientRef === clientRef
      ) ?? null
    );
  }

  async updateCreation(creation: StoredCreation) {
    if (!this.state.creations[creation.id]) throw new Error('Creation not found');
    this.state.creations[creation.id] = creation;
    await this.persist();
  }

  async countByCreator(creatorId: string) {
    return Object.values(this.state.creations).filter((c) => c.creatorId === creatorId).length;
  }

  async listByCreator(creatorId: string) {
    return Object.values(this.state.creations)
      .filter((c) => c.creatorId === creatorId)
      .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
  }

  async listPublished({ limit, cursor }: { limit: number; cursor?: string | null }): Promise<PublishedPage> {
    const decoded = decodeCursor(cursor);
    const rows = Object.values(this.state.creations)
      .filter((c) => c.isPublished && !c.revokedAt && this.state.moderation[c.id]?.status === 'approved')
      .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1))
      .filter((c) => !decoded || isAfterCursor(c, decoded));
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit && items.length ? encodeCursor(items[items.length - 1]) : null;
    return { items, nextCursor };
  }

  async deleteCreation(id: string) {
    delete this.state.creations[id];
    delete this.state.moderation[id];
    await this.persist();
  }

  async getModeration(creationId: string) {
    return this.state.moderation[creationId] ?? null;
  }

  async saveModeration(moderation: PublicationModeration) {
    this.state.moderation[moderation.creationId] = moderation;
    await this.persist();
  }

  async listByRoot(rootId: string) {
    return Object.values(this.state.creations).filter((c) => (c.rootId ?? c.id) === rootId);
  }

  async listPurgeDue(nowIso: string, limit: number) {
    return Object.values(this.state.creations)
      .filter((c) => c.revokedAt && c.purgeAfter && c.purgeAfter <= nowIso)
      .slice(0, limit);
  }

  async countByContentHash(hash: string) {
    return Object.values(this.state.creations).filter((c) => c.contentHash === hash).length;
  }

  // ------------------------------------------------------------- document store
  private collection(name: string) {
    return (this.state.docs[name] ??= {});
  }

  private rowKeys(keys: DocKeys = {}): Required<DocKeys> {
    return { k1: keys.k1 ?? null, k2: keys.k2 ?? null, n1: keys.n1 ?? null };
  }

  async putDoc<T>(collection: string, id: string, data: T, keys?: DocKeys) {
    this.collection(collection)[id] = { id, data, keys: this.rowKeys(keys) };
    await this.persist();
  }

  async insertDocUnique<T>(collection: string, id: string, data: T, keys?: DocKeys) {
    const col = this.collection(collection);
    const k = this.rowKeys(keys);
    // Check-and-set is synchronous, so concurrent inserts cannot both succeed.
    if (col[id]) return false;
    if (k.k1 !== null && k.k2 !== null && Object.values(col).some((r) => r.keys.k1 === k.k1 && r.keys.k2 === k.k2)) {
      return false;
    }
    col[id] = { id, data, keys: k };
    await this.persist();
    return true;
  }

  async getDoc<T>(collection: string, id: string) {
    const data = this.state.docs[collection]?.[id]?.data;
    return data === undefined ? null : (structuredClone(data) as T);
  }

  async deleteDoc(collection: string, id: string) {
    if (this.state.docs[collection]?.[id]) {
      delete this.state.docs[collection][id];
      await this.persist();
    }
  }

  async findDocs<T>(collection: string, filter: { k1?: string; k2?: string; limit?: number } = {}) {
    const rows = Object.values(this.state.docs[collection] ?? {})
      .filter((r) => (filter.k1 === undefined || r.keys.k1 === filter.k1) && (filter.k2 === undefined || r.keys.k2 === filter.k2))
      .sort((a, b) => (a.keys.n1 ?? 0) - (b.keys.n1 ?? 0) || (a.id < b.id ? -1 : 1));
    return structuredClone(rows.slice(0, filter.limit ?? 500)) as DocRow<T>[];
  }

  async claimDue<T>(collection: string, now: number, leaseUntil: number) {
    const due = Object.values(this.state.docs[collection] ?? {})
      .filter((r) => (r.keys.k1 === 'queued' || r.keys.k1 === 'leased') && (r.keys.n1 ?? 0) <= now)
      .sort((a, b) => (a.keys.n1 ?? 0) - (b.keys.n1 ?? 0))[0];
    if (!due) return null;
    due.keys = { ...due.keys, k1: 'leased', n1: leaseUntil };
    await this.persist();
    return structuredClone(due) as DocRow<T>;
  }
}
