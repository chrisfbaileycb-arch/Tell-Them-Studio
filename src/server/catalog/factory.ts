import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CatalogHealth } from '../../types/community';
import { LocalObjectStorage } from '../storage/LocalObjectStorage';
import { ObjectStorageAdapter } from '../storage/ObjectStorageAdapter';
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

async function resolveSessionSecret(env: Env, dataDir: string | null, production: boolean): Promise<Buffer> {
  const configured = env.SESSION_SECRET?.trim();
  if (configured) {
    if (configured.length < 32) throw new CatalogDisabledError('SESSION_SECRET must be at least 32 characters.');
    return Buffer.from(configured, 'utf8');
  }
  if (production) throw new CatalogDisabledError('SESSION_SECRET is required in production to enable creator sessions.');
  if (!dataDir) return randomBytes(48);
  // Development convenience: persist a generated secret so sessions survive restarts.
  const file = path.join(dataDir, 'session.secret');
  try {
    return Buffer.from((await readFile(file, 'utf8')).trim(), 'hex');
  } catch {
    const secret = randomBytes(48);
    await mkdir(dataDir, { recursive: true });
    await writeFile(file, secret.toString('hex'), { encoding: 'utf8', mode: 0o600 });
    return secret;
  }
}

/**
 * Builds the catalog from environment configuration.
 *  - `DATABASE_URL`        -> PostgreSQL repository (production)
 *  - otherwise             -> JSON-file repository under `CATALOG_DATA_DIR` (default `.data`, non-production only
 *                             unless the directory is explicitly configured). `:memory:` keeps everything volatile.
 *  - `S3_BUCKET`           -> S3-compatible object storage, otherwise the local filesystem.
 * Secrets are read here and never leave `src/server`.
 */
export async function createCatalogContext(env: Env = process.env): Promise<CatalogContext> {
  const production = env.NODE_ENV === 'production';
  const explicitDir = env.CATALOG_DATA_DIR?.trim();
  const volatile = explicitDir === ':memory:';
  const dataDir = volatile ? null : explicitDir || (production ? null : path.resolve('.data'));

  let repo: CatalogRepository;
  if (env.DATABASE_URL) {
    repo = new PostgresCatalogRepository(env.DATABASE_URL);
  } else if (volatile) {
    repo = new FileCatalogRepository(null);
  } else if (dataDir) {
    repo = new FileCatalogRepository(dataDir);
  } else {
    throw new CatalogDisabledError(
      'Set DATABASE_URL (PostgreSQL) or CATALOG_DATA_DIR to enable the durable catalog in production.'
    );
  }

  let storage: ObjectStorageAdapter;
  if (env.S3_BUCKET) {
    storage = new S3ObjectStorage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT || undefined,
      accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined,
      keyPrefix: env.S3_KEY_PREFIX || undefined,
    });
  } else if (volatile) {
    storage = new LocalObjectStorage(await mkdtemp(path.join(os.tmpdir(), 'tell-them-objects-')));
  } else if (dataDir) {
    storage = new LocalObjectStorage(dataDir);
  } else {
    throw new CatalogDisabledError('Set S3_BUCKET (or CATALOG_DATA_DIR) to store audio in production.');
  }

  const sessionSecret = await resolveSessionSecret(env, volatile ? null : dataDir, production);
  await repo.init();
  await storage.init();

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
    secureCookies: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
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
