import { randomUUID } from 'node:crypto';
import { RequestHandler, Request, Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type {
  ContentReport,
  CreationRecord,
  LineageResponse,
  PublicCreation,
  PublicationModeration,
  ReportReason,
  RevokeConsentResponse,
  StoredCreation,
  StoredCreator,
} from '../../types/community';
import type { CatalogContext } from '../catalog/factory';
import { emitCreationEvent } from '../distribution/webhooks';
import {
  REPORTS,
  attributionFor,
  isPubliclyVisible,
  openReportsFor,
  recordModeratorDecision,
  reporterKeyHash,
  resolveReports,
  restoreTree,
  revokeTree,
  tokenMatches,
} from '../governance';

type ApiError = (res: Response, status: number, code: string, error: string, extra?: Record<string, unknown>) => unknown;

export interface GovernanceRouteHelpers {
  originGuard: RequestHandler;
  withCatalog: RequestHandler;
  requireSession: RequestHandler;
  loadCreator: (req: Request, res: Response) => Promise<StoredCreator | null>;
  locals: (res: Response) => { ctx: CatalogContext; creator?: StoredCreator };
  apiError: ApiError;
  toPublic: (s: StoredCreation, handle: string, includeClientRef?: boolean, remixOf?: PublicCreation['remixOf']) => PublicCreation;
  toCreationRecord: (s: StoredCreation) => CreationRecord;
  limiterMessage: (error: string) => { error: string; code: string };
}

const REASONS: ReportReason[] = ['rights', 'harassment', 'pii', 'unsafe', 'other'];
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Reporting, consent revocation, remix permission, lineage and moderator endpoints. */
export function registerGovernanceRoutes(router: Router, h: GovernanceRouteHelpers): void {
  const { originGuard, withCatalog, requireSession, loadCreator, locals, apiError } = h;
  const required = (res: Response) => locals(res) as { ctx: CatalogContext; creator: StoredCreator };

  const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.REPORT_RATE_LIMIT) || 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'anonymous',
    message: h.limiterMessage('You have sent several reports recently. Please wait before sending more.'),
  });

  // ---------------------------------------------------------------- reporting
  router.post('/api/creations/:id/reports', originGuard, withCatalog, reportLimiter, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const reason = req.body?.reason as ReportReason;
      if (!REASONS.includes(reason)) return apiError(res, 400, 'invalid_reason', `reason must be one of: ${REASONS.join(', ')}.`);
      const detailsRaw = req.body?.details;
      if (detailsRaw !== undefined && (typeof detailsRaw !== 'string' || detailsRaw.length > 500)) {
        return apiError(res, 400, 'invalid_details', 'details must be text up to 500 characters.');
      }

      const creation = await ctx.repo.getCreation(String(req.params.id));
      const moderation = creation ? await ctx.repo.getModeration(creation.id) : null;
      // You can only report what you can see; everything else looks missing.
      if (!creation || !isPubliclyVisible(creation, moderation)) return apiError(res, 404, 'not_found', 'Creation not found.');

      const reporter = await loadCreator(req, res);
      if (reporter?.id === creation.creatorId) return apiError(res, 400, 'own_creation', 'You cannot report your own creation.');
      const key = reporterKeyHash(ctx, reporter ? `creator:${reporter.id}` : `ip:${req.ip ?? 'unknown'}`);

      const report: ContentReport = {
        id: randomUUID(),
        creationId: creation.id,
        reporterKeyHash: key,
        reason,
        details: (detailsRaw ?? '').replace(CONTROL, '').trim(),
        status: 'open',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
      };
      // One report per reporter per creation; repeats are accepted silently (no reporter oracle).
      const inserted = await ctx.repo.insertDocUnique(REPORTS, report.id, report, { k1: creation.id, k2: key, n1: Date.parse(report.createdAt) });
      let flagged = false;
      if (inserted && (await openReportsFor(ctx, creation.id)).length >= ctx.config.reportThreshold) {
        const next: PublicationModeration = {
          id: moderation?.id ?? randomUUID(),
          creationId: creation.id,
          status: 'flagged',
          flagReason: 'Held for review after community reports.',
          reviewedAt: new Date().toISOString(),
        };
        await ctx.repo.saveModeration(next);
        flagged = true;
        void emitCreationEvent(ctx, 'creation.unpublished', creation);
      }
      res.status(inserted ? 201 : 200).json({ received: true, flagged });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------ lineage
  router.get('/api/creations/:id/lineage', withCatalog, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const creation = await ctx.repo.getCreation(String(req.params.id));
      const moderation = creation ? await ctx.repo.getModeration(creation.id) : null;
      if (!creation || !isPubliclyVisible(creation, moderation)) return apiError(res, 404, 'not_found', 'Creation not found.');

      const cache = new Map();
      const ancestors: LineageResponse['ancestors'] = [];
      let cursor = creation.remixOfId;
      for (let i = 0; cursor && i <= ctx.config.maxRemixDepth; i++) {
        const credit = await attributionFor(ctx, cursor, cache);
        if (!credit) break;
        ancestors.push(credit);
        cursor = (await ctx.repo.getCreation(cursor))?.remixOfId ?? null;
      }

      const tree = await ctx.repo.listByRoot(creation.rootId ?? creation.id);
      const remixes: LineageResponse['remixes'] = [];
      for (const child of tree.filter((c) => c.remixOfId === creation.id)) {
        if (!isPubliclyVisible(child, await ctx.repo.getModeration(child.id))) continue;
        const [owner] = await ctx.repo.getCreatorsByIds([child.creatorId]);
        remixes.push({ id: child.id, title: child.title, creatorHandle: owner?.handle ?? '@unknown' });
      }
      res.json({ ancestors, remixes } satisfies LineageResponse);
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------- owner: consent
  const ownCreation = async (req: Request, res: Response) => {
    const { ctx, creator } = required(res);
    const stored = await ctx.repo.getCreation(String(req.params.id));
    if (!stored) {
      apiError(res, 404, 'not_found', 'Creation not found.');
      return null;
    }
    if (stored.creatorId !== creator.id) {
      apiError(res, 403, 'forbidden', 'You can only manage your own creations.');
      return null;
    }
    return stored;
  };

  router.post('/api/creations/:id/revoke-consent', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const mode = req.body?.mode;
      if (mode !== 'soft' && mode !== 'hard') return apiError(res, 400, 'invalid_mode', "mode must be 'soft' or 'hard'.");
      const stored = await ownCreation(req, res);
      if (!stored) return;
      const result = await revokeTree(ctx, stored, { mode, because: 'owner' });
      if (mode === 'hard') await ctx.worker.drain().catch(() => undefined);
      res.json({ revokedIds: result.ids, mode, purgeAfter: result.purgeAfter } satisfies RevokeConsentResponse);
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/creations/:id/restore', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const stored = await ownCreation(req, res);
      if (!stored) return;
      const result = await restoreTree(ctx, stored);
      if ('code' in result) return apiError(res, result.code === 'restore_forbidden' ? 403 : 409, result.code, result.message);
      res.json({ restoredIds: result.ids });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/api/creations/:id/remix-permission', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      if (typeof req.body?.remixPermitted !== 'boolean') return apiError(res, 400, 'invalid_body', 'remixPermitted must be true or false.');
      const stored = await ownCreation(req, res);
      if (!stored) return;
      if (stored.revokedAt) return apiError(res, 410, 'revoked', 'This creation was revoked.');
      stored.remixPermitted = req.body.remixPermitted;
      stored.updatedAt = new Date().toISOString();
      await ctx.repo.updateCreation(stored);
      res.json({ creation: h.toCreationRecord(stored), moderation: await ctx.repo.getModeration(stored.id) });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------- moderators
  const adminGuard: RequestHandler = (req, res, next) => {
    const { ctx } = locals(res);
    if (!ctx.config.adminToken) return apiError(res, 503, 'admin_disabled', 'Moderator endpoints are not enabled on this server.');
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!tokenMatches(token, ctx.config.adminToken)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return apiError(res, 401, 'unauthorized', 'A valid moderator token is required.');
    }
    next();
  };

  router.get('/api/admin/reports', withCatalog, adminGuard, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const status = typeof req.query.status === 'string' ? req.query.status : 'open';
      const all = (await ctx.repo.findDocs<ContentReport>(REPORTS, { limit: 1000 })).map((r) => r.data).filter((r) => r.status === status);
      const byCreation = new Map<string, ContentReport[]>();
      for (const r of all) byCreation.set(r.creationId, [...(byCreation.get(r.creationId) ?? []), r]);
      const items = [];
      for (const [creationId, reports] of byCreation) {
        const c = await ctx.repo.getCreation(creationId);
        const m = c ? await ctx.repo.getModeration(c.id) : null;
        items.push({
          creationId,
          title: c?.title ?? null,
          moderationStatus: m?.status ?? null,
          revoked: Boolean(c?.revokedAt),
          reportCount: reports.length,
          reasons: [...new Set(reports.map((r) => r.reason))],
          reports: reports.map(({ reporterKeyHash: _omit, ...rest }) => rest),
        });
      }
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/admin/creations/:id/moderation', withCatalog, adminGuard, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const action = req.body?.action;
      if (!['approve', 'reject', 'revoke'].includes(action)) return apiError(res, 400, 'invalid_action', "action must be 'approve', 'reject' or 'revoke'.");
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.replace(CONTROL, '').trim().slice(0, 200) : '';
      const stored = await ctx.repo.getCreation(String(req.params.id));
      if (!stored) return apiError(res, 404, 'not_found', 'Creation not found.');
      const existing = await ctx.repo.getModeration(stored.id);
      const wasVisible = isPubliclyVisible(stored, existing);
      const base = { id: existing?.id ?? randomUUID(), creationId: stored.id, reviewedAt: new Date().toISOString() };

      if (action === 'approve') {
        if (stored.revokedAt) return apiError(res, 409, 'revoked', 'Revoked creations cannot be approved.');
        await ctx.repo.saveModeration({ ...base, status: 'approved', flagReason: null });
        await recordModeratorDecision(ctx, stored.id, 'approved', '');
        await resolveReports(ctx, stored.id, 'dismissed', 'moderator');
        if (!wasVisible && stored.isPublished) void emitCreationEvent(ctx, 'creation.published', stored);
      } else if (action === 'reject') {
        await ctx.repo.saveModeration({ ...base, status: 'rejected', flagReason: reason || 'Removed by moderation.' });
        await recordModeratorDecision(ctx, stored.id, 'rejected', reason || 'Removed by moderation.');
        await ctx.repo.updateCreation({ ...stored, isPublished: false, updatedAt: base.reviewedAt });
        await resolveReports(ctx, stored.id, 'actioned', 'moderator');
        if (wasVisible) void emitCreationEvent(ctx, 'creation.unpublished', stored);
      } else {
        await ctx.repo.saveModeration({ ...base, status: 'rejected', flagReason: reason || 'Removed by moderation.' });
        await recordModeratorDecision(ctx, stored.id, 'rejected', reason || 'Removed by moderation.');
        const mode = req.body?.mode === 'hard' ? 'hard' : 'soft';
        const result = await revokeTree(ctx, (await ctx.repo.getCreation(stored.id)) as StoredCreation, { mode, because: 'moderation' });
        await resolveReports(ctx, stored.id, 'actioned', 'moderator');
        if (mode === 'hard') await ctx.worker.drain().catch(() => undefined);
        return res.json({ revokedIds: result.ids });
      }
      res.json({ creation: h.toCreationRecord((await ctx.repo.getCreation(stored.id)) ?? stored), moderation: await ctx.repo.getModeration(stored.id) });
    } catch (err) {
      next(err);
    }
  });

}
