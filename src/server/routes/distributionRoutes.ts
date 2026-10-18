import { randomUUID } from 'node:crypto';
import { RequestHandler, Request, Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateKindnessAndSafety } from '../../services/contentSafety';
import type { StoredCreation, StoredCreator } from '../../types/community';
import {
  EpisodeRecord,
  EpisodeView,
  InboundSource,
  PRAISE_BADGES,
  Praise,
  PraiseBadge,
  PublicPraise,
  PublicShow,
  Show,
  ShowSchedule,
  WEBHOOK_EVENTS,
  WebhookEvent,
} from '../../types/distribution';
import type { CatalogContext } from '../catalog/factory';
import { buildFeedXml, feedEtag, FeedEpisode } from '../distribution/rss';
import { isValidTimeOfDay, isValidTimezone, nextSlotAfter } from '../distribution/schedule';
import {
  EPISODES,
  SCHEDULES,
  SHOWS,
  getEpisode,
  getSchedule,
  getShow,
  listEpisodes,
  nextFreeSlot,
  publishEpisode,
  putEpisode,
  scheduleEpisode,
} from '../distribution/episodes';
import { DELIVERIES, StoredWebhook, WEBHOOKS, sendTestPing, signPayload, validateWebhookUrl } from '../distribution/webhooks';
import { isPubliclyVisible, tokenMatches } from '../governance';
import { moderateForPublication } from '../moderation';
import { newSecret, openSecret, sealSecret } from '../secrets';
import type { GovernanceRouteHelpers } from './governanceRoutes';
import type { WebhookCreated, WebhookDelivery, InboundSourceCreated } from '../../types/distribution';

const INBOUND_SOURCES = 'inbound-source';
const PRAISE = 'praise';
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const MAX_SHOWS = 10;
const MAX_WEBHOOKS = 10;
const MAX_SOURCES = 10;
const TIMESTAMP_WINDOW_S = 300;

interface StoredSource extends InboundSource {
  secretSealed: string;
}

const clean = (v: string) => v.replace(CONTROL, '').trim();

const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34) || 'show';

type ShowInput = Partial<Pick<Show, 'title' | 'description' | 'author' | 'language' | 'category' | 'explicit'>>;

function parseShowInput(body: unknown, requireTitle: boolean): { ok: true; value: ShowInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: ShowInput = {};
  const str = (key: string, max: number, label: string): string | undefined | false => {
    if (b[key] === undefined) return undefined;
    if (typeof b[key] !== 'string') return false;
    const v = clean(b[key] as string);
    return v.length > max ? false : v;
  };
  const title = str('title', 120, 'title');
  if (title === false || (requireTitle && !title)) return { ok: false, error: 'title is required (up to 120 characters).' };
  if (title !== undefined) out.title = title;
  const description = str('description', 4000, 'description');
  if (description === false) return { ok: false, error: 'description must be text up to 4000 characters.' };
  if (description !== undefined) out.description = description;
  const author = str('author', 120, 'author');
  if (author === false) return { ok: false, error: 'author must be text up to 120 characters.' };
  if (author !== undefined && author) out.author = author;
  const category = str('category', 60, 'category');
  if (category === false) return { ok: false, error: 'category must be text up to 60 characters.' };
  if (category !== undefined && category) out.category = category;
  if (b.language !== undefined) {
    if (typeof b.language !== 'string' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(b.language)) {
      return { ok: false, error: 'language must look like en or en-US.' };
    }
    out.language = b.language;
  }
  if (b.explicit !== undefined) {
    if (typeof b.explicit !== 'boolean') return { ok: false, error: 'explicit must be true or false.' };
    out.explicit = b.explicit;
  }
  return { ok: true, value: out };
}

/** Show metadata is public in the feed, so it goes through the same publication policy. */
const showPolicyError = (s: Pick<Show, 'title' | 'description' | 'author' | 'category'>) => {
  const verdict = moderateForPublication({ title: s.title, genre: s.category, lyrics: `${s.description}\n${s.author}` });
  return verdict.status === 'rejected' ? verdict.flagReason || 'That text cannot be published.' : null;
};

/** Shows, schedules, public RSS feeds, outbound webhooks and inbound praise. */
export function registerDistributionRoutes(router: Router, h: GovernanceRouteHelpers): void {
  const { originGuard, withCatalog, requireSession, loadCreator, locals, apiError } = h;
  const required = (res: Response) => locals(res) as { ctx: CatalogContext; creator: StoredCreator };
  const baseUrl = (ctx: CatalogContext, req: Request) => ctx.distribution.publicBaseUrl ?? `${req.protocol}://${req.get('host')}`;

  const perCreator = (req: Request, res: Response) => locals(res).creator?.id ?? req.ip ?? 'anonymous';
  const testLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: perCreator,
    message: h.limiterMessage('Too many webhook tests. Please wait a few minutes.'),
  });
  const nativePraiseLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.PRAISE_RATE_LIMIT) || 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: perCreator,
    message: h.limiterMessage('You are sending praise very quickly. Please slow down.'),
  });
  const inboundLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `inbound:${String(req.params.sourceId)}`,
    message: h.limiterMessage('Too many inbound praise deliveries for this source.'),
  });

  const publishedCount = async (ctx: CatalogContext, showId: string) =>
    (await listEpisodes(ctx, showId)).filter((e) => e.publishState === 'published').length;

  const toPublicShow = async (ctx: CatalogContext, req: Request, show: Show, handle: string): Promise<PublicShow> => {
    const { creatorId: _omit, ...rest } = show;
    return { ...rest, creatorHandle: handle, feedUrl: `${baseUrl(ctx, req)}/feeds/${show.id}.xml`, publishedEpisodes: await publishedCount(ctx, show.id) };
  };

  const ownShow = async (res: Response, id: string): Promise<Show | null> => {
    const { ctx, creator } = required(res);
    const show = await getShow(ctx, id);
    if (!show) {
      apiError(res, 404, 'not_found', 'Show not found.');
      return null;
    }
    if (show.creatorId !== creator.id) {
      apiError(res, 403, 'forbidden', 'You can only manage your own shows.');
      return null;
    }
    return show;
  };

  const episodeView = async (ctx: CatalogContext, e: EpisodeRecord): Promise<EpisodeView> => {
    const c = await ctx.repo.getCreation(e.creationId);
    const m = c ? await ctx.repo.getModeration(c.id) : null;
    return { ...e, title: c?.title ?? '(missing)', moderationStatus: m?.status ?? null };
  };

  // -------------------------------------------------------------------- shows
  router.post('/api/shows', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const parsed = parseShowInput(req.body, true);
      if ('error' in parsed) return apiError(res, 400, 'invalid_show', parsed.error);
      const mine = (await ctx.repo.findDocs<Show>(SHOWS, { k1: creator.id, limit: MAX_SHOWS + 1 })).length;
      if (mine >= MAX_SHOWS) return apiError(res, 409, 'show_limit', `You can have up to ${MAX_SHOWS} shows.`);

      const now = new Date().toISOString();
      const show: Show = {
        id: '',
        creatorId: creator.id,
        title: parsed.value.title as string,
        description: parsed.value.description ?? '',
        author: parsed.value.author ?? creator.displayName,
        language: parsed.value.language ?? 'en',
        category: parsed.value.category ?? 'Arts',
        explicit: parsed.value.explicit ?? false,
        createdAt: now,
        updatedAt: now,
      };
      const policy = showPolicyError(show);
      if (policy) return apiError(res, 422, 'moderation_rejected', policy);

      let requested = req.body?.slug;
      if (requested !== undefined && (typeof requested !== 'string' || !SLUG.test(requested))) {
        return apiError(res, 400, 'invalid_slug', 'slug must be 3-40 lowercase letters, numbers or dashes.');
      }
      const baseSlug = (requested as string | undefined) ?? slugify(show.title);
      for (let attempt = 0; attempt < 6; attempt++) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 34)}-${randomUUID().slice(0, 4)}`;
        if (!SLUG.test(slug)) continue;
        show.id = slug;
        if (await ctx.repo.insertDocUnique(SHOWS, slug, show, { k1: creator.id, n1: Date.parse(now) })) {
          return res.status(201).json({ show: await toPublicShow(ctx, req, show, creator.handle) });
        }
        if (requested) return apiError(res, 409, 'slug_taken', 'That slug is already taken.');
      }
      apiError(res, 409, 'slug_taken', 'Could not find a free slug; try a different title.');
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/shows', withCatalog, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const creator = await loadCreator(req, res);
      if (creator && req.query.public !== '1') {
        const rows = (await ctx.repo.findDocs<Show>(SHOWS, { k1: creator.id, limit: 50 })).map((r) => r.data);
        const items = [];
        for (const s of rows) items.push(await toPublicShow(ctx, req, s, creator.handle));
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ items });
      }
      const rows = (await ctx.repo.findDocs<Show>(SHOWS, { limit: 50 })).map((r) => r.data);
      const creators = await ctx.repo.getCreatorsByIds(rows.map((r) => r.creatorId));
      const cMap = new Map(creators.map((c) => [c.id, c.handle]));
      const items = [];
      for (const s of rows) items.push(await toPublicShow(ctx, req, s, cMap.get(s.creatorId) ?? '@unknown'));
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/shows/:id', withCatalog, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const show = await getShow(ctx, String(req.params.id));
      if (!show) return apiError(res, 404, 'not_found', 'Show not found.');
      const [creator] = await ctx.repo.getCreatorsByIds([show.creatorId]);
      res.json({ show: await toPublicShow(ctx, req, show, creator?.handle ?? '@unknown') });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/api/shows/:id', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const show = await ownShow(res, String(req.params.id));
      if (!show) return;
      const parsed = parseShowInput(req.body, false);
      if ('error' in parsed) return apiError(res, 400, 'invalid_show', parsed.error);
      const next_: Show = { ...show, ...parsed.value, updatedAt: new Date().toISOString() };
      const policy = showPolicyError(next_);
      if (policy) return apiError(res, 422, 'moderation_rejected', policy);
      await ctx.repo.putDoc(SHOWS, show.id, next_, { k1: creator.id, n1: Date.parse(show.createdAt) });
      res.json({ show: await toPublicShow(ctx, req, next_, creator.handle) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/shows/:id', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const show = await ownShow(res, String(req.params.id));
      if (!show) return;
      for (const e of await listEpisodes(ctx, show.id)) await ctx.repo.deleteDoc(EPISODES, e.creationId);
      await ctx.repo.deleteDoc(SCHEDULES, show.id);
      await ctx.repo.deleteDoc(SHOWS, show.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------------- schedule
  const scheduleResponse = async (ctx: CatalogContext, showId: string) => ({
    schedule: await getSchedule(ctx, showId),
    nextRunAt: (await nextFreeSlot(ctx, showId))?.toISOString() ?? null,
  });

  router.get('/api/shows/:id/schedule', withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const show = await ownShow(res, String(req.params.id));
      if (!show) return;
      res.setHeader('Cache-Control', 'no-store');
      res.json(await scheduleResponse(ctx, show.id));
    } catch (err) {
      next(err);
    }
  });

  router.put('/api/shows/:id/schedule', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const show = await ownShow(res, String(req.params.id));
      if (!show) return;
      const b = req.body ?? {};
      if (!Number.isInteger(b.dayOfWeek) || b.dayOfWeek < 0 || b.dayOfWeek > 6) return apiError(res, 400, 'invalid_schedule', 'dayOfWeek must be 0 (Sunday) to 6 (Saturday).');
      if (typeof b.timeOfDay !== 'string' || !isValidTimeOfDay(b.timeOfDay)) return apiError(res, 400, 'invalid_schedule', 'timeOfDay must look like 09:30.');
      if (typeof b.timezone !== 'string' || !isValidTimezone(b.timezone)) return apiError(res, 400, 'invalid_schedule', 'timezone must be an IANA zone such as America/Denver.');
      const schedule: ShowSchedule = {
        showId: show.id,
        dayOfWeek: b.dayOfWeek,
        timeOfDay: b.timeOfDay,
        timezone: b.timezone,
        active: b.active !== false,
        updatedAt: new Date().toISOString(),
      };
      await ctx.repo.putDoc(SCHEDULES, show.id, schedule, { k1: show.id });
      res.json(await scheduleResponse(ctx, show.id));
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------------- episodes
  router.get('/api/shows/:id/episodes', withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const show = await ownShow(res, String(req.params.id));
      if (!show) return;
      const items = [];
      for (const e of (await listEpisodes(ctx, show.id)).sort((a, b) => a.episodeNumber - b.episodeNumber)) items.push(await episodeView(ctx, e));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  const loadOwnEpisode = async (res: Response, showId: string, creationId: string) => {
    const { ctx, creator } = required(res);
    const show = await ownShow(res, showId);
    if (!show) return null;
    const creation = await ctx.repo.getCreation(creationId);
    if (!creation || creation.creatorId !== creator.id) {
      apiError(res, 404, 'not_found', 'Creation not found.');
      return null;
    }
    return { show, creation, episode: await getEpisode(ctx, creationId) };
  };

  router.put('/api/shows/:id/episodes/:creationId', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const found = await loadOwnEpisode(res, String(req.params.id), String(req.params.creationId));
      if (!found) return;
      const { show, creation, episode } = found;
      if (creation.kind !== 'podcast') return apiError(res, 400, 'not_podcast', 'Only podcast creations can be added to a show.');
      if (creation.revokedAt) return apiError(res, 410, 'revoked', 'This creation was revoked.');
      if (episode && episode.showId !== show.id) return apiError(res, 409, 'in_other_show', 'This episode already belongs to another show.');
      let number = req.body?.episodeNumber;
      if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > 100000)) {
        return apiError(res, 400, 'invalid_episode_number', 'episodeNumber must be a positive whole number.');
      }
      if (number === undefined) {
        number = episode?.episodeNumber ?? Math.max(0, ...(await listEpisodes(ctx, show.id)).map((e) => e.episodeNumber)) + 1;
      }
      const record: EpisodeRecord = episode
        ? { ...episode, episodeNumber: number }
        : { creationId: creation.id, showId: show.id, publishState: 'draft', scheduledFor: null, publishedAt: null, episodeNumber: number, holdReason: null, createdAt: new Date().toISOString() };
      await putEpisode(ctx, record);
      res.status(episode ? 200 : 201).json({ episode: await episodeView(ctx, record) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/shows/:id/episodes/:creationId', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const found = await loadOwnEpisode(res, String(req.params.id), String(req.params.creationId));
      if (!found) return;
      if (!found.episode || found.episode.showId !== found.show.id) return apiError(res, 404, 'not_found', 'Episode not found in this show.');
      await ctx.repo.deleteDoc(EPISODES, found.creation.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/shows/:id/episodes/:creationId/schedule', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const found = await loadOwnEpisode(res, String(req.params.id), String(req.params.creationId));
      if (!found) return;
      const { show, episode } = found;
      if (!episode || episode.showId !== show.id) return apiError(res, 404, 'not_found', 'Add the episode to the show first.');
      if (episode.publishState === 'published') return apiError(res, 409, 'already_published', 'This episode is already published.');

      let whenMs: number;
      if (req.body?.useSchedule === true) {
        const slot = await nextFreeSlot(ctx, show.id);
        if (!slot) return apiError(res, 409, 'no_schedule', 'Set an active weekly schedule for this show first.');
        whenMs = slot.getTime();
      } else {
        const when = typeof req.body?.scheduledFor === 'string' ? Date.parse(req.body.scheduledFor) : NaN;
        if (!Number.isFinite(when)) return apiError(res, 400, 'invalid_time', 'scheduledFor must be an ISO date-time, or set useSchedule to true.');
        if (when < Date.now() - 5000 || when > Date.now() + 400 * 24 * 60 * 60 * 1000) {
          return apiError(res, 400, 'invalid_time', 'scheduledFor must be in the future and within the next year.');
        }
        whenMs = when;
      }
      res.json({ episode: await episodeView(ctx, await scheduleEpisode(ctx, episode, whenMs)) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/shows/:id/episodes/:creationId/schedule', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const found = await loadOwnEpisode(res, String(req.params.id), String(req.params.creationId));
      if (!found) return;
      const { episode, show } = found;
      if (!episode || episode.showId !== show.id) return apiError(res, 404, 'not_found', 'Episode not found in this show.');
      if (episode.publishState === 'scheduled') await putEpisode(ctx, { ...episode, publishState: 'draft', scheduledFor: null });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/shows/:id/episodes/:creationId/publish', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const found = await loadOwnEpisode(res, String(req.params.id), String(req.params.creationId));
      if (!found) return;
      const { episode, show } = found;
      if (!episode || episode.showId !== show.id) return apiError(res, 404, 'not_found', 'Add the episode to the show first.');
      const outcome = await publishEpisode(ctx, found.creation.id);
      const view = await episodeView(ctx, (await getEpisode(ctx, found.creation.id)) as EpisodeRecord);
      res.status(outcome.ok ? 200 : 202).json({ episode: view, published: outcome.ok, reason: outcome.reason ?? null });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------- RSS feed
  router.get('/feeds/:file', withCatalog, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const m = /^([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\.xml$/.exec(String(req.params.file));
      const show = m ? await getShow(ctx, m[1]) : null;
      if (!show) return res.status(404).type('text/plain').send('Feed not found.');
      const [creator] = await ctx.repo.getCreatorsByIds([show.creatorId]);

      const base = baseUrl(ctx, req);
      const episodes: FeedEpisode[] = [];
      let lastModified = Date.parse(show.updatedAt);
      for (const e of await listEpisodes(ctx, show.id)) {
        const c = await ctx.repo.getCreation(e.creationId);
        if (!c) continue;
        lastModified = Math.max(lastModified, Date.parse(c.updatedAt), e.publishedAt ? Date.parse(e.publishedAt) : 0);
        if (e.publishState !== 'published' || !isPubliclyVisible(c, await ctx.repo.getModeration(c.id))) continue;
        const notes = clean(c.lyrics).slice(0, 4000);
        episodes.push({
          guid: `${show.id}:${c.id}`,
          title: c.title,
          description: `${notes ? `${notes}\n\n` : ''}Content origin: ${c.provenance}.`,
          pubDate: new Date(e.publishedAt ?? c.createdAt),
          audioUrl: `${base}/api/creations/${c.id}/audio`,
          audioBytes: c.audioBytes,
          audioMime: c.audioMime,
          durationLabel: c.durationLabel,
          episodeNumber: e.episodeNumber,
        });
      }
      episodes.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

      const { creatorId: _omit, ...rest } = show;
      const xml = buildFeedXml({ ...rest, creatorHandle: creator?.handle ?? '@unknown', feedUrl: `${base}/feeds/${show.id}.xml`, publishedEpisodes: episodes.length }, episodes, {
        feedUrl: `${base}/feeds/${show.id}.xml`,
        siteUrl: base,
      });
      const etag = feedEtag(xml);
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', new Date(lastModified).toUTCString());
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const inm = req.headers['if-none-match'];
      const ims = req.headers['if-modified-since'];
      if (inm ? inm.split(',').map((t) => t.trim()).includes(etag) : ims && Date.parse(ims) >= Math.floor(lastModified / 1000) * 1000) {
        return res.status(304).end();
      }
      res.type('application/rss+xml; charset=utf-8').send(xml);
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------------- webhooks
  const publicEndpoint = (w: StoredWebhook) => {
    const { secretSealed: _s, creatorId: _c, ...rest } = w;
    return rest;
  };

  router.post('/api/webhooks', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const check = validateWebhookUrl(req.body?.url, ctx.distribution.allowPrivateWebhookTargets);
      if ('error' in check) return apiError(res, 400, 'invalid_url', check.error);
      let events: WebhookEvent[] = WEBHOOK_EVENTS;
      if (req.body?.events !== undefined) {
        if (!Array.isArray(req.body.events) || !req.body.events.length || !req.body.events.every((e: unknown) => WEBHOOK_EVENTS.includes(e as WebhookEvent))) {
          return apiError(res, 400, 'invalid_events', `events must be a non-empty subset of: ${WEBHOOK_EVENTS.join(', ')}.`);
        }
        events = [...new Set(req.body.events as WebhookEvent[])];
      }
      const existing = await ctx.repo.findDocs<StoredWebhook>(WEBHOOKS, { k1: creator.id, limit: MAX_WEBHOOKS + 1 });
      if (existing.length >= MAX_WEBHOOKS) return apiError(res, 409, 'webhook_limit', `You can register up to ${MAX_WEBHOOKS} webhooks.`);

      const secret = newSecret('whsec');
      const stored: StoredWebhook = {
        id: randomUUID(),
        creatorId: creator.id,
        url: check.url.toString(),
        events,
        active: true,
        createdAt: new Date().toISOString(),
        secretSealed: sealSecret(ctx.sessionSecret, secret),
      };
      await ctx.repo.putDoc(WEBHOOKS, stored.id, stored, { k1: creator.id, n1: Date.parse(stored.createdAt) });
      const { creatorId: _omit, secretSealed: _s, ...endpoint } = stored;
      res.status(201).json({ endpoint, secret } satisfies WebhookCreated);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/webhooks', withCatalog, requireSession, async (_req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const items = (await ctx.repo.findDocs<StoredWebhook>(WEBHOOKS, { k1: creator.id, limit: 50 })).map((r) => publicEndpoint(r.data));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  const ownWebhook = async (res: Response, id: string): Promise<StoredWebhook | null> => {
    const { ctx, creator } = required(res);
    const w = await ctx.repo.getDoc<StoredWebhook>(WEBHOOKS, id);
    // Other creators' endpoints look missing, so ids cannot be probed.
    if (!w || w.creatorId !== creator.id) {
      apiError(res, 404, 'not_found', 'Webhook not found.');
      return null;
    }
    return w;
  };

  router.patch('/api/webhooks/:id', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const w = await ownWebhook(res, String(req.params.id));
      if (!w) return;
      const next_ = { ...w };
      if (req.body?.active !== undefined) {
        if (typeof req.body.active !== 'boolean') return apiError(res, 400, 'invalid_body', 'active must be true or false.');
        next_.active = req.body.active;
      }
      if (req.body?.events !== undefined) {
        if (!Array.isArray(req.body.events) || !req.body.events.length || !req.body.events.every((e: unknown) => WEBHOOK_EVENTS.includes(e as WebhookEvent))) {
          return apiError(res, 400, 'invalid_events', `events must be a non-empty subset of: ${WEBHOOK_EVENTS.join(', ')}.`);
        }
        next_.events = [...new Set(req.body.events as WebhookEvent[])];
      }
      await ctx.repo.putDoc(WEBHOOKS, w.id, next_, { k1: creator.id, n1: Date.parse(w.createdAt) });
      res.json({ endpoint: publicEndpoint(next_) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/webhooks/:id', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const w = await ownWebhook(res, String(req.params.id));
      if (!w) return;
      await ctx.repo.deleteDoc(WEBHOOKS, w.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/webhooks/:id/test', originGuard, withCatalog, requireSession, testLimiter, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const w = await ownWebhook(res, String(req.params.id));
      if (!w) return;
      res.status(202).json({ deliveryId: await sendTestPing(ctx, w) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/webhooks/:id/deliveries', withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx } = required(res);
      const w = await ownWebhook(res, String(req.params.id));
      if (!w) return;
      const rows = (await ctx.repo.findDocs<WebhookDelivery>(DELIVERIES, { k1: w.id, limit: 500 })).map((r) => r.data);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ items: rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50) });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ inbound praise
  router.post('/api/inbound-sources', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const label = typeof req.body?.label === 'string' ? clean(req.body.label) : '';
      if (!label || label.length > 60) return apiError(res, 400, 'invalid_label', 'label is required (up to 60 characters).');
      const existing = await ctx.repo.findDocs<StoredSource>(INBOUND_SOURCES, { k1: creator.id, limit: MAX_SOURCES + 1 });
      if (existing.length >= MAX_SOURCES) return apiError(res, 409, 'source_limit', `You can register up to ${MAX_SOURCES} inbound sources.`);
      const secret = newSecret('insec');
      const stored: StoredSource = { id: randomUUID(), creatorId: creator.id, label, createdAt: new Date().toISOString(), secretSealed: sealSecret(ctx.sessionSecret, secret) };
      await ctx.repo.putDoc(INBOUND_SOURCES, stored.id, stored, { k1: creator.id, n1: Date.parse(stored.createdAt) });
      const { creatorId: _c, secretSealed: _s, ...source } = stored;
      res.status(201).json({ source, secret, url: `${baseUrl(ctx, req)}/api/inbound/praise/${stored.id}` } satisfies InboundSourceCreated);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/inbound-sources', withCatalog, requireSession, async (_req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const items = (await ctx.repo.findDocs<StoredSource>(INBOUND_SOURCES, { k1: creator.id, limit: 50 })).map(({ data }) => {
        const { creatorId: _c, secretSealed: _s, ...rest } = data;
        return rest;
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/inbound-sources/:id', originGuard, withCatalog, requireSession, async (req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const s = await ctx.repo.getDoc<StoredSource>(INBOUND_SOURCES, String(req.params.id));
      if (!s || s.creatorId !== creator.id) return apiError(res, 404, 'not_found', 'Inbound source not found.');
      await ctx.repo.deleteDoc(INBOUND_SOURCES, s.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  const parsePraise = (b: Record<string, unknown>): { ok: true; badge: PraiseBadge; message: string } | { ok: false; error: string } => {
    if (!PRAISE_BADGES.includes(b.badge as PraiseBadge)) return { ok: false, error: `badge must be one of: ${PRAISE_BADGES.join(', ')}.` };
    if (typeof b.message !== 'string') return { ok: false, error: 'message is required.' };
    const message = clean(b.message);
    if (!message || message.length > 280) return { ok: false, error: 'message must be 1-280 characters.' };
    return { ok: true, badge: b.badge as PraiseBadge, message };
  };

  const toPublicPraise = (p: Praise): PublicPraise => ({ id: p.id, handle: p.handle, badge: p.badge, message: p.message, createdAt: p.createdAt, source: p.source });

  /**
   * Signed server-to-server webhook: `X-TellThem-Signature: sha256=HMAC(secret, "<ts>.<raw body>")`
   * plus `X-TellThem-Timestamp` (unix seconds, +-5 min) so captured requests cannot be replayed
   * later. Re-delivery of the same `externalId` is a harmless no-op.
   */
  router.post('/api/inbound/praise/:sourceId', withCatalog, inboundLimiter, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const source = await ctx.repo.getDoc<StoredSource>(INBOUND_SOURCES, String(req.params.sourceId));
      const raw = (req as Request & { rawBody?: Buffer }).rawBody;
      const sig = req.headers['x-tellthem-signature'];
      const ts = String(req.headers['x-tellthem-timestamp'] ?? '');
      // Unknown source and bad signature are indistinguishable.
      const reject = () => apiError(res, 401, 'invalid_signature', 'The signature or timestamp is not valid.');
      if (!source || !raw || typeof sig !== 'string' || !/^\d{9,12}$/.test(ts)) return reject();
      if (Math.abs(Date.now() / 1000 - Number(ts)) > TIMESTAMP_WINDOW_S) return reject();
      const expected = signPayload(openSecret(ctx.sessionSecret, source.secretSealed), ts, raw.toString('utf8'));
      if (!tokenMatches(sig, expected)) return reject();

      const b = (req.body ?? {}) as Record<string, unknown>;
      const externalId = typeof b.externalId === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(b.externalId) ? b.externalId : null;
      if (!externalId) return apiError(res, 400, 'invalid_external_id', 'externalId is required (letters, numbers, . _ : -, up to 120).');
      const handle = typeof b.handle === 'string' ? clean(b.handle).slice(0, 40) : '';
      if (!handle || !/^@?[\w. -]{1,40}$/.test(handle)) return apiError(res, 400, 'invalid_handle', 'handle is required (up to 40 characters).');
      const parsed = parsePraise(b);
      if ('error' in parsed) return apiError(res, 400, 'invalid_praise', parsed.error);

      const creation = typeof b.creationId === 'string' ? await ctx.repo.getCreation(b.creationId) : null;
      // A source can only praise its own creator's public work.
      if (!creation || creation.creatorId !== source.creatorId || !isPubliclyVisible(creation, await ctx.repo.getModeration(creation.id))) {
        return apiError(res, 404, 'not_found', 'Creation not found.');
      }

      const safety = validateKindnessAndSafety(parsed.message);
      const praise: Praise = {
        id: `${source.id}:${externalId}`,
        creationId: creation.id,
        source: source.id,
        externalId,
        handle,
        badge: parsed.badge,
        message: parsed.message,
        status: safety.valid ? 'approved' : 'rejected',
        createdAt: new Date().toISOString(),
      };
      const inserted = await ctx.repo.insertDocUnique(PRAISE, praise.id, praise, { k1: creation.id, n1: Date.parse(praise.createdAt) });
      if (!inserted) return res.status(200).json({ duplicate: true });
      if (!safety.valid) return apiError(res, 422, 'praise_rejected', safety.reason ?? 'That message is not allowed.');
      res.status(201).json({ praise: toPublicPraise(praise) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/creations/:id/praise', originGuard, withCatalog, requireSession, nativePraiseLimiter, async (req, res, next) => {
    try {
      const { ctx, creator } = required(res);
      const creation = await ctx.repo.getCreation(String(req.params.id));
      if (!creation || !isPubliclyVisible(creation, await ctx.repo.getModeration(creation.id))) return apiError(res, 404, 'not_found', 'Creation not found.');
      if (creation.creatorId === creator.id) return apiError(res, 400, 'own_creation', 'You cannot praise your own creation.');
      const parsed = parsePraise(req.body ?? {});
      if ('error' in parsed) return apiError(res, 400, 'invalid_praise', parsed.error);
      const safety = validateKindnessAndSafety(parsed.message);
      if (!safety.valid) return apiError(res, 422, 'praise_rejected', safety.reason ?? 'That message is not allowed.');
      const externalId = randomUUID();
      const praise: Praise = {
        id: `native:${externalId}`,
        creationId: creation.id,
        source: 'native',
        externalId,
        handle: creator.handle,
        badge: parsed.badge,
        message: parsed.message,
        status: 'approved',
        createdAt: new Date().toISOString(),
      };
      await ctx.repo.putDoc(PRAISE, praise.id, praise, { k1: creation.id, n1: Date.parse(praise.createdAt) });
      res.status(201).json({ praise: toPublicPraise(praise) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/creations/:id/praise', withCatalog, async (req, res, next) => {
    try {
      const { ctx } = locals(res);
      const creation = await ctx.repo.getCreation(String(req.params.id));
      if (!creation || !isPubliclyVisible(creation, await ctx.repo.getModeration(creation.id))) return apiError(res, 404, 'not_found', 'Creation not found.');
      const rows = (await ctx.repo.findDocs<Praise>(PRAISE, { k1: creation.id, limit: 500 })).map((r) => r.data).filter((p) => p.status === 'approved');
      res.setHeader('Cache-Control', 'no-cache');
      res.json({ items: rows.reverse().slice(0, 50).map(toPublicPraise) });
    } catch (err) {
      next(err);
    }
  });
}
