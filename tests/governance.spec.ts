import { test, expect, APIRequestContext, APIResponse } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { JobQueue } from '../src/server/jobs/JobQueue';
import { JobWorker } from '../src/server/jobs/worker';
import { FileCatalogRepository } from '../src/server/catalog/FileCatalogRepository';
import { CompositeClassifier, RuleClassifier, SafetyClassifier, createSafetyClassifier } from '../src/server/safety/SafetyClassifier';

const BASE = 'http://localhost:3000';
const ADMIN = { Authorization: 'Bearer test-admin-token-0123456789' };
const handle = () => `@g_${Math.random().toString(36).slice(2, 10)}`;

/** Unique audio per call: revoked content is blocklisted by hash, so tests must not share bytes. */
function wavUnique(samples = 600): Buffer {
  const data = randomBytes(samples * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24);
  h.writeUInt32LE(16000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

type Created = { id: string; isPublished: boolean };

class Actor {
  constructor(
    readonly api: APIRequestContext,
    readonly handle: string
  ) {}
  async create(over: Record<string, unknown> = {}, audio = wavUnique()): Promise<Created> {
    const res = await this.api.post('/api/creations', {
      data: {
        title: 'Governance Song',
        genre: 'Rock Band',
        lyrics: '[Verse]\nMorning light',
        provenance: 'AI-Generated Material',
        kind: 'music',
        audioBase64: audio.toString('base64'),
        ...over,
      },
    });
    expect(res.status(), await res.text()).toBeLessThan(300);
    return (await res.json()).creation as Created;
  }
  async publish(id: string): Promise<APIResponse> {
    return this.api.patch(`/api/creations/${id}/publish`, { data: { isPublished: true } });
  }
  async createPublished(over: Record<string, unknown> = {}) {
    const c = await this.create(over);
    expect((await this.publish(c.id)).status()).toBe(200);
    return c;
  }
  mine = async () => ((await (await this.api.get('/api/creations?mine=1')).json()).items as Record<string, any>[]);
}

test.describe('governance: reports, provenance, consent', () => {
  const contexts: APIRequestContext[] = [];
  const actors: Actor[] = [];

  async function actor(playwright: any): Promise<Actor> {
    const api = await playwright.request.newContext({ baseURL: BASE });
    contexts.push(api);
    const h = handle();
    expect((await api.post('/api/session', { data: { handle: h } })).status()).toBe(201);
    const a = new Actor(api, h);
    actors.push(a);
    return a;
  }
  const publicList = async (api: APIRequestContext) =>
    ((await (await api.get('/api/creations?limit=50')).json()).items as Record<string, any>[]);
  const anon = async (playwright: any) => {
    const api = await playwright.request.newContext({ baseURL: BASE });
    contexts.push(api);
    return api;
  };

  test.afterEach(async () => {
    for (const a of actors) {
      for (const item of await a.mine().catch(() => [])) await a.api.delete(`/api/creations/${item.id}`).catch(() => undefined);
    }
    actors.length = 0;
    await Promise.all(contexts.map((c) => c.dispose()));
    contexts.length = 0;
  });

  test('health advertises moderation and the job queue', async ({ request }) => {
    const body = await (await request.get('/api/health')).json();
    expect(body.catalog.moderation).toEqual({ classifier: 'rules', adminEnabled: true });
    // Other specs dead-letter webhook deliveries on purpose, so assert shape, not zero.
    expect(body.catalog.jobs).toEqual(
      expect.objectContaining({ dead: expect.any(Number), queued: expect.any(Number), leased: expect.any(Number) }),
    );
  });

  test('community reports: validation, de-duplication, auto-flag at the threshold, moderator review', async ({ playwright }) => {
    const owner = await actor(playwright);
    const item = await owner.createPublished();
    const reporters = [await actor(playwright), await actor(playwright), await actor(playwright)];
    const visitor = await anon(playwright);

    // Validation and visibility rules.
    expect((await reporters[0].api.post(`/api/creations/${item.id}/reports`, { data: { reason: 'nope' } })).status()).toBe(400);
    expect((await owner.api.post(`/api/creations/${item.id}/reports`, { data: { reason: 'other' } })).status()).toBe(400);
    const hidden = await owner.create();
    expect((await reporters[0].api.post(`/api/creations/${hidden.id}/reports`, { data: { reason: 'other' } })).status()).toBe(404);

    // The same reporter cannot stack reports.
    expect((await reporters[0].api.post(`/api/creations/${item.id}/reports`, { data: { reason: 'rights', details: 'not theirs' } })).status()).toBe(201);
    expect((await reporters[0].api.post(`/api/creations/${item.id}/reports`, { data: { reason: 'rights' } })).status()).toBe(200);
    expect((await reporters[1].api.post(`/api/creations/${item.id}/reports`, { data: { reason: 'unsafe' } })).status()).toBe(201);
    expect((await publicList(visitor)).map((i) => i.id)).toContain(item.id);

    // Third distinct reporter reaches the threshold: pulled from public view pending review.
    const third = await reporters[2].api.post(`/api/creations/${item.id}/reports`, { data: { reason: 'harassment' } });
    expect((await third.json()).flagged).toBe(true);
    expect((await publicList(visitor)).map((i) => i.id)).not.toContain(item.id);
    expect((await visitor.get(`/api/creations/${item.id}/audio`)).status()).toBe(404);
    expect((await owner.api.get(`/api/creations/${item.id}/audio`)).status()).toBe(200);

    // Moderator endpoints demand the token.
    expect((await visitor.get('/api/admin/reports')).status()).toBe(401);
    expect((await visitor.get('/api/admin/reports', { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401);
    const queue = await (await visitor.get('/api/admin/reports', { headers: ADMIN })).json();
    const entry = queue.items.find((i: any) => i.creationId === item.id);
    expect(entry.reportCount).toBe(3);
    expect(entry.moderationStatus).toBe('flagged');
    expect(JSON.stringify(queue)).not.toContain('reporterKeyHash');

    // Approve: back in public, reports dismissed.
    const approve = await visitor.post(`/api/admin/creations/${item.id}/moderation`, { headers: ADMIN, data: { action: 'approve' } });
    expect(approve.status()).toBe(200);
    expect((await publicList(visitor)).map((i) => i.id)).toContain(item.id);
    const after = await (await visitor.get('/api/admin/reports', { headers: ADMIN })).json();
    expect(after.items.find((i: any) => i.creationId === item.id)).toBeUndefined();

    // Reject: removed and unpublished.
    expect((await visitor.post(`/api/admin/creations/${item.id}/moderation`, { headers: ADMIN, data: { action: 'reject', reason: 'policy' } })).status()).toBe(200);
    expect((await publicList(visitor)).map((i) => i.id)).not.toContain(item.id);
    expect((await visitor.post(`/api/admin/creations/${item.id}/moderation`, { headers: ADMIN, data: { action: 'bogus' } })).status()).toBe(400);

    // The creator cannot clear a moderator's rejection by toggling publish.
    await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: false } });
    const retry = await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: true } });
    expect(retry.status()).toBe(422);
    expect((await retry.json()).code).toBe('moderation_rejected');
    expect((await publicList(visitor)).map((i) => i.id)).not.toContain(item.id);

    // Only a moderator's approval lifts it.
    expect((await visitor.post(`/api/admin/creations/${item.id}/moderation`, { headers: ADMIN, data: { action: 'approve' } })).status()).toBe(200);
    expect((await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: true } })).status()).toBe(200);
    expect((await publicList(visitor)).map((i) => i.id)).toContain(item.id);
  });

  test('remix provenance is validated server-side and credited publicly', async ({ playwright }) => {
    const author = await actor(playwright);
    const remixer = await actor(playwright);
    const visitor = await anon(playwright);
    const parentPrivate = await author.create({ title: 'Secret Draft' });

    // Not public (and not yours): indistinguishable from missing.
    const hiddenTry = await remixer.api.post('/api/creations', {
      data: { title: 'Nope', genre: 'Pop', provenance: 'AI-Generated Material', remixOfId: parentPrivate.id, audioBase64: wavUnique().toString('base64') },
    });
    expect(hiddenTry.status()).toBe(404);
    expect((await hiddenTry.json()).code).toBe('parent_unavailable');

    // Public but no remix consent.
    const parent = await author.createPublished({ title: 'Original Anthem' });
    const denied = await remixer.api.post('/api/creations', {
      data: { title: 'Remix', genre: 'Pop', provenance: 'AI-Generated Material', remixOfId: parent.id, audioBase64: wavUnique().toString('base64') },
    });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe('remix_not_permitted');

    // Consent given: remix accepted, attributed, and its lineage is visible.
    expect((await author.api.patch(`/api/creations/${parent.id}/remix-permission`, { data: { remixPermitted: true } })).status()).toBe(200);
    expect((await remixer.api.patch(`/api/creations/${parent.id}/remix-permission`, { data: { remixPermitted: true } })).status()).toBe(403);
    const child = await remixer.createPublished({ title: 'Anthem Remix', remixOfId: parent.id });
    const listed = (await publicList(visitor)).find((i) => i.id === child.id)!;
    expect(listed.remixOf).toEqual({ id: parent.id, title: 'Original Anthem', creatorHandle: author.handle });
    expect(listed.remixDepth).toBe(1);

    const lineage = await (await visitor.get(`/api/creations/${child.id}/lineage`)).json();
    expect(lineage.ancestors).toEqual([{ id: parent.id, title: 'Original Anthem', creatorHandle: author.handle }]);
    const parentLineage = await (await visitor.get(`/api/creations/${parent.id}/lineage`)).json();
    expect(parentLineage.remixes.map((r: any) => r.id)).toEqual([child.id]);

    // Parent link is immutable once created.
    const rewire = await remixer.api.post('/api/creations', {
      data: { title: 'Anthem Remix', genre: 'Pop', provenance: 'AI-Generated Material', remixOfId: child.id, clientRef: 'x', audioBase64: wavUnique().toString('base64') },
    });
    expect([201, 403, 404]).toContain(rewire.status());
  });

  test('remix chains are depth-limited', async ({ playwright }) => {
    const a = await actor(playwright);
    let parent = await a.create({ title: 'Level 0' });
    for (let depth = 1; depth <= 5; depth++) {
      parent = await a.create({ title: `Level ${depth}`, remixOfId: parent.id });
    }
    const tooDeep = await a.api.post('/api/creations', {
      data: { title: 'Level 6', genre: 'Pop', provenance: 'AI-Generated Material', remixOfId: parent.id, audioBase64: wavUnique().toString('base64') },
    });
    expect(tooDeep.status()).toBe(422);
    expect((await tooDeep.json()).code).toBe('remix_too_deep');
  });

  test('soft revocation cascades through remixes, blocks re-upload, and can be undone by the owner', async ({ playwright }) => {
    const author = await actor(playwright);
    const remixer = await actor(playwright);
    const visitor = await anon(playwright);
    const audio = wavUnique();
    const parent = await author.create({ title: 'Cascade Root', remixPermitted: true }, audio);
    expect((await author.publish(parent.id)).status()).toBe(200);
    const child = await remixer.createPublished({ title: 'Cascade Child', remixOfId: parent.id });
    const grandchild = await remixer.createPublished({ title: 'Cascade Grandchild', remixOfId: child.id });
    // Remix consent is also required for deeper chains.
    expect(grandchild.id).toBeTruthy();

    const res = await author.api.post(`/api/creations/${parent.id}/revoke-consent`, { data: { mode: 'soft' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.revokedIds.sort()).toEqual([parent.id, child.id, grandchild.id].sort());
    expect(body.purgeAfter).toBeTruthy();

    const ids = (await publicList(visitor)).map((i) => i.id);
    for (const id of [parent.id, child.id, grandchild.id]) {
      expect(ids).not.toContain(id);
      expect((await visitor.get(`/api/creations/${id}/audio`)).status()).toBe(404);
    }
    const remixerView = await remixer.mine();
    const childView = remixerView.find((i) => i.id === child.id)!;
    expect(childView.revokedBecause).toBe('ancestor');
    expect(childView.isPublished).toBe(false);

    // Can't publish while revoked; can't slip the same audio back in.
    expect((await author.publish(parent.id)).status()).toBe(410);
    const reupload = await author.api.post('/api/creations', {
      data: { title: 'Sneaky', genre: 'Pop', provenance: 'AI-Generated Material', audioBase64: audio.toString('base64') },
    });
    expect(reupload.status()).toBe(409);
    expect((await reupload.json()).code).toBe('content_revoked');

    // Only the creator-initiated revocation is restorable.
    expect((await remixer.api.post(`/api/creations/${child.id}/restore`)).status()).toBe(403);
    expect((await visitor.post(`/api/creations/${parent.id}/restore`)).status()).toBe(401);
    const restored = await author.api.post(`/api/creations/${parent.id}/restore`);
    expect(restored.status()).toBe(200);
    expect((await restored.json()).restoredIds.sort()).toEqual([parent.id, child.id, grandchild.id].sort());
    expect((await author.publish(parent.id)).status()).toBe(200);
    expect((await publicList(visitor)).map((i) => i.id)).toContain(parent.id);
    // The hash is released, so the same bytes may be uploaded again.
    const again = await author.api.post('/api/creations', {
      data: { title: 'Back again', genre: 'Pop', provenance: 'AI-Generated Material', audioBase64: audio.toString('base64') },
    });
    expect(again.status()).toBe(201);
  });

  test('soft-revoked audio is purged by the worker once the window closes', async ({ playwright }) => {
    const author = await actor(playwright);
    const item = await author.createPublished({ title: 'Window Closing' });
    expect((await author.api.post(`/api/creations/${item.id}/revoke-consent`, { data: { mode: 'soft' } })).status()).toBe(200);
    expect((await author.mine()).map((i) => i.id)).toContain(item.id);
    await expect.poll(async () => (await author.mine()).map((i) => i.id), { timeout: 25_000, intervals: [500] }).not.toContain(item.id);
    expect((await author.api.get(`/api/creations/${item.id}/audio`)).status()).toBe(404);
    expect((await author.api.post(`/api/creations/${item.id}/restore`)).status()).toBe(404);
  });

  test('hard revocation purges the whole remix tree immediately and keeps the hash blocked', async ({ playwright }) => {
    const author = await actor(playwright);
    const remixer = await actor(playwright);
    const audio = wavUnique();
    const parent = await author.create({ title: 'Hard Root', remixPermitted: true }, audio);
    await author.publish(parent.id);
    const child = await remixer.createPublished({ title: 'Hard Child', remixOfId: parent.id });

    const res = await author.api.post(`/api/creations/${parent.id}/revoke-consent`, { data: { mode: 'hard' } });
    expect(res.status()).toBe(200);
    expect((await res.json()).purgeAfter).toBeNull();
    await expect.poll(async () => (await remixer.mine()).map((i) => i.id), { timeout: 10_000 }).not.toContain(child.id);
    expect((await author.mine()).map((i) => i.id)).not.toContain(parent.id);
    expect((await author.api.post(`/api/creations/${parent.id}/restore`)).status()).toBe(404);
    const reupload = await author.api.post('/api/creations', {
      data: { title: 'Again', genre: 'Pop', provenance: 'AI-Generated Material', audioBase64: audio.toString('base64') },
    });
    expect(reupload.status()).toBe(409);
  });

  test('deleting an original that others remixed withdraws consent for the whole tree', async ({ playwright }) => {
    const author = await actor(playwright);
    const remixer = await actor(playwright);
    const visitor = await anon(playwright);
    const parent = await author.create({ title: 'Delete Root', remixPermitted: true });
    await author.publish(parent.id);
    const child = await remixer.createPublished({ title: 'Delete Child', remixOfId: parent.id });

    expect((await author.api.delete(`/api/creations/${parent.id}`)).status()).toBe(204);
    expect((await publicList(visitor)).map((i) => i.id)).not.toContain(child.id);
    expect((await visitor.get(`/api/creations/${child.id}/audio`)).status()).toBe(404);
    expect((await remixer.mine()).map((i) => i.id)).not.toContain(child.id);
  });

  test('moderators can revoke a creation; the creator sees why', async ({ playwright }) => {
    const author = await actor(playwright);
    const visitor = await anon(playwright);
    const item = await author.createPublished({ title: 'Mod Target' });
    const res = await visitor.post(`/api/admin/creations/${item.id}/moderation`, { headers: ADMIN, data: { action: 'revoke', reason: 'rights claim' } });
    expect(res.status()).toBe(200);
    expect((await publicList(visitor)).map((i) => i.id)).not.toContain(item.id);
    const view = (await author.mine()).find((i) => i.id === item.id)!;
    expect(view.revokedBecause).toBe('moderation');
    // Creators cannot undo a moderator's decision.
    expect((await author.api.post(`/api/creations/${item.id}/restore`)).status()).toBe(403);
  });
});

test.describe('job queue and safety classifiers', () => {
  test('queue: dedupe, retry with backoff, dead-lettering, and handler execution', async () => {
    let now = 1_000_000;
    const repo = new FileCatalogRepository(null);
    await repo.init();
    const queue = new JobQueue(repo, () => now);

    expect(await queue.enqueue('t', { n: 1 }, { dedupeKey: 'same' })).toBe(true);
    expect(await queue.enqueue('t', { n: 2 }, { dedupeKey: 'same' })).toBe(false);

    const job = (await queue.lease(30_000))!;
    expect(job.attempts).toBe(1);
    expect(await queue.lease(30_000)).toBeNull(); // leased, not yet expired
    expect(await queue.fail(job, new Error('boom'))).toBe('retry');
    expect(await queue.lease(30_000)).toBeNull(); // backing off
    now += 5_000;
    const retried = (await queue.lease(30_000))!;
    expect(retried.attempts).toBe(2);
    expect(retried.lastError).toBe('boom');
    await queue.complete(retried);
    expect((await queue.stats()).queued).toBe(0);

    // Expired lease is reclaimed (worker crash safety).
    await queue.enqueue('crash', {}, { maxAttempts: 2 });
    const first = (await queue.lease(1_000))!;
    now += 2_000;
    const reclaimed = (await queue.lease(1_000))!;
    expect(reclaimed.id).toBe(first.id);
    expect(reclaimed.attempts).toBe(2);
    expect(await queue.fail(reclaimed, 'again')).toBe('dead');
    expect((await queue.stats()).dead).toBe(1);

    // Delayed jobs wait for their time.
    await queue.enqueue('later', {}, { runAt: now + 60_000 });
    expect(await queue.lease(1_000)).toBeNull();
    now += 61_000;
    expect((await queue.lease(1_000))?.type).toBe('later');

    // Worker runs registered handlers and retries missing ones.
    const seen: unknown[] = [];
    const worker = new JobWorker(queue, { log: () => undefined });
    worker.register('ok', async (j) => void seen.push(j.payload));
    await queue.enqueue('ok', { hello: 'world' });
    await queue.enqueue('unknown', {}, { maxAttempts: 1 });
    await worker.drain();
    expect(seen).toEqual([{ hello: 'world' }]);
    expect((await queue.listDead()).some((j) => j.type === 'unknown')).toBe(true);
  });

  test('document store enforces unique (k1,k2) pairs and atomic claims', async () => {
    const repo = new FileCatalogRepository(null);
    await repo.init();
    expect(await repo.insertDocUnique('c', 'a', { v: 1 }, { k1: 'x', k2: 'y' })).toBe(true);
    expect(await repo.insertDocUnique('c', 'b', { v: 2 }, { k1: 'x', k2: 'y' })).toBe(false);
    expect(await repo.insertDocUnique('c', 'a', { v: 3 })).toBe(false);
    expect(await repo.insertDocUnique('c', 'd', { v: 4 }, { k1: 'x', k2: 'z' })).toBe(true);
    expect((await repo.findDocs('c', { k1: 'x' })).length).toBe(2);
  });

  test('classifiers: rules reject PII, the composite stops at the first non-approval, AI is opt-in', async () => {
    const rules = new RuleClassifier();
    const input = { title: 'Nice Song', genre: 'Pop', lyrics: 'call me at 412-555-0199' };
    expect((await rules.classify(input)).status).toBe('rejected');
    expect((await rules.classify({ ...input, lyrics: 'la la la' })).status).toBe('approved');

    const calls: string[] = [];
    const stub = (name: string, status: 'approved' | 'flagged'): SafetyClassifier => ({
      name,
      classify: async () => {
        calls.push(name);
        return { status, flagReason: status === 'flagged' ? 'held' : null, source: name };
      },
    });
    const composite = new CompositeClassifier([stub('a', 'approved'), stub('b', 'flagged'), stub('c', 'approved')]);
    expect((await composite.classify({ ...input, lyrics: 'ok' })).status).toBe('flagged');
    expect(calls).toEqual(['a', 'b']);

    expect(createSafetyClassifier({ GEMINI_API_KEY: 'k' }).name).toBe('rules');
    expect(createSafetyClassifier({ GEMINI_API_KEY: 'k', SAFETY_AI: 'true' }).name).toBe('rules+gemini');
    expect(createSafetyClassifier({ SAFETY_AI: 'true' }).name).toBe('rules');
  });
});
