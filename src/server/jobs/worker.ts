import type { JobQueue, JobRecord } from './JobQueue';

export type JobHandler = (job: JobRecord) => Promise<void>;

export interface WorkerOptions {
  pollMs?: number;
  leaseMs?: number;
  concurrency?: number;
  log?: (msg: string) => void;
}

/**
 * In-process worker. Polls the durable queue, runs registered handlers, and retries with
 * backoff. It can later run as a separate process: nothing here depends on the HTTP server.
 */
export class JobWorker {
  private handlers = new Map<string, JobHandler>();
  private timer: NodeJS.Timeout | null = null;
  private recurring: NodeJS.Timeout[] = [];
  private running = 0;
  private stopped = true;
  private readonly pollMs: number;
  private readonly leaseMs: number;
  private readonly concurrency: number;
  private readonly log: (msg: string) => void;

  constructor(
    readonly queue: JobQueue,
    opts: WorkerOptions = {}
  ) {
    this.pollMs = opts.pollMs ?? 2000;
    this.leaseMs = opts.leaseMs ?? 60_000;
    this.concurrency = opts.concurrency ?? 4;
    this.log = opts.log ?? ((m) => console.warn(m));
  }

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  /** Enqueues `type` every `everyMs` (deduplicated, so slow handlers never pile up). */
  every(type: string, everyMs: number, payload: unknown = {}): void {
    const tick = () => void this.queue.enqueue(type, payload, { dedupeKey: 'recurring' }).catch(() => undefined);
    const t = setInterval(tick, everyMs);
    t.unref();
    this.recurring.push(t);
    tick();
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const loop = () => {
      if (this.stopped) return;
      void this.drain().finally(() => {
        if (!this.stopped) {
          this.timer = setTimeout(loop, this.pollMs);
          this.timer.unref();
        }
      });
    };
    loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.recurring.forEach(clearInterval);
    this.recurring = [];
  }

  /** Runs due jobs until none are left (bounded concurrency). Exposed for deterministic tests. */
  async drain(): Promise<number> {
    let processed = 0;
    const lane = async () => {
      for (;;) {
        const job = await this.queue.lease(this.leaseMs);
        if (!job) return;
        this.running++;
        try {
          const handler = this.handlers.get(job.type);
          if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
          await handler(job);
          await this.queue.complete(job);
        } catch (err) {
          const outcome = await this.queue.fail(job, err);
          if (outcome === 'dead') this.log(`Job ${job.type}/${job.id} failed permanently: ${(err as Error)?.message}`);
        } finally {
          this.running--;
          processed++;
        }
      }
    };
    await Promise.all(Array.from({ length: this.concurrency }, lane));
    return processed;
  }
}
