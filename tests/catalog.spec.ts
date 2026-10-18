import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileCatalogRepository } from '../src/server/catalog/FileCatalogRepository';
import { HandleTakenError } from '../src/server/catalog/CatalogRepository';
import { LocalObjectStorage } from '../src/server/storage/LocalObjectStorage';
import { createSessionToken, verifySessionToken } from '../src/server/session';
import type { StoredCreation, StoredCreator } from '../src/types/community';

const BASE = 'http://localhost:3000';
const handle = () => `@t_${Math.random().toString(36).slice(2, 10)}`;

function wav(samples = 800): Buffer {
  const data = Buffer.alloc(samples * 2);
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

const creation = (over: Record<string, unknown> = {}) => ({
  title: 'Sunrise Chorus',
  genre: 'Rock Band',
  lyrics: '[Verse 1]\nMorning light on the river',
  provenance: 'AI-Generated Material',
  kind: 'music',
  durationLabel: '2:48',
  audioBase64: wav().toString('base64'),
  ...over,
});

async function newCreator(request: APIRequestContext, h = handle()) {
  const res = await request.post('/api/session', { data: { handle: h } });
  expect(res.status()).toBe(201);
  return { handle: h, profile: (await res.json()).profile };
}

async function upload(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/creations', { data: creation(over) });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return (await res.json()).creation as { id: string; isPublished: boolean };
}

const publicIds = async (request: APIRequestContext) =>
  ((await (await request.get('/api/creations?limit=50')).json()).items as { id: string }[]).map((i) => i.id);

/** Deletes everything the caller's session owns so specs leave the shared catalog empty. */
async function purgeMine(request: APIRequestContext) {
  const res = await request.get('/api/creations?mine=1&limit=100');
  if (res.status() !== 200) return;
  for (const item of (await res.json()).items as { id: string }[]) {
    await request.delete(`/api/creations/${item.id}`);
  }
}

test.describe('catalog API', () => {
  test.afterEach(async ({ request }) => {
    await purgeMine(request);
  });
  test('health advertises the catalog and an isolated driver', async ({ request }) => {
    const body = await (await request.get('/api/health')).json();
    expect(body.catalog.enabled).toBe(true);
    expect(body.catalog.driver).toBe('memory');
  });

  test('unauthenticated writes are rejected while the public list stays readable', async ({ request }) => {
    expect((await request.get('/api/creations')).status()).toBe(200);
    expect((await request.post('/api/creations', { data: creation() })).status()).toBe(401);
    expect((await request.patch('/api/creations/anything/publish', { data: { isPublished: true } })).status()).toBe(401);
    expect((await request.delete('/api/creations/anything')).status()).toBe(401);
    expect((await request.get('/api/session')).status()).toBe(401);
    expect((await request.get('/api/creations?mine=1')).status()).toBe(401);
  });

  test('full lifecycle: private upload, publish, stream with ranges, unpublish, delete', async ({ request, playwright }) => {
    const me = await newCreator(request);
    const made = await upload(request, { clientRef: 'local-1' });
    expect(made.isPublished).toBe(false);

    const anon = await playwright.request.newContext({ baseURL: BASE });
    expect(await publicIds(anon)).not.toContain(made.id);
    // Private audio is invisible to everyone but the owner (and looks like a missing file).
    expect((await anon.get(`/api/creations/${made.id}/audio`)).status()).toBe(404);
    expect((await request.get(`/api/creations/${made.id}/audio`)).status()).toBe(200);
    const mine = await (await request.get('/api/creations?mine=1')).json();
    expect(mine.items.map((i: { id: string }) => i.id)).toContain(made.id);

    const pub = await request.patch(`/api/creations/${made.id}/publish`, { data: { isPublished: true } });
    expect(pub.status()).toBe(200);
    expect((await pub.json()).moderation.status).toBe('approved');

    const list = (await (await anon.get('/api/creations?limit=50')).json()).items as Record<string, unknown>[];
    const item = list.find((i) => i.id === made.id)!;
    expect(item.creatorHandle).toBe(me.handle);
    expect(item).not.toHaveProperty('creatorId');
    expect(item).not.toHaveProperty('audioKey');
    expect(item.audioUrl).toBe(`/api/creations/${made.id}/audio`);

    const full = await anon.get(`/api/creations/${made.id}/audio`);
    expect(full.status()).toBe(200);
    expect(full.headers()['content-type']).toBe('audio/wav');
    expect(full.headers()['accept-ranges']).toBe('bytes');
    const total = (await full.body()).length;

    const part = await anon.get(`/api/creations/${made.id}/audio`, { headers: { Range: 'bytes=0-9' } });
    expect(part.status()).toBe(206);
    expect(part.headers()['content-range']).toBe(`bytes 0-9/${total}`);
    expect((await part.body()).length).toBe(10);
    expect((await anon.get(`/api/creations/${made.id}/audio`, { headers: { Range: `bytes=${total + 5}-` } })).status()).toBe(416);

    expect((await request.patch(`/api/creations/${made.id}/publish`, { data: { isPublished: false } })).status()).toBe(200);
    expect(await publicIds(anon)).not.toContain(made.id);

    expect((await request.delete(`/api/creations/${made.id}`)).status()).toBe(204);
    expect((await request.get(`/api/creations/${made.id}/audio`)).status()).toBe(404);
    expect((await request.delete(`/api/creations/${made.id}`)).status()).toBe(404);
    await anon.dispose();
  });

  test('another creator cannot publish or delete your work', async ({ request, playwright }) => {
    await newCreator(request);
    const made = await upload(request);
    const intruder = await playwright.request.newContext({ baseURL: BASE });
    await newCreator(intruder);

    expect((await intruder.patch(`/api/creations/${made.id}/publish`, { data: { isPublished: true } })).status()).toBe(403);
    expect((await intruder.delete(`/api/creations/${made.id}`)).status()).toBe(403);
    expect((await request.get(`/api/creations/${made.id}/audio`)).status()).toBe(200);
    expect(await publicIds(request)).not.toContain(made.id);
    await intruder.dispose();
  });

  test('handles: collisions, reserved names and malformed values are refused', async ({ request, playwright }) => {
    const h = handle();
    await newCreator(request, h);
    const other = await playwright.request.newContext({ baseURL: BASE });
    expect((await other.post('/api/session', { data: { handle: h } })).status()).toBe(409);
    expect((await other.post('/api/session', { data: { handle: '@Studio_Voyager' } })).status()).toBe(400);
    expect((await other.post('/api/session', { data: { handle: 'no spaces!' } })).status()).toBe(400);
    expect((await other.post('/api/session', { data: { handle: 'ab' } })).status()).toBe(400);
    // Re-claiming your own handle is idempotent.
    const again = await request.post('/api/session', { data: { handle: h } });
    expect(again.status()).toBe(200);
    await other.dispose();
  });

  test('session cookie is HttpOnly/SameSite and forged cookies are rejected', async ({ request, playwright }) => {
    const res = await request.post('/api/session', { data: { handle: handle() } });
    const cookie = res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')!.value;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(JSON.stringify(await res.json())).not.toMatch(/secret|claim/i);

    const forged = await playwright.request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: { cookie: 'tt_session=eyJjaWQiOiJ4IiwiZXhwIjo5OTk5OTk5OTk5fQ.forged' },
    });
    expect((await forged.get('/api/session')).status()).toBe(401);
    await forged.dispose();

    const secret = Buffer.from('x'.repeat(48));
    const token = createSessionToken('creator-1', secret);
    expect(verifySessionToken(token, secret)).toBe('creator-1');
    expect(verifySessionToken(token, Buffer.from('y'.repeat(48)))).toBeNull();
    expect(verifySessionToken(token, secret, Date.now() + 1000 * 60 * 60 * 24 * 31)).toBeNull();
  });

  test('cross-site mutations are refused', async ({ request }) => {
    const res = await request.post('/api/session', {
      data: { handle: handle() },
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status()).toBe(403);
  });

  test('moderation blocks personal contact details and put-down titles from the public catalog', async ({ request }) => {
    await newCreator(request);
    const leaky = await upload(request, { lyrics: 'call me at 412-555-0199 anytime' });
    const res = await request.patch(`/api/creations/${leaky.id}/publish`, { data: { isPublished: true } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('moderation_rejected');
    expect(body.flagReason).toBeTruthy();
    expect(await publicIds(request)).not.toContain(leaky.id);

    const rude = await upload(request, { title: 'Your terrible band' });
    expect((await request.patch(`/api/creations/${rude.id}/publish`, { data: { isPublished: true } })).status()).toBe(422);

    // Ordinary lyrics are not run through the put-down filter.
    const fine = await upload(request, { lyrics: 'The worst storm turned to gold' });
    expect((await request.patch(`/api/creations/${fine.id}/publish`, { data: { isPublished: true } })).status()).toBe(200);
  });

  test('editing a published creation re-runs moderation', async ({ request }) => {
    await newCreator(request);
    const made = await upload(request, { clientRef: 'edit-me' });
    await request.patch(`/api/creations/${made.id}/publish`, { data: { isPublished: true } });
    expect(await publicIds(request)).toContain(made.id);

    const res = await request.post('/api/creations', { data: creation({ clientRef: 'edit-me', lyrics: 'email me: a@b.com' }) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.creation.id).toBe(made.id);
    expect(body.creation.isPublished).toBe(false);
    expect(body.moderation.status).toBe('rejected');
    expect(await publicIds(request)).not.toContain(made.id);
  });

  test('uploads are validated: audio type, encoding, size and metadata', async ({ request }) => {
    await newCreator(request);
    const notAudio = Buffer.from('this is definitely not audio data').toString('base64');
    expect((await request.post('/api/creations', { data: creation({ audioBase64: notAudio }) })).status()).toBe(415);
    expect((await request.post('/api/creations', { data: creation({ audioBase64: '%%%not base64%%%' }) })).status()).toBe(400);
    expect((await request.post('/api/creations', { data: creation({ audioBase64: undefined }) })).status()).toBe(400);
    expect((await request.post('/api/creations', { data: creation({ title: '' }) })).status()).toBe(400);
    expect((await request.post('/api/creations', { data: creation({ provenance: 'Craft Commercial Spot' }) })).status()).toBe(400);
    expect((await request.post('/api/creations', { data: creation({ waveformJson: '{"not":"array"}' }) })).status()).toBe(400);
    const huge = await request.post('/api/creations', { data: creation({ audioBase64: 'A'.repeat(36_000_000) }) });
    expect(huge.status()).toBe(413);
    expect((await huge.json()).code).toBe('audio_too_large');
    const malformed = await request.post('/api/creations', {
      data: '{ not json',
      headers: { 'content-type': 'application/json' },
    });
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).code).toBe('invalid_json');
  });

  test('re-uploading the same clientRef is idempotent', async ({ request }) => {
    await newCreator(request);
    const a = await upload(request, { clientRef: 'same' });
    const b = await upload(request, { clientRef: 'same', title: 'Renamed' });
    expect(b.id).toBe(a.id);
    const mine = (await (await request.get('/api/creations?mine=1')).json()).items as { title: string }[];
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('Renamed');
  });

  test('publication toggles are rate limited per creator', async ({ request }) => {
    await newCreator(request);
    const made = await upload(request);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request.patch(`/api/creations/${made.id}/publish`, { data: { isPublished: i % 2 === 0 } });
      statuses.push(res.status());
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    // A different creator is unaffected.
    const other = await pwRequest.newContext({ baseURL: BASE });
    await newCreator(other);
    const theirs = await upload(other);
    expect((await other.patch(`/api/creations/${theirs.id}/publish`, { data: { isPublished: true } })).status()).toBe(200);
    await purgeMine(other);
    await other.dispose();
  });

  test('public list is paginated newest-first', async ({ request }) => {
    await newCreator(request);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await upload(request, { title: `Page ${i}` });
      await request.patch(`/api/creations/${c.id}/publish`, { data: { isPublished: true } });
      ids.push(c.id);
      await new Promise((r) => setTimeout(r, 5));
    }
    const first = await (await request.get('/api/creations?limit=2')).json();
    expect(first.items).toHaveLength(2);
    expect(first.items[0].id).toBe(ids[2]);
    expect(first.nextCursor).toBeTruthy();
    const second = await (await request.get(`/api/creations?limit=2&cursor=${first.nextCursor}`)).json();
    expect(second.items.map((i: { id: string }) => i.id)).not.toContain(ids[2]);
  });
});

test.describe('persistence adapters', () => {
  test('file repository survives a restart and enforces unique handles', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tt-repo-'));
    try {
      const creator: StoredCreator = { id: 'c1', handle: '@keeper', displayName: 'Keeper', avatarUrl: null, createdAt: new Date().toISOString() };
      const record: StoredCreation = {
        id: 'x1', creatorId: 'c1', title: 'Kept', genre: 'Jazz', audioUrl: '/api/creations/x1/audio', waveformJson: null,
        lyrics: '', isPublished: true, remixOfId: null, provenance: 'AI-Generated Material',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), kind: 'music', durationLabel: null,
        vocalArrangement: null, narratorInfo: null, audioKey: 'x1.wav', audioMime: 'audio/wav', audioBytes: 10, clientRef: null,
        contentHash: 'h1', remixPermitted: false, rootId: 'x1', remixDepth: 0, revokedAt: null, revokedBecause: null,
        revocationMode: null, purgeAfter: null, publicKey: null,
      };
      const first = new FileCatalogRepository(dir);
      await first.init();
      await first.createCreator(creator);
      await expect(first.createCreator({ ...creator, id: 'c2' })).rejects.toBeInstanceOf(HandleTakenError);
      await first.createCreation(record);
      await first.saveModeration({ id: 'm1', creationId: 'x1', status: 'approved', flagReason: null, reviewedAt: null });
      await first.close();

      const second = new FileCatalogRepository(dir);
      await second.init();
      expect((await second.getCreatorByHandle('@keeper'))?.id).toBe('c1');
      expect((await second.listPublished({ limit: 5 })).items.map((i) => i.id)).toEqual(['x1']);
      await second.deleteCreation('x1');
      expect((await second.listPublished({ limit: 5 })).items).toHaveLength(0);
      expect(await second.getModeration('x1')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('local object storage round-trips ranges and rejects traversal keys', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tt-obj-'));
    try {
      const storage = new LocalObjectStorage(dir);
      await storage.init();
      await storage.put('abc.wav', Buffer.from('0123456789'), 'audio/wav');
      const obj = await storage.get('abc.wav', { start: 2, end: 5 });
      const chunks: Buffer[] = [];
      for await (const c of obj!.stream) chunks.push(c as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('2345');
      expect(obj!.size).toBe(10);
      expect(await storage.get('missing.wav')).toBeNull();
      await expect(storage.put('../escape.wav', Buffer.from('x'), 'audio/wav')).rejects.toThrow();
      await storage.delete('abc.wav');
      await storage.delete('abc.wav'); // idempotent
      expect(await storage.get('abc.wav')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
