import type { PublicationModeration, StoredCreation } from '../../types/community';
import type { EpisodeRecord, Show, ShowSchedule } from '../../types/distribution';
import type { CatalogContext } from '../catalog/factory';
import { standingModeration } from '../governance';
import type { JobRecord } from '../jobs/JobQueue';
import { randomUUID } from 'node:crypto';
import { nextSlotAfter } from './schedule';
import { emitCreationEvent, emitEvent, creationEventData } from './webhooks';

export const SHOWS = 'show';
export const EPISODES = 'episode';
export const SCHEDULES = 'show-schedule';
export const JOB_PUBLISH_EPISODE = 'publish-episode';

export const getShow = (ctx: CatalogContext, id: string) => ctx.repo.getDoc<Show>(SHOWS, id);
export const getEpisode = (ctx: CatalogContext, creationId: string) => ctx.repo.getDoc<EpisodeRecord>(EPISODES, creationId);
export const getSchedule = (ctx: CatalogContext, showId: string) => ctx.repo.getDoc<ShowSchedule>(SCHEDULES, showId);

export async function listEpisodes(ctx: CatalogContext, showId: string): Promise<EpisodeRecord[]> {
  return (await ctx.repo.findDocs<EpisodeRecord>(EPISODES, { k1: showId, limit: 500 })).map((r) => r.data);
}

export const putEpisode = (ctx: CatalogContext, e: EpisodeRecord) =>
  ctx.repo.putDoc(EPISODES, e.creationId, e, { k1: e.showId, n1: e.episodeNumber });

export interface PublishOutcome {
  ok: boolean;
  state: EpisodeRecord['publishState'];
  /** Present when the episode was kept as a draft. */
  reason?: string;
}

/**
 * Moves an episode to `published`. The same moderation gate as any other publication applies,
 * including standing moderator decisions, so scheduling can never be used to bypass review.
 * A held or rejected episode stays a draft and records why, for the creator to see.
 */
export async function publishEpisode(ctx: CatalogContext, creationId: string): Promise<PublishOutcome> {
  const episode = await getEpisode(ctx, creationId);
  if (!episode) return { ok: false, state: 'draft', reason: 'This episode is not part of a show.' };
  if (episode.publishState === 'published') return { ok: true, state: 'published' };

  const creation = await ctx.repo.getCreation(creationId);
  const hold = async (reason: string): Promise<PublishOutcome> => {
    await putEpisode(ctx, { ...episode, publishState: 'draft', scheduledFor: null, holdReason: reason });
    return { ok: false, state: 'draft', reason };
  };
  if (!creation) return hold('The audio for this episode no longer exists.');
  if (creation.revokedAt) return hold('Consent for this episode was withdrawn.');

  const existing = await ctx.repo.getModeration(creation.id);
  const standing = await standingModeration(ctx, creation.id, existing);
  const verdict = standing ?? (await ctx.classifier.classify(creation));
  const moderation: PublicationModeration = {
    id: existing?.id ?? randomUUID(),
    creationId: creation.id,
    status: verdict.status,
    flagReason: verdict.flagReason,
    reviewedAt: new Date().toISOString(),
  };
  await ctx.repo.saveModeration(moderation);
  if (verdict.status !== 'approved') {
    return hold(verdict.flagReason || (verdict.status === 'rejected' ? 'This episode cannot be published.' : 'Waiting for moderator review.'));
  }

  const now = new Date().toISOString();
  const wasPublished = creation.isPublished;
  const updated: StoredCreation = { ...creation, isPublished: true, updatedAt: now };
  await ctx.repo.updateCreation(updated);
  await putEpisode(ctx, { ...episode, publishState: 'published', publishedAt: now, scheduledFor: null, holdReason: null });
  if (!wasPublished) await emitCreationEvent(ctx, 'creation.published', updated);
  await emitEvent(ctx, creation.creatorId, 'episode.published', {
    ...(await creationEventData(ctx, updated)),
    show: { id: episode.showId, episodeNumber: episode.episodeNumber },
  });
  return { ok: true, state: 'published' };
}

/** Marks an episode scheduled and enqueues the durable job that will publish it. */
export async function scheduleEpisode(ctx: CatalogContext, episode: EpisodeRecord, whenMs: number): Promise<EpisodeRecord> {
  const scheduledFor = new Date(whenMs).toISOString();
  const next: EpisodeRecord = { ...episode, publishState: 'scheduled', scheduledFor, holdReason: null };
  await putEpisode(ctx, next);
  await ctx.jobs.enqueue(
    JOB_PUBLISH_EPISODE,
    { creationId: episode.creationId, scheduledFor },
    { dedupeKey: `${episode.creationId}:${scheduledFor}`, runAt: whenMs }
  );
  return next;
}

/** The next free weekly slot for a show: after now and after any already-scheduled episode. */
export async function nextFreeSlot(ctx: CatalogContext, showId: string, nowMs = Date.now()): Promise<Date | null> {
  const schedule = await getSchedule(ctx, showId);
  if (!schedule?.active) return null;
  const taken = (await listEpisodes(ctx, showId)).filter((e) => e.publishState === 'scheduled' && e.scheduledFor).map((e) => Date.parse(e.scheduledFor as string));
  return nextSlotAfter(schedule, Math.max(nowMs, ...taken));
}

export function registerEpisodeHandlers(ctx: CatalogContext): void {
  ctx.worker.register(JOB_PUBLISH_EPISODE, async (job: JobRecord) => {
    const p = job.payload as { creationId: string; scheduledFor: string };
    const episode = await getEpisode(ctx, p.creationId);
    // Rescheduled, unscheduled, removed or already published: this job is stale.
    if (!episode || episode.publishState !== 'scheduled' || episode.scheduledFor !== p.scheduledFor) return;
    await publishEpisode(ctx, p.creationId);
  });
}
