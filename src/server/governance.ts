import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  ContentReport,
  PublicationModeration,
  RemixAttribution,
  RevocationCause,
  RevocationMode,
  StoredCreation,
} from '../types/community';
import type { CatalogContext } from './catalog/factory';
import type { JobRecord } from './jobs/JobQueue';
import { emitCreationEvent } from './distribution/webhooks';

export interface GovernanceConfig {
  /** How long soft-revoked audio is kept for restore/appeal before a worker purges it. */
  purgeGraceMs: number;
  /** Distinct reporters needed to automatically pull an item pending review. */
  reportThreshold: number;
  maxRemixDepth: number;
  /** Bearer token for moderator endpoints; undefined disables them (503). */
  adminToken?: string;
  /** Sweep interval for the purge safety net. */
  purgeSweepMs: number;
}

export const DEFAULT_GOVERNANCE: GovernanceConfig = {
  purgeGraceMs: 30 * 24 * 60 * 60 * 1000,
  reportThreshold: 3,
  maxRemixDepth: 5,
  purgeSweepMs: 60 * 60 * 1000,
};

export const BLOCKLIST = 'blocked-hash';
export const REPORTS = 'report';
export const MODERATOR_DECISIONS = 'moderator-decision';
export const JOB_PURGE_CREATION = 'purge-creation';
export const JOB_PURGE_SWEEP = 'purge-sweep';

export const sha256Hex = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');

/** Constant-time bearer comparison that does not leak token length. */
export function tokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(expected).digest());
}

/** Salted so stored report keys cannot be reversed into session ids or network addresses. */
export const reporterKeyHash = (ctx: CatalogContext, key: string) =>
  createHmac('sha256', ctx.sessionSecret).update(`report:${key}`).digest('hex');

// ------------------------------------------------------------------ blocklist

export async function isBlockedHash(ctx: CatalogContext, hash: string): Promise<boolean> {
  return Boolean(hash) && (await ctx.repo.getDoc(BLOCKLIST, hash)) !== null;
}

async function blockHash(ctx: CatalogContext, hash: string, reason: string, creationId: string) {
  if (!hash) return;
  await ctx.repo.putDoc(BLOCKLIST, hash, { hash, reason, creationId, at: new Date().toISOString() }, { k1: creationId });
}

// ------------------------------------------------------- standing decisions

/** Remembers a human moderator's rejection so a creator cannot clear it by toggling publish. */
export async function recordModeratorDecision(
  ctx: CatalogContext,
  creationId: string,
  status: 'approved' | 'rejected',
  reason: string
): Promise<void> {
  if (status === 'approved') return ctx.repo.deleteDoc(MODERATOR_DECISIONS, creationId);
  await ctx.repo.putDoc(MODERATOR_DECISIONS, creationId, { creationId, status, reason, at: new Date().toISOString() });
}

/**
 * A verdict that must stand until a moderator changes it: community/AI flags and moderator
 * rejections. Re-publishing or editing never re-runs the classifier over these.
 */
export async function standingModeration(
  ctx: CatalogContext,
  creationId: string,
  existing: PublicationModeration | null
): Promise<PublicationModeration | null> {
  if (existing?.status === 'flagged') return existing;
  const decision = await ctx.repo.getDoc<{ status: 'rejected'; reason: string }>(MODERATOR_DECISIONS, creationId);
  if (decision?.status === 'rejected') {
    return {
      id: existing?.id ?? creationId,
      creationId,
      status: 'rejected',
      flagReason: decision.reason || 'Removed by moderation.',
      reviewedAt: existing?.reviewedAt ?? new Date().toISOString(),
    };
  }
  return null;
}

// -------------------------------------------------------------------- lineage

/** The node plus every descendant remix, walking `remixOfId` inside the tree. */
export async function collectTree(ctx: CatalogContext, node: StoredCreation): Promise<StoredCreation[]> {
  const all = await ctx.repo.listByRoot(node.rootId ?? node.id);
  const byParent = new Map<string, StoredCreation[]>();
  for (const c of all) {
    if (c.remixOfId) byParent.set(c.remixOfId, [...(byParent.get(c.remixOfId) ?? []), c]);
  }
  const out: StoredCreation[] = [];
  const seen = new Set<string>();
  const stack: StoredCreation[] = [node];
  while (stack.length) {
    const cur = stack.pop() as StoredCreation;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    out.push(cur);
    stack.push(...(byParent.get(cur.id) ?? []));
  }
  return out;
}

export const isPubliclyVisible = (c: StoredCreation, m: PublicationModeration | null) =>
  c.isPublished && !c.revokedAt && m?.status === 'approved';

/** Parent credit shown on remixes; the title is only revealed while the parent is public. */
export async function attributionFor(
  ctx: CatalogContext,
  parentId: string | null,
  cache = new Map<string, RemixAttribution | null>()
): Promise<RemixAttribution | null> {
  if (!parentId) return null;
  if (cache.has(parentId)) return cache.get(parentId) ?? null;
  const parent = await ctx.repo.getCreation(parentId);
  let result: RemixAttribution | null = null;
  if (parent) {
    const [creator] = await ctx.repo.getCreatorsByIds([parent.creatorId]);
    const visible = isPubliclyVisible(parent, await ctx.repo.getModeration(parent.id));
    result = {
      id: parent.id,
      title: visible ? parent.title : 'A private project',
      creatorHandle: creator?.handle ?? '@unknown',
    };
  }
  cache.set(parentId, result);
  return result;
}

// ---------------------------------------------------------------- revocation

export interface RevokeOptions {
  mode: RevocationMode;
  because: RevocationCause;
}

/**
 * Withdraws consent for `root` and every remix built on it. Order matters for safety:
 *  1. mark records revoked + unpublished (immediately hides them everywhere),
 *  2. blocklist the audio hashes so the same bytes cannot be re-published,
 *  3. enqueue durable purge jobs (idempotent; retried until the blob is really gone).
 */
export async function revokeTree(ctx: CatalogContext, root: StoredCreation, opts: RevokeOptions): Promise<{ ids: string[]; purgeAfter: string | null }> {
  const tree = await collectTree(ctx, root);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const hard = opts.mode === 'hard';
  const purgeAtMs = hard ? nowMs : nowMs + ctx.config.purgeGraceMs;
  const purgeAfter = new Date(purgeAtMs).toISOString();

  for (const node of tree) {
    const already = Boolean(node.revokedAt);
    // Upgrading soft -> hard shortens the window; never extend an existing one.
    const nextPurge = already && node.purgeAfter && node.purgeAfter < purgeAfter ? node.purgeAfter : purgeAfter;
    const updated: StoredCreation = {
      ...node,
      isPublished: false,
      revokedAt: node.revokedAt ?? now,
      revokedBecause: node.revokedBecause ?? (node.id === root.id ? opts.because : 'ancestor'),
      revocationMode: hard || node.revocationMode === 'hard' ? 'hard' : 'soft',
      purgeAfter: hard ? purgeAfter : nextPurge,
      updatedAt: now,
    };
    await ctx.repo.updateCreation(updated);
    if (!already) void emitCreationEvent(ctx, 'creation.revoked', updated);
    await blockHash(ctx, node.contentHash, `revoked:${updated.revokedBecause}`, node.id);
    await ctx.jobs.enqueue(
      JOB_PURGE_CREATION,
      { creationId: node.id },
      { dedupeKey: `${node.id}:${updated.purgeAfter}`, runAt: new Date(updated.purgeAfter as string).getTime() }
    );
  }
  return { ids: tree.map((n) => n.id), purgeAfter: hard ? null : purgeAfter };
}

export type RestoreResult = { ok: true; ids: string[] } | { ok: false; code: string; message: string };

/** Owner-initiated undo of a soft revocation, only while the audio still exists. */
export async function restoreTree(ctx: CatalogContext, root: StoredCreation): Promise<RestoreResult> {
  if (!root.revokedAt) return { ok: false, code: 'not_revoked', message: 'This creation is not revoked.' };
  if (root.revokedBecause !== 'owner') {
    return { ok: false, code: 'restore_forbidden', message: 'Only creator-initiated revocations can be undone.' };
  }
  if (root.revocationMode !== 'soft' || !root.purgeAfter || Date.parse(root.purgeAfter) <= Date.now()) {
    return { ok: false, code: 'restore_expired', message: 'The restore window has ended.' };
  }
  const tree = await collectTree(ctx, root);
  const restored: string[] = [];
  const now = new Date().toISOString();
  for (const node of tree) {
    // Cascaded nodes share the root's timestamp; anything revoked separately stays revoked.
    const sameCascade = node.id === root.id || (node.revokedBecause === 'ancestor' && node.revokedAt === root.revokedAt && node.revocationMode === 'soft');
    if (!sameCascade) continue;
    await ctx.repo.updateCreation({ ...node, revokedAt: null, revokedBecause: null, revocationMode: null, purgeAfter: null, updatedAt: now });
    if (node.contentHash) await ctx.repo.deleteDoc(BLOCKLIST, node.contentHash);
    restored.push(node.id);
  }
  return { ok: true, ids: restored };
}

// ------------------------------------------------------------------- purging

export async function purgeCdnCache(ctx: CatalogContext, keys: string[]): Promise<void> {
  const url = ctx.cdn?.purgeWebhookUrl;
  if (!url || !keys.length) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys, timestamp: new Date().toISOString() }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    // Best-effort
  }
}

export async function purgeCreation(ctx: CatalogContext, creationId: string): Promise<'purged' | 'skipped'> {
  const c = await ctx.repo.getCreation(creationId);
  if (!c) return 'skipped';
  if (!c.revokedAt || !c.purgeAfter || Date.parse(c.purgeAfter) > Date.now()) return 'skipped'; // restored or window extended
  // Blob first: if this throws the job retries and the (hidden) record still knows the key.
  await ctx.storage.delete(c.audioKey);
  if (c.publicKey) await ctx.storage.delete(c.publicKey);
  await purgeCdnCache(ctx, [c.audioKey, c.publicKey].filter(Boolean) as string[]);
  await ctx.repo.deleteCreation(c.id);
  return 'purged';
}

export function registerGovernanceHandlers(ctx: CatalogContext): void {
  ctx.worker.register(JOB_PURGE_CREATION, async (job: JobRecord) => {
    await purgeCreation(ctx, (job.payload as { creationId: string }).creationId);
  });
  ctx.worker.register(JOB_PURGE_SWEEP, async () => {
    // Safety net: anything past its window whose delayed job was lost still gets purged.
    for (const c of await ctx.repo.listPurgeDue(new Date().toISOString(), 100)) await purgeCreation(ctx, c.id);
  });
  ctx.worker.every(JOB_PURGE_SWEEP, ctx.config.purgeSweepMs);
}

// -------------------------------------------------------------------- reports

export async function openReportsFor(ctx: CatalogContext, creationId: string): Promise<ContentReport[]> {
  return (await ctx.repo.findDocs<ContentReport>(REPORTS, { k1: creationId })).map((r) => r.data).filter((r) => r.status === 'open');
}

export async function resolveReports(ctx: CatalogContext, creationId: string, status: 'actioned' | 'dismissed', by: string) {
  const now = new Date().toISOString();
  for (const r of await openReportsFor(ctx, creationId)) {
    await ctx.repo.putDoc(REPORTS, r.id, { ...r, status, resolvedAt: now, resolvedBy: by }, { k1: r.creationId, k2: r.reporterKeyHash, n1: Date.parse(r.createdAt) });
  }
}
