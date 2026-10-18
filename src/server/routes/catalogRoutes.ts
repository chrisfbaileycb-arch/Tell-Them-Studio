import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type {
  CreationRecord,
  RemixAttribution,
  CreationResponse,
  CreatorProfile,
  PublicCreation,
  PublicationModeration,
  StoredCreation,
  StoredCreator,
} from '../../types/community';
import { CatalogContext, CatalogDisabledError } from '../catalog/factory';
import { HandleTakenError } from '../catalog/CatalogRepository';
import { ByteRange } from '../storage/ObjectStorageAdapter';
import { sniffAudio, validateCreationRequest } from '../moderation';
import { registerGovernanceRoutes } from './governanceRoutes';
import { registerDistributionRoutes } from './distributionRoutes';
import { emitCreationEvent } from '../distribution/webhooks';
import {
  attributionFor,
  collectTree,
  isBlockedHash,
  isPubliclyVisible,
  purgeCdnCache,
  revokeTree,
  sha256Hex,
  standingModeration,
} from '../governance';
import {
  RESERVED_HANDLES,
  clearSessionCookie,
  normalizeHandle,
  readSessionCreatorId,
  setSessionCookie,
} from '../session';

export interface CatalogRouteOptions {
  getContext: () => Promise<CatalogContext>;
  allowedOrigins: string[];
  /** Publication toggles per creator per 15 minutes. */
  publishLimit?: number;
  /** Uploads per creator per 15 minutes. */
  uploadLimit?: number;
  /** New-creator sessions per IP per hour. */
  sessionCreateLimit?: number;
  maxCreationsPerCreator?: number;
}

const apiError = (res: Response, status: number, code: string, error: string, extra: Record<string, unknown> = {}) =>
  res.status(status).json({ error, code, ...extra });

const toProfile = (c: StoredCreator): CreatorProfile => ({
  id: c.id,
  handle: c.handle,
  displayName: c.displayName,
  avatarUrl: c.avatarUrl,
  createdAt: c.createdAt,
});

/** Strips storage internals before a record leaves the server. */
export const toCreationRecord = (s: StoredCreation): CreationRecord => ({
  id: s.id,
  creatorId: s.creatorId,
  title: s.title,
  genre: s.genre,
  audioUrl: s.audioUrl,
  waveformJson: s.waveformJson,
  lyrics: s.lyrics,
  isPublished: s.isPublished,
  remixOfId: s.remixOfId,
  provenance: s.provenance,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
  kind: s.kind,
  durationLabel: s.durationLabel,
  vocalArrangement: s.vocalArrangement,
  narratorInfo: s.narratorInfo,
  remixPermitted: s.remixPermitted,
  rootId: s.rootId,
  remixDepth: s.remixDepth,
  revokedAt: s.revokedAt,
  revokedBecause: s.revokedBecause,
});

export const toPublic = (
  s: StoredCreation,
  handle: string,
  includeClientRef = false,
  remixOf: RemixAttribution | null = null
): PublicCreation => {
  const { creatorId: _omit, ...rest } = toCreationRecord(s);
  return { ...rest, creatorHandle: handle, remixOf, ...(includeClientRef ? { clientRef: s.clientRef } : {}) };
};

function parseRange(header: string | undefined, size: number): ByteRange | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (!suffix) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid';
  return { start, end };
}

export function createCatalogRouter(opts: CatalogRouteOptions): Router {
  const router = Router();
  const maxCreations = opts.maxCreationsPerCreator ?? 100;
  const fifteenMinutes = 15 * 60 * 1000;

  const locals = (res: Response) => res.locals as { ctx: CatalogContext; creator?: StoredCreator };

  /** Resolves the catalog or answers 503 so clients fall back to local-only mode. */
  const withCatalog: RequestHandler = async (_req, res, next) => {
    try {
      locals(res).ctx = await opts.getContext();
      next();
    } catch (err: unknown) {
      apiError(
        res,
        503,
        'catalog_unavailable',
        err instanceof CatalogDisabledError ? err.message : 'The community catalog is temporarily unavailable.'
      );
    }
  };

  /** Mutations must come from this site (defence in depth on top of SameSite=Lax cookies). */
  const originGuard: RequestHandler = (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    try {
      if (new URL(origin).host === req.headers.host) return next();
    } catch {
      /* fall through to rejection */
    }
    if (opts.allowedOrigins.includes('*') || opts.allowedOrigins.includes(origin)) return next();
    apiError(res, 403, 'forbidden_origin', 'Cross-site requests are not allowed.');
  };

  const loadCreator = async (req: Request, res: Response): Promise<StoredCreator | null> => {
    const { ctx } = locals(res);
    const id = readSessionCreatorId(req, ctx.sessionSecret);
    return id ? ctx.repo.getCreatorById(id) : null;
  };

  const requireSession: RequestHandler = async (req, res, next) => {
    try {
      const creator = await loadCreator(req, res);
      if (!creator) return apiError(res, 401, 'unauthorized', 'Sign in with a creator handle first.');
      locals(res).creator = creator;
      next();
    } catch (err) {
      next(err);
    }
  };

  const limiterMessage = (error: string) => ({ error, code: 'rate_limited' });
  const perCreatorKey = (req: Request, res: Response) => locals(res).creator?.id ?? req.ip ?? 'anonymous';

  const publishLimiter = rateLimit({
    windowMs: fifteenMinutes,
    limit: opts.publishLimit ?? 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: perCreatorKey,
    message: limiterMessage('You are publishing too quickly. Please wait a few minutes and try again.'),
  });
  const uploadLimiter = rateLimit({
    windowMs: fifteenMinutes,
    limit: opts.uploadLimit ?? 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: perCreatorKey,
    message: limiterMessage('You are uploading too quickly. Please wait a few minutes and try again.'),
  });
  // Only counts requests that would mint a new creator (no valid session yet).
  const sessionCreateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: opts.sessionCreateLimit ?? 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: async (req, res) => {
      try {
        return Boolean(await loadCreator(req, res as Response));
      } catch {
        return false;
      }
    },
    message: limiterMessage('Too many new creator sessions from this network. Please try again later.'),
  });

  // ---------------------------------------------------------------- session
  router.get('/api/session', withCatalog, async (req, res, next) => {
    try {
      const creator = await loadCreator(req, res);
      if (!creator) return apiError(res, 401, 'unauthorized', 'No active creator session.');
      res.setHeader('Cache-Control', 'no-store');
      res.json({ profile: toProfile(creator) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/session', originGuard, withCatalog, sessionCreateLimiter, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const handle = normalizeHandle(req.body?.handle);
      if (!handle) {
        return apiError(res, 400, 'invalid_handle', 'Handles are 3-30 letters, numbers or underscores, like @river_rockers.');
      }
      if (RESERVED_HANDLES.has(handle)) {
        return apiError(res, 400, 'reserved_handle', 'That handle is reserved. Choose your own handle to publish to the live catalog.');
      }
      const current = await loadCreator(req, res);
      if (current?.handle === handle) {
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ profile: toProfile(current) });
      }
      const displayRaw = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
      const displayName = (displayRaw && displayRaw.length <= 60 ? displayRaw : handle.slice(1)).replace(/[\u0000-\u001F\u007F]/g, '');
      const creator: StoredCreator = {
        id: randomUUID(),
        handle,
        displayName,
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      };
      try {
        await ctx.repo.createCreator(creator);
      } catch (err) {
        if (err instanceof HandleTakenError) {
          return apiError(res, 409, 'handle_taken', 'That handle is already claimed. Choose a different handle.');
        }
        throw err;
      }
      setSessionCookie(res, creator.id, ctx.sessionSecret, ctx.secureCookies);
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({ profile: toProfile(creator) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/session', originGuard, withCatalog, (_req, res) => {
    clearSessionCookie(res, locals(res).ctx.secureCookies);
    res.status(204).end();
  });

  // -------------------------------------------------------------- creations
  const saveWithModeration = async (
    ctx: CatalogContext,
    stored: StoredCreation,
    moderation: PublicationModeration | null
  ): Promise<PublicationModeration | null> => {
    // Content that changed after approval must be re-checked or it would bypass moderation.
    if (!stored.isPublished) return moderation;
    const standing = await standingModeration(ctx, stored.id, moderation);
    const verdict = standing ? { status: standing.status, flagReason: standing.flagReason } : await ctx.classifier.classify(stored);
    const next: PublicationModeration = {
      id: moderation?.id ?? randomUUID(),
      creationId: stored.id,
      status: verdict.status,
      flagReason: verdict.flagReason,
      reviewedAt: new Date().toISOString(),
    };
    await ctx.repo.saveModeration(next);
    if (verdict.status === 'rejected') stored.isPublished = false;
    return next;
  };

  router.post('/api/creations', originGuard, withCatalog, requireSession, uploadLimiter, async (req, res, next) => {
    try {
      const { ctx, creator } = locals(res) as Required<ReturnType<typeof locals>>;
      const parsed = validateCreationRequest(req.body);
      if ('error' in parsed) return apiError(res, parsed.status, parsed.code, parsed.error);
      const v = parsed.value;
      const sniffed = sniffAudio(v.audio);
      if (!sniffed) {
        return apiError(res, 415, 'unsupported_audio', 'Audio must be WAV, MP3, OGG, FLAC, WebM or M4A.');
      }

      const existing = v.clientRef ? await ctx.repo.getCreationByClientRef(creator.id, v.clientRef) : null;
      if (existing?.revokedAt) {
        return apiError(res, 409, 'revoked', 'This creation was revoked. Restore it or upload a new one.');
      }
      if (!existing && (await ctx.repo.countByCreator(creator.id)) >= maxCreations) {
        return apiError(res, 429, 'quota_exceeded', `You can store up to ${maxCreations} creations. Delete one to add more.`);
      }

      const contentHash = sha256Hex(v.audio);
      if (await isBlockedHash(ctx, contentHash)) {
        return apiError(res, 409, 'content_revoked', 'This audio was withdrawn by its creator or removed by moderation and cannot be uploaded again.');
      }

      // Provenance: remixes must credit a public parent whose creator consented to remixing.
      let lineage = { remixOfId: existing?.remixOfId ?? null, rootId: existing?.rootId ?? null as string | null, remixDepth: existing?.remixDepth ?? 0 };
      if (existing) {
        if (v.remixOfId && v.remixOfId !== existing.remixOfId) {
          return apiError(res, 400, 'remix_immutable', 'The parent project of an existing creation cannot be changed.');
        }
      } else if (v.remixOfId) {
        const parent = await ctx.repo.getCreation(v.remixOfId);
        const parentModeration = parent ? await ctx.repo.getModeration(parent.id) : null;
        // Parents that are not public (or not yours) look exactly like missing ones.
        if (!parent || !(isPubliclyVisible(parent, parentModeration) || parent.creatorId === creator.id) || parent.revokedAt) {
          return apiError(res, 404, 'parent_unavailable', 'The project you are remixing is not available.');
        }
        if (!parent.remixPermitted && parent.creatorId !== creator.id) {
          return apiError(res, 403, 'remix_not_permitted', 'The creator has not allowed remixes of this project.');
        }
        if (parent.remixDepth + 1 > ctx.config.maxRemixDepth) {
          return apiError(res, 422, 'remix_too_deep', `Remix chains can be at most ${ctx.config.maxRemixDepth} levels deep.`);
        }
        lineage = { remixOfId: parent.id, rootId: parent.rootId ?? parent.id, remixDepth: parent.remixDepth + 1 };
      }

      const id = existing?.id ?? randomUUID();
      if (!lineage.rootId) lineage.rootId = id;
      const audioKey = `${id}.${sniffed.ext}`;
      await ctx.storage.put(audioKey, v.audio, sniffed.mime);

      const now = new Date().toISOString();
      const stored: StoredCreation = {
        id,
        creatorId: creator.id,
        title: v.title,
        genre: v.genre,
        audioUrl: `/api/creations/${id}/audio`,
        waveformJson: v.waveformJson,
        lyrics: v.lyrics,
        isPublished: existing?.isPublished ?? false,
        remixOfId: lineage.remixOfId,
        provenance: v.provenance,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        kind: v.kind,
        durationLabel: v.durationLabel,
        vocalArrangement: v.vocalArrangement,
        narratorInfo: v.narratorInfo,
        audioKey,
        audioMime: sniffed.mime,
        audioBytes: v.audio.length,
        clientRef: v.clientRef,
        contentHash,
        remixPermitted: v.remixPermitted ?? existing?.remixPermitted ?? false,
        rootId: lineage.rootId,
        remixDepth: lineage.remixDepth,
        revokedAt: null,
        revokedBecause: null,
        revocationMode: null,
        purgeAfter: null,
        publicKey: existing?.publicKey ?? null,
      };

      let moderation: PublicationModeration | null = null;
      try {
        if (existing) {
          moderation = await saveWithModeration(ctx, stored, await ctx.repo.getModeration(id));
          await ctx.repo.updateCreation(stored);
          if (existing.audioKey !== audioKey) await ctx.storage.delete(existing.audioKey).catch(() => undefined);
        } else {
          await ctx.repo.createCreation(stored);
        }
      } catch (err) {
        if (!existing) await ctx.storage.delete(audioKey).catch(() => undefined);
        throw err;
      }

      const body: CreationResponse = { creation: toCreationRecord(stored), moderation };
      res.status(existing ? 200 : 201).json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/creations', withCatalog, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      res.setHeader('Cache-Control', 'no-cache');

      if (req.query.mine === '1' || req.query.mine === 'true') {
        const creator = await loadCreator(req, res);
        if (!creator) return apiError(res, 401, 'unauthorized', 'Sign in with a creator handle first.');
        const rows = await ctx.repo.listByCreator(creator.id);
        const cache = new Map<string, RemixAttribution | null>();
        const items = [];
        for (const r of rows) {
          const pub = toPublic(r, creator.handle, true, await attributionFor(ctx, r.remixOfId, cache));
          const mod = await ctx.repo.getModeration(r.id);
          items.push({ ...pub, moderationStatus: mod?.status ?? null, moderationReason: mod?.flagReason ?? null });
        }
        return res.json({ items, nextCursor: null });
      }

      const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? '24'), 10) || 24));
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
      const page = await ctx.repo.listPublished({ limit, cursor });
      const creators = new Map(
        (await ctx.repo.getCreatorsByIds([...new Set(page.items.map((i) => i.creatorId))])).map((c) => [c.id, c])
      );
      const cache = new Map<string, RemixAttribution | null>();
      const items = [];
      for (const i of page.items) {
        items.push(toPublic(i, creators.get(i.creatorId)?.handle ?? '@unknown', false, await attributionFor(ctx, i.remixOfId, cache)));
      }
      res.json({ items, nextCursor: page.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/creations/:id/audio', withCatalog, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const id = String(req.params.id);
      const stored = await ctx.repo.getCreation(id);
      if (!stored) return apiError(res, 404, 'not_found', 'Creation not found.');

      const moderation = await ctx.repo.getModeration(id);
      const isPublic = isPubliclyVisible(stored, moderation);
      if (!isPublic) {
        const viewer = await loadCreator(req, res);
        // 404 (not 403) so private works are indistinguishable from missing ones.
        if (!viewer || viewer.id !== stored.creatorId) return apiError(res, 404, 'not_found', 'Creation not found.');
      }

      // When a CDN is configured and the creation is publicly visible, redirect to the CDN edge.
      // Callers requesting ?direct=1 (or private creators) continue to stream directly from storage.
      if (isPublic && ctx.cdn?.baseUrl && req.query.direct !== '1') {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.redirect(302, `${ctx.cdn.baseUrl}/${stored.audioKey}`);
      }

      const range = parseRange(req.headers.range, stored.audioBytes);
      if (range === 'invalid') {
        res.setHeader('Content-Range', `bytes */${stored.audioBytes}`);
        return apiError(res, 416, 'invalid_range', 'Requested range is not satisfiable.');
      }
      const object = await ctx.storage.get(stored.audioKey, range ?? undefined);
      if (!object) return apiError(res, 404, 'not_found', 'Audio is no longer available.');

      res.status(range ? 206 : 200);
      res.setHeader('Content-Type', stored.audioMime);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', String(object.range.end - object.range.start + 1));
      if (range) res.setHeader('Content-Range', `bytes ${object.range.start}-${object.range.end}/${stored.audioBytes}`);
      res.setHeader('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');
      await pipeline(object.stream, res);
    } catch (err) {
      if (res.headersSent) return res.destroy();
      next(err);
    }
  });

  router.patch(
    '/api/creations/:id/publish',
    originGuard,
    withCatalog,
    requireSession,
    publishLimiter,
    async (req, res, next) => {
      try {
        const { ctx, creator } = locals(res) as Required<ReturnType<typeof locals>>;
        if (typeof req.body?.isPublished !== 'boolean') {
          return apiError(res, 400, 'invalid_body', 'isPublished must be true or false.');
        }
        const stored = await ctx.repo.getCreation(String(req.params.id));
        if (!stored) return apiError(res, 404, 'not_found', 'Creation not found.');
        if (stored.creatorId !== creator.id) {
          return apiError(res, 403, 'forbidden', 'You can only publish your own creations.');
        }
        if (stored.revokedAt) {
          return apiError(res, 410, 'revoked', 'This creation was revoked and cannot be published.');
        }

        let moderation = await ctx.repo.getModeration(stored.id);
        const wasPublic = isPubliclyVisible(stored, moderation);
        if (req.body.isPublished) {
          const standing = await standingModeration(ctx, stored.id, moderation);
          const verdict = standing ? { status: standing.status, flagReason: standing.flagReason } : await ctx.classifier.classify(stored);
          moderation = {
            id: moderation?.id ?? randomUUID(),
            creationId: stored.id,
            status: verdict.status,
            flagReason: verdict.flagReason,
            reviewedAt: new Date().toISOString(),
          };
          await ctx.repo.saveModeration(moderation);
          if (verdict.status === 'rejected') {
            if (stored.isPublished) {
              stored.isPublished = false;
              stored.updatedAt = new Date().toISOString();
              await ctx.repo.updateCreation(stored);
            }
            return apiError(res, 422, 'moderation_rejected', verdict.flagReason ?? 'This creation cannot be published.', {
              flagReason: verdict.flagReason,
            });
          }
          // `approved` goes live; `pending`/`flagged` record the creator's intent and wait for review.
          stored.isPublished = true;
        } else {
          stored.isPublished = false;
        }
        stored.updatedAt = new Date().toISOString();
        await ctx.repo.updateCreation(stored);
        const nowPublic = isPubliclyVisible(stored, moderation);
        if (nowPublic && !wasPublic) void emitCreationEvent(ctx, 'creation.published', stored);
        if (!nowPublic && wasPublic) void emitCreationEvent(ctx, 'creation.unpublished', stored);
        const body: CreationResponse = { creation: toCreationRecord(stored), moderation };
        res.status(moderation && moderation.status !== 'approved' && req.body.isPublished ? 202 : 200).json(body);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete('/api/creations/:id', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx, creator } = locals(res) as Required<ReturnType<typeof locals>>;
      const stored = await ctx.repo.getCreation(String(req.params.id));
      if (!stored) return apiError(res, 404, 'not_found', 'Creation not found.');
      if (stored.creatorId !== creator.id) {
        return apiError(res, 403, 'forbidden', 'You can only delete your own creations.');
      }
      // Deleting a work that others remixed withdraws consent for the whole tree (hard revoke),
      // so no derivative keeps playing audio the creator removed.
      const tree = await collectTree(ctx, stored);
      if (tree.length > 1) {
        await revokeTree(ctx, stored, { mode: 'hard', because: 'owner' });
        await ctx.worker.drain().catch(() => undefined);
        return res.status(204).end();
      }
      // Revoke the public record first so it can never point at deleted audio.
      await ctx.repo.deleteCreation(stored.id);
      await ctx.storage.delete(stored.audioKey).catch((err: unknown) => {
        console.warn('Orphaned audio object after delete:', stored.audioKey, err instanceof Error ? err.message : err);
      });
      await purgeCdnCache(ctx, [stored.audioKey]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  const helpers = {
    originGuard,
    withCatalog,
    requireSession,
    loadCreator,
    locals: locals as (res: Response) => { ctx: CatalogContext; creator?: StoredCreator },
    apiError,
    toPublic,
    toCreationRecord,
    limiterMessage,
  };
  registerGovernanceRoutes(router, helpers);
  registerDistributionRoutes(router, helpers);

  // Catalog-scoped error handler: never leak internals; JSON only.
  for (const prefix of ['/api/shows', '/api/webhooks', '/api/inbound', '/api/inbound-sources', '/feeds']) {
    router.use(prefix, catalogErrorHandler);
  }
  router.use('/api/admin', catalogErrorHandler);
  router.use('/api/creations', catalogErrorHandler);
  router.use('/api/session', catalogErrorHandler);
  return router;
}

/**
 * JSON error responses for catalog/session paths. Also mounted at app level in `server.ts`
 * so body-parser failures (malformed or oversized JSON) are reported as JSON, not HTML.
 */
export function catalogErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  const e = err as { status?: number; type?: string; message?: string };
  if (e?.message === 'Blocked by CORS policy') {
    return apiError(res, 403, 'forbidden_origin', 'Cross-site requests are not allowed.');
  }
  if (e?.type === 'entity.too.large' || e?.status === 413) {
    return apiError(res, 413, 'payload_too_large', 'That upload is too large.');
  }
  if (e?.type === 'entity.parse.failed' || e?.status === 400) {
    return apiError(res, 400, 'invalid_json', 'The request body is not valid JSON.');
  }
  console.error('Catalog route error:', err instanceof Error ? err.message : err);
  apiError(res, 500, 'internal_error', 'The community catalog could not complete that request.');
}

