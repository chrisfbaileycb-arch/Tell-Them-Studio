import { randomUUID } from 'node:crypto';
import type { DocStore } from '../catalog/CatalogRepository';

export interface JobRecord<P = unknown> {
  id: string;
  type: string;
  payload: P;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
}

export interface EnqueueOptions {
  /** Epoch ms at which the job becomes due (default: now). */
  runAt?: number;
  /** Jobs with the same type + dedupeKey are enqueued at most once while pending. */
  dedupeKey?: string;
  maxAttempts?: number;
}

export interface JobStats {
  queued: number;
  leased: number;
  dead: number;
}

const COLLECTION = 'jobs';
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/** Exponential backoff with a cap: 2s, 4s, 8s, ... up to one hour (base overridable for tests). */
export const backoffMs = (attempt: number) => {
  const base = Number(process.env.JOB_BACKOFF_BASE_MS) > 0 ? Number(process.env.JOB_BACKOFF_BASE_MS) : 1000;
  return Math.min(MAX_BACKOFF_MS, base * 2 ** Math.max(1, attempt));
};

/**
 * Durable job queue on top of the catalog's document store, so it automatically works with
 * both the file and the Postgres drivers (Postgres leases with FOR UPDATE SKIP LOCKED).
 * Delivery is at-least-once: handlers must be idempotent.
 */
export class JobQueue {
  constructor(
    private readonly store: DocStore,
    private readonly now: () => number = Date.now
  ) {}

  async enqueue<P>(type: string, payload: P, opts: EnqueueOptions = {}): Promise<boolean> {
    const id = opts.dedupeKey ? `${type}:${opts.dedupeKey}` : randomUUID();
    const record: JobRecord<P> = {
      id,
      type,
      payload,
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 8,
      lastError: null,
      createdAt: new Date(this.now()).toISOString(),
    };
    return this.store.insertDocUnique(COLLECTION, id, record, { k1: 'queued', k2: null, n1: opts.runAt ?? this.now() });
  }

  /** Claims the next due job (or a job whose lease expired) and counts the attempt. */
  async lease(leaseMs: number): Promise<JobRecord | null> {
    const now = this.now();
    const row = await this.store.claimDue<JobRecord>(COLLECTION, now, now + leaseMs);
    if (!row) return null;
    const record = { ...row.data, attempts: row.data.attempts + 1 };
    await this.store.putDoc(COLLECTION, record.id, record, { k1: 'leased', n1: now + leaseMs });
    return record;
  }

  async complete(job: JobRecord): Promise<void> {
    await this.store.deleteDoc(COLLECTION, job.id);
  }

  /** Reschedules with backoff, or parks the job as dead after `maxAttempts`. */
  async fail(job: JobRecord, error: unknown): Promise<'retry' | 'dead'> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const record = { ...job, lastError: message };
    if (job.attempts >= job.maxAttempts) {
      await this.store.putDoc(COLLECTION, job.id, record, { k1: 'dead', n1: this.now() });
      return 'dead';
    }
    await this.store.putDoc(COLLECTION, job.id, record, { k1: 'queued', n1: this.now() + backoffMs(job.attempts) });
    return 'retry';
  }

  async stats(): Promise<JobStats> {
    const count = async (k1: string) => (await this.store.findDocs(COLLECTION, { k1, limit: 1000 })).length;
    return { queued: await count('queued'), leased: await count('leased'), dead: await count('dead') };
  }

  async listDead(limit = 50): Promise<JobRecord[]> {
    return (await this.store.findDocs<JobRecord>(COLLECTION, { k1: 'dead', limit })).map((r) => r.data);
  }
}
