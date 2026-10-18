import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CatalogHealth } from '../../types/community';
import { LocalObjectStorage } from '../storage/LocalObjectStorage';
import { ObjectStorageAdapter, hasS3Credentials } from '../storage/ObjectStorageAdapter';
import { S3ObjectStorage } from '../storage/S3ObjectStorage';
import { JobQueue } from '../jobs/JobQueue';
import { JobWorker } from '../jobs/worker';
import { DEFAULT_GOVERNANCE, GovernanceConfig, registerGovernanceHandlers } from '../governance';
import { SafetyClassifier, createSafetyClassifier } from '../safety/SafetyClassifier';
import { DEFAULT_DISTRIBUTION, DistributionConfig } from '../distribution/config';
import { registerEpisodeHandlers } from '../distribution/episodes';
import { registerWebhookHandlers } from '../distribution/webhooks';
import { CatalogRepository } from './CatalogRepository';
import { FileCatalogRepository } from './FileCatalogRepository';
import { PostgresCatalogRepository } from './PostgresCatalogRepository';

export interface CdnConfig {
  baseUrl?: string;
  purgeWebhookUrl?: string;
}

export interface CatalogContext {
  repo: CatalogRepository;
  storage: ObjectStorageAdapter;
  sessionSecret: Buffer;
  secureCookies: boolean;
  jobs: JobQueue;
  worker: JobWorker;
  classifier: SafetyClassifier;
  config: GovernanceConfig;
  distribution: DistributionConfig;
  cdn: CdnConfig;
}

/** Raised when the catalog is intentionally or unavoidably off; routes answer 503 and clients fall back. */
export class CatalogDisabledError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CatalogDisabledError';
  }
}

type Env = Record<string, string | undefined>;

async function resolveSessionSecret(env: Env, dataDir: string | null): Promise<Buffer> {
  const configured = env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) {
    return Buffer.from(configured, 'utf8');
  }
  if (!dataDir) return randomBytes(48);
  // Persist a generated secret when possible so sessions survive restarts; fall back to ephemeral secret on read-only fs.
  const file = path.join(dataDir, 'session.secret');
  try {
    return Buffer.from((await readFile(file, 'utf8')).trim(), 'hex');
  } catch {
    const secret = randomBytes(48);
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(file, secret.toString('hex'), { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Read-only container filesystem: continue with in-memory secret
    }
    return secret;
  }
}

/**
 * Builds the catalog from environment configuration with out-of-the-box local defaults:
 *  - `DATABASE_URL`        -> PostgreSQL repository, silently falling back to `FileCatalogRepository`
 *  - `CATALOG_DATA_DIR`    -> Defaults to `./data` (or `:memory:` for volatile storage)
 *  - `S3_*`                -> S3-compatible object storage when credentials are provided, silently falling back to `LocalObjectStorage`
 *  - `COOKIE_SECURE`       -> Defaults to `false`
 */
export async function createCatalogContext(env: Env = process.env): Promise<CatalogContext> {
  const production = env.NODE_ENV === 'production';
  const explicitDir = env.CATALOG_DATA_DIR?.trim() || './data';
  if (explicitDir === 'disabled') {
    throw new CatalogDisabledError('Community catalog explicitly disabled via CATALOG_DATA_DIR=disabled.');
  }
  const volatile = explicitDir === ':memory:';
  const dataDir = volatile ? null : path.resolve(explicitDir);

  let repo: CatalogRepository;
  if (env.DATABASE_URL?.trim()) {
    const pgRepo = new PostgresCatalogRepository(env.DATABASE_URL.trim());
    try {
      await pgRepo.init();
      repo = pgRepo;
    } catch {
      repo = new FileCatalogRepository(dataDir);
      try {
        await repo.init();
      } catch {
        repo = new FileCatalogRepository(null);
        await repo.init();
      }
    }
  } else if (volatile) {
    repo = new FileCatalogRepository(null);
    await repo.init();
  } else {
    repo = new FileCatalogRepository(dataDir);
    try {
      await repo.init();
    } catch {
      repo = new FileCatalogRepository(null);
      await repo.init();
    }
  }

  let storage: ObjectStorageAdapter;
  if (hasS3Credentials(env)) {
    const s3Storage = new S3ObjectStorage({
      bucket: env.S3_BUCKET!.trim(),
      region: env.S3_REGION?.trim() || 'auto',
      endpoint: env.S3_ENDPOINT?.trim() || undefined,
      accessKeyId: env.S3_ACCESS_KEY_ID?.trim() || undefined,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY?.trim() || undefined,
      keyPrefix: env.S3_KEY_PREFIX?.trim() || undefined,
    });
    try {
      await s3Storage.init();
      storage = s3Storage;
    } catch {
      storage = new LocalObjectStorage(dataDir || (await mkdtemp(path.join(os.tmpdir(), 'tell-them-objects-'))));
      await storage.init();
    }
  } else if (volatile || !dataDir) {
    storage = new LocalObjectStorage(await mkdtemp(path.join(os.tmpdir(), 'tell-them-objects-')));
    await storage.init();
  } else {
    storage = new LocalObjectStorage(dataDir);
    try {
      await storage.init();
    } catch {
      storage = new LocalObjectStorage(await mkdtemp(path.join(os.tmpdir(), 'tell-them-objects-')));
      await storage.init();
    }
  }

  const sessionSecret = await resolveSessionSecret(env, volatile ? null : dataDir);
  const secureCookies = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : false;

  const num = (v: string | undefined, fallback: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  const config: GovernanceConfig = {
    purgeGraceMs: num(env.PURGE_GRACE_DAYS, DEFAULT_GOVERNANCE.purgeGraceMs / 86_400_000) * 86_400_000,
    reportThreshold: num(env.REPORT_FLAG_THRESHOLD, DEFAULT_GOVERNANCE.reportThreshold),
    maxRemixDepth: num(env.MAX_REMIX_DEPTH, DEFAULT_GOVERNANCE.maxRemixDepth),
    purgeSweepMs: num(env.PURGE_SWEEP_MS, DEFAULT_GOVERNANCE.purgeSweepMs),
    adminToken: env.ADMIN_API_TOKEN?.trim() || undefined,
  };
  const distribution: DistributionConfig = {
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || undefined,
    allowPrivateWebhookTargets: env.WEBHOOK_ALLOW_PRIVATE === 'true' && !production,
    webhookMaxAttempts: num(env.WEBHOOK_MAX_ATTEMPTS, DEFAULT_DISTRIBUTION.webhookMaxAttempts),
    webhookTimeoutMs: num(env.WEBHOOK_TIMEOUT_MS, DEFAULT_DISTRIBUTION.webhookTimeoutMs),
  };
  const cdn: CdnConfig = {
    baseUrl: env.CDN_BASE_URL?.trim().replace(/\/$/, '') || undefined,
    purgeWebhookUrl: env.CDN_PURGE_WEBHOOK_URL?.trim() || undefined,
  };
  const jobs = new JobQueue(repo);
  const worker = new JobWorker(jobs, { pollMs: num(env.JOB_POLL_MS, 2000) });
  const ctx: CatalogContext = {
    repo,
    storage,
    sessionSecret,
    secureCookies,
    jobs,
    worker,
    classifier: createSafetyClassifier(env),
    config,
    distribution,
    cdn,
  };
  registerGovernanceHandlers(ctx);
  registerWebhookHandlers(ctx);
  registerEpisodeHandlers(ctx);
  if (env.WORKER_ENABLED !== 'false') worker.start();
  return ctx;
}

/** Starts the catalog once; resolves to a context or rejects with a descriptive error. */
export function startCatalog(env: Env = process.env) {
  const promise = createCatalogContext(env);
  // Prevent unhandled-rejection noise: callers observe the failure through `getContext`.
  let failure: Error | null = null;
  promise.catch((err: unknown) => {
    failure = err instanceof Error ? err : new Error(String(err));
    console.warn(
      failure instanceof CatalogDisabledError
        ? `Community catalog disabled: ${failure.message}`
        : `Community catalog failed to start: ${failure.message}`
    );
  });
  const health = async (): Promise<CatalogHealth> => {
    try {
      const ctx = await promise;
      return {
        enabled: true,
        driver: ctx.repo.driver,
        storage: ctx.storage.driver,
        jobs: await ctx.jobs.stats(),
        moderation: { classifier: ctx.classifier.name, adminEnabled: Boolean(ctx.config.adminToken) },
        distribution: { feeds: true, webhooks: { allowPrivateTargets: ctx.distribution.allowPrivateWebhookTargets } },
        cdn: { enabled: Boolean(ctx.cdn.baseUrl), baseUrl: ctx.cdn.baseUrl },
      };
    } catch {
      return { enabled: false, driver: null, storage: null };
    }
  };
  return { getContext: () => promise, health };
}
