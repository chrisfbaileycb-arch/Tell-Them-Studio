import { test, expect, APIRequestContext } from '@playwright/test';
import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildFeedXml, itunesDuration, xmlEscape } from '../src/server/distribution/rss';
import { isValidTimezone, nextSlotAfter, zonedTimeToUtcMs } from '../src/server/distribution/schedule';
import { guardedLookup, isPrivateAddress, postJson, signPayload, validateWebhookUrl } from '../src/server/distribution/webhooks';
import { openSecret, sealSecret } from '../src/server/secrets';

const BASE = 'http://localhost:3000';
const ADMIN = { Authorization: 'Bearer test-admin-token-0123456789' };
const handle = () => `@dist_${Math.random().toString(36).slice(2, 10)}`;

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

interface Received {
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Local webhook receiver. `respond` chooses the status per request (to exercise retries). */
async function receiver(respond: (n: number) => number = () => 200) {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.statusCode = respond(received.length);
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/hook`, received, close: () => new Promise<void>((r) => server.close(() => r())) };
}

class Creator {
  constructor(
    readonly api: APIRequestContext,
    readonly handle: string
  ) {}
  async createPodcast(title: string, extra: Record<string, unknown> = {}) {
    const res = await this.api.post('/api/creations', {
      data: {
        title,
        genre: 'Podcast',
        lyrics: '[Alex]\nWelcome back.',
        provenance: 'AI Multi-Host Podcast',
        kind: 'podcast',
        durationLabel: '12:05',
        audioBase64: wavUnique().toString('base64'),
        ...extra,
      },
    });
    expect(res.status()).toBe(201);
    return (await res.json()).creation as Record<string, any>;
  }
  mine = async () => (await (await this.api.get('/api/creations?mine=1')).json()).items as Record<string, any>[];
}

test.describe('distribution: feeds, scheduling, webhooks, praise', () => {
  const contexts: APIRequestContext[] = [];
  const creators: Creator[] = [];
  const closers: Array<() => Promise<void>> = [];

  async function creator(playwright: any): Promise<Creator> {
    const api = await playwright.request.newContext({ baseURL: BASE });
    contexts.push(api);
    const c = new Creator(api, handle());
    expect((await api.post('/api/session', { data: { handle: c.handle } })).status()).toBe(201);
    creators.push(c);
    return c;
  }
  const anon = async (playwright: any) => {
    const api = await playwright.request.newContext({ baseURL: BASE });
    contexts.push(api);
    return api;
  };

  test.afterEach(async () => {
    for (const c of creators) {
      const shows = ((await (await c.api.get('/api/shows')).json().catch(() => ({ items: [] }))).items ?? []) as { id: string }[];
      for (const s of shows) await c.api.delete(`/api/shows/${s.id}`).catch(() => undefined);
      const hooks = ((await (await c.api.get('/api/webhooks')).json().catch(() => ({ items: [] }))).items ?? []) as { id: string }[];
      for (const w of hooks) await c.api.delete(`/api/webhooks/${w.id}`).catch(() => undefined);
      for (const item of await c.mine().catch(() => [])) await c.api.delete(`/api/creations/${item.id}`).catch(() => undefined);
    }
    creators.length = 0;
    for (const close of closers) await close().catch(() => undefined);
    closers.length = 0;
    await Promise.all(contexts.map((c) => c.dispose()));
    contexts.length = 0;
  });

  // ------------------------------------------------------------------ pure units

  test('SSRF guard: private, loopback, link-local and mapped addresses are refused at every layer', async () => {
    for (const bad of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', 'not-an-ip']) {
      expect(isPrivateAddress(bad), bad).toBe(true);
    }
    for (const good of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) expect(isPrivateAddress(good), good).toBe(false);

    for (const url of ['http://example.com/h', 'https://127.0.0.1/h', 'https://localhost/h', 'https://app.localhost/h', 'https://[::1]/h', 'https://user:pw@example.com/h', 'https://169.254.169.254/latest/meta-data', 'ftp://example.com/x', 'javascript:alert(1)']) {
      expect(validateWebhookUrl(url, false).ok, url).toBe(false);
    }
    expect(validateWebhookUrl('https://hooks.example.com/tt', false).ok).toBe(true);

    // The connect-time check also rejects hostnames that merely *resolve* to a private address.
    await expect(
      new Promise((resolve, reject) => guardedLookup(false)('localhost', {} as any, (err: Error | null) => (err ? reject(err) : resolve(true))))
    ).rejects.toThrow(/private or reserved/);
    await expect(postJson('http://127.0.0.1:9/h', {}, '{}', { allowPrivate: false, timeoutMs: 1000 })).rejects.toThrow(/https/);
  });

  test('signatures and sealed secrets round-trip; tampering is detectable', async () => {
    const master = randomBytes(48);
    const sealed = sealSecret(master, 'whsec_example');
    expect(sealed).not.toContain('whsec_example');
    expect(openSecret(master, sealed)).toBe('whsec_example');
    expect(() => openSecret(randomBytes(48), sealed)).toThrow();
    const sig = signPayload('k', '1700000000', '{"a":1}');
    expect(sig).toBe(`sha256=${createHmac('sha256', 'k').update('1700000000.{"a":1}').digest('hex')}`);
    expect(signPayload('k', '1700000000', '{"a":2}')).not.toBe(sig);
  });

  test('weekly slots honour the show time zone across DST changes', async () => {
    expect(isValidTimezone('America/Denver')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    // Friday 09:30 in Denver: MDT (UTC-6) in summer, MST (UTC-7) in winter.
    const rule = { dayOfWeek: 5, timeOfDay: '09:30', timezone: 'America/Denver' };
    const summer = nextSlotAfter(rule, Date.parse('2026-07-01T00:00:00Z'));
    expect(summer.toISOString()).toBe('2026-07-03T15:30:00.000Z');
    const winter = nextSlotAfter(rule, Date.parse('2026-12-01T00:00:00Z'));
    expect(winter.toISOString()).toBe('2026-12-04T16:30:00.000Z');
    // Strictly after: asking at the slot itself yields the following week.
    expect(nextSlotAfter(rule, summer.getTime()).toISOString()).toBe('2026-07-10T15:30:00.000Z');
    // Across the autumn change the wall-clock time stays 09:30 local.
    const a = nextSlotAfter(rule, Date.parse('2026-10-30T20:00:00Z')); // Fri 30 Oct 14:00 MDT -> next Fri 6 Nov (MDT)
    const b = nextSlotAfter(rule, Date.parse('2026-11-06T20:00:00Z')); // after DST ends on 1 Nov
    expect(a.toISOString()).toBe('2026-11-06T16:30:00.000Z');
    expect(b.toISOString()).toBe('2026-11-13T16:30:00.000Z');
    expect(zonedTimeToUtcMs(2026, 3, 8, 2, 30, 'America/Denver')).toBeGreaterThan(0); // nonexistent time does not throw
    // A zone ahead of UTC picks the right local weekday.
    expect(nextSlotAfter({ dayOfWeek: 1, timeOfDay: '00:15', timezone: 'Pacific/Auckland' }, Date.parse('2026-07-01T00:00:00Z')).toISOString()).toBe('2026-07-05T12:15:00.000Z');
  });

  test('feed XML is escaped, namespaced, and carries enclosure length and type', async () => {
    expect(xmlEscape('Tom & Jerry <Live> "x" \u0001')).toBe('Tom &amp; Jerry &lt;Live&gt; &quot;x&quot; ');
    expect(itunesDuration('12:05')).toBe('00:12:05');
    expect(itunesDuration('bogus')).toBeUndefined();
    const xml = buildFeedXml(
      { id: 's', title: 'A & B', description: 'd', author: 'me', language: 'en', category: 'Arts', explicit: false, createdAt: '', updatedAt: '', creatorHandle: '@x', feedUrl: 'https://x/f.xml', publishedEpisodes: 1 },
      [{ guid: 's:1', title: '<t>', description: 'n', pubDate: new Date('2026-01-02T03:04:05Z'), audioUrl: 'https://x/a?b=1&c=2', audioBytes: 1234, audioMime: 'audio/wav', durationLabel: '1:30', episodeNumber: 3 }],
      { feedUrl: 'https://x/f.xml', siteUrl: 'https://x' }
    );
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(xml).toContain('<title>A &amp; B</title>');
    expect(xml).toContain('<title>&lt;t&gt;</title>');
    expect(xml).toContain('<enclosure url="https://x/a?b=1&amp;c=2" length="1234" type="audio/wav" />');
    expect(xml).toContain('<itunes:duration>00:01:30</itunes:duration>');
    expect(xml).toContain('<pubDate>Fri, 02 Jan 2026 03:04:05 GMT</pubDate>');
  });

  // ------------------------------------------------------------------- HTTP: feeds

  test('shows publish a real RSS feed with validators, conditional GETs and only visible episodes', async ({ playwright }) => {
    const owner = await creator(playwright);
    const visitor = await anon(playwright);
    const stranger = await creator(playwright);

    expect((await visitor.post('/api/shows', { data: { title: 'Nope' } })).status()).toBe(401);
    expect((await owner.api.post('/api/shows', { data: { title: '' } })).status()).toBe(400);
    expect((await owner.api.post('/api/shows', { data: { title: 'Call me at 555-123-4567 or a@b.com' } })).status()).toBe(422);

    const created = await owner.api.post('/api/shows', { data: { title: 'Tom & Jerry <Live>', description: 'A & B talk', explicit: false } });
    expect(created.status()).toBe(201);
    const { show } = await created.json();
    expect(show.id).toMatch(/^tom-jerry-live/);
    expect(show.feedUrl).toBe(`http://localhost:3000/feeds/${show.id}.xml`);
    expect(JSON.stringify(show)).not.toContain('creatorId');

    const ep1 = await owner.createPodcast('Episode One');
    const ep2 = await owner.createPodcast('Episode Two');
    const musicTrack = (await (await owner.api.post('/api/creations', { data: { title: 'A song', genre: 'Pop', provenance: 'AI-Generated Material', audioBase64: wavUnique().toString('base64') } })).json()).creation;

    // Only podcast creations owned by the show's creator can be attached.
    expect((await owner.api.put(`/api/shows/${show.id}/episodes/${musicTrack.id}`, { data: {} })).status()).toBe(400);
    expect((await stranger.api.put(`/api/shows/${show.id}/episodes/${ep1.id}`, { data: {} })).status()).toBe(403);
    expect((await owner.api.put(`/api/shows/${show.id}/episodes/${ep1.id}`, { data: {} })).status()).toBe(201);
    expect((await owner.api.put(`/api/shows/${show.id}/episodes/${ep2.id}`, { data: { episodeNumber: 7 } })).status()).toBe(201);

    // Drafts are invisible: unknown slugs and empty feeds are valid, but list nothing.
    expect((await visitor.get('/feeds/does-not-exist.xml')).status()).toBe(404);
    let feed = await visitor.get(`/feeds/${show.id}.xml`);
    expect(feed.status()).toBe(200);
    expect(feed.headers()['content-type']).toContain('application/rss+xml');
    expect(feed.headers()['cache-control']).toBe('public, max-age=300');
    expect(await feed.text()).not.toContain('<item>');

    const published = await owner.api.post(`/api/shows/${show.id}/episodes/${ep1.id}/publish`);
    expect(published.status()).toBe(200);
    expect((await published.json()).episode.publishState).toBe('published');

    feed = await visitor.get(`/feeds/${show.id}.xml`);
    const xml = await feed.text();
    expect(xml).toContain('<title>Tom &amp; Jerry &lt;Live&gt;</title>');
    expect(xml).toContain('xmlns:itunes=');
    expect(xml.match(/<item>/g)).toHaveLength(1);
    expect(xml).toContain('<title>Episode One</title>');
    expect(xml).not.toContain('Episode Two');
    expect(xml).toContain(`<enclosure url="http://localhost:3000/api/creations/${ep1.id}/audio"`);
    expect(xml).toMatch(/length="\d+" type="audio\/wav"/);
    expect(xml).toContain('<itunes:duration>00:12:05</itunes:duration>');
    expect(xml).toContain('Content origin: AI Multi-Host Podcast.');
    expect(xml).toContain('<itunes:episode>1</itunes:episode>');

    // The enclosure really streams the advertised bytes (with the stable API URL).
    const audio = await visitor.get(`/api/creations/${ep1.id}/audio`);
    expect(audio.status()).toBe(200);
    const declared = Number(/length="(\d+)"/.exec(xml)?.[1]);
    expect((await audio.body()).length).toBe(declared);

    // Conditional requests.
    const etag = feed.headers()['etag'];
    const lastModified = feed.headers()['last-modified'];
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect((await visitor.get(`/feeds/${show.id}.xml`, { headers: { 'If-None-Match': etag } })).status()).toBe(304);
    expect((await visitor.get(`/feeds/${show.id}.xml`, { headers: { 'If-Modified-Since': lastModified } })).status()).toBe(304);
    expect((await visitor.get(`/feeds/${show.id}.xml`, { headers: { 'If-None-Match': '"other"' } })).status()).toBe(200);

    // Revocation removes the episode from the feed at once, and the ETag changes.
    expect((await owner.api.post(`/api/creations/${ep1.id}/revoke-consent`, { data: { mode: 'soft' } })).status()).toBe(200);
    feed = await visitor.get(`/feeds/${show.id}.xml`, { headers: { 'If-None-Match': etag, 'If-Modified-Since': lastModified } });
    expect(feed.status()).toBe(200);
    const after = await feed.text();
    expect(after).not.toContain('<item>');
    expect(feed.headers()['etag']).not.toBe(etag);

    // Deleting the show takes the feed down.
    expect((await owner.api.delete(`/api/shows/${show.id}`)).status()).toBe(204);
    expect((await visitor.get(`/feeds/${show.id}.xml`)).status()).toBe(404);
  });

  // ------------------------------------------------------------ HTTP: scheduling

  test('scheduled episodes publish at their due time through the worker and respect moderation', async ({ playwright }) => {
    const owner = await creator(playwright);
    const visitor = await anon(playwright);
    const admin = await anon(playwright);
    const { show } = await (await owner.api.post('/api/shows', { data: { title: 'Scheduled Show' } })).json();
    const a = await owner.createPodcast('Due Episode');
    const b = await owner.createPodcast('Held Episode');
    for (const ep of [a, b]) expect((await owner.api.put(`/api/shows/${show.id}/episodes/${ep.id}`, { data: {} })).status()).toBe(201);

    // Validation.
    expect((await owner.api.post(`/api/shows/${show.id}/episodes/${a.id}/schedule`, { data: { scheduledFor: 'tomorrow-ish' } })).status()).toBe(400);
    expect((await owner.api.post(`/api/shows/${show.id}/episodes/${a.id}/schedule`, { data: { scheduledFor: '2001-01-01T00:00:00Z' } })).status()).toBe(400);
    expect((await owner.api.post(`/api/shows/${show.id}/episodes/${a.id}/schedule`, { data: { useSchedule: true } })).status()).toBe(409);

    // A moderator removes episode b before its slot arrives; it must not go live on schedule.
    expect((await admin.post(`/api/admin/creations/${b.id}/moderation`, { headers: ADMIN, data: { action: 'reject', reason: 'policy' } })).status()).toBe(200);

    const soon = new Date(Date.now() + 1500).toISOString();
    for (const ep of [a, b]) {
      const res = await owner.api.post(`/api/shows/${show.id}/episodes/${ep.id}/schedule`, { data: { scheduledFor: soon } });
      expect(res.status()).toBe(200);
      expect((await res.json()).episode.publishState).toBe('scheduled');
    }
    expect((await visitor.get(`/feeds/${show.id}.xml`).then((r) => r.text()))).not.toContain('<item>');

    await expect
      .poll(async () => ((await (await owner.api.get(`/api/shows/${show.id}/episodes`)).json()).items as any[]).find((e) => e.creationId === a.id)?.publishState, { timeout: 15000 })
      .toBe('published');
    const items = (await (await owner.api.get(`/api/shows/${show.id}/episodes`)).json()).items as any[];
    const held = items.find((e) => e.creationId === b.id);
    expect(held.publishState).toBe('draft');
    expect(held.holdReason).toContain('policy');
    const xml = await (await visitor.get(`/feeds/${show.id}.xml`)).text();
    expect(xml).toContain('Due Episode');
    expect(xml).not.toContain('Held Episode');

    // Unscheduling cancels a pending job (the stale job becomes a no-op).
    const c = await owner.createPodcast('Cancelled Episode');
    expect((await owner.api.put(`/api/shows/${show.id}/episodes/${c.id}`, { data: {} })).status()).toBe(201);
    const near = new Date(Date.now() + 1200).toISOString();
    expect((await owner.api.post(`/api/shows/${show.id}/episodes/${c.id}/schedule`, { data: { scheduledFor: near } })).status()).toBe(200);
    expect((await owner.api.delete(`/api/shows/${show.id}/episodes/${c.id}/schedule`)).status()).toBe(204);
    await new Promise((r) => setTimeout(r, 2500));
    const afterCancel = ((await (await owner.api.get(`/api/shows/${show.id}/episodes`)).json()).items as any[]).find((e) => e.creationId === c.id);
    expect(afterCancel.publishState).toBe('draft');
  });

  test('weekly schedules persist per show and assign successive free slots', async ({ playwright }) => {
    const owner = await creator(playwright);
    const stranger = await creator(playwright);
    const { show } = await (await owner.api.post('/api/shows', { data: { title: 'Weekly Show' } })).json();

    const empty = await (await owner.api.get(`/api/shows/${show.id}/schedule`)).json();
    expect(empty).toEqual({ schedule: null, nextRunAt: null });
    for (const bad of [{ dayOfWeek: 9, timeOfDay: '09:00', timezone: 'UTC' }, { dayOfWeek: 1, timeOfDay: '25:00', timezone: 'UTC' }, { dayOfWeek: 1, timeOfDay: '09:00', timezone: 'Nowhere/Land' }]) {
      expect((await owner.api.put(`/api/shows/${show.id}/schedule`, { data: bad })).status()).toBe(400);
    }
    expect((await stranger.api.put(`/api/shows/${show.id}/schedule`, { data: { dayOfWeek: 1, timeOfDay: '09:00', timezone: 'UTC' } })).status()).toBe(403);

    const saved = await (await owner.api.put(`/api/shows/${show.id}/schedule`, { data: { dayOfWeek: 5, timeOfDay: '09:30', timezone: 'America/Denver' } })).json();
    expect(saved.schedule.active).toBe(true);
    const first = new Date(saved.nextRunAt);
    expect(first.getTime()).toBeGreaterThan(Date.now());
    expect(new Date(first.toLocaleString('en-US', { timeZone: 'America/Denver' })).getDay()).toBe(5);

    const eps = [await owner.createPodcast('W1'), await owner.createPodcast('W2')];
    const slots: number[] = [];
    for (const ep of eps) {
      expect((await owner.api.put(`/api/shows/${show.id}/episodes/${ep.id}`, { data: {} })).status()).toBe(201);
      const res = await owner.api.post(`/api/shows/${show.id}/episodes/${ep.id}/schedule`, { data: { useSchedule: true } });
      expect(res.status()).toBe(200);
      slots.push(Date.parse((await res.json()).episode.scheduledFor));
    }
    expect(slots[0]).toBe(first.getTime());
    // One week apart (an hour of slack for a DST boundary).
    expect(Math.abs(slots[1] - slots[0] - 7 * 24 * 3600 * 1000)).toBeLessThanOrEqual(3600 * 1000);
    expect((await owner.api.put(`/api/shows/${show.id}/schedule`, { data: { dayOfWeek: 5, timeOfDay: '09:30', timezone: 'America/Denver', active: false } })).status()).toBe(200);
    expect((await (await owner.api.get(`/api/shows/${show.id}/schedule`)).json()).nextRunAt).toBeNull();
  });

  // ------------------------------------------------------------------- webhooks

  test('outbound webhooks: signed deliveries, secret shown once, ownership, retries and dead-lettering', async ({ playwright }) => {
    const owner = await creator(playwright);
    const stranger = await creator(playwright);
    const hook = await receiver();
    closers.push(hook.close);

    expect((await owner.api.post('/api/webhooks', { data: { url: 'ftp://x.example/h' } })).status()).toBe(400);
    expect((await owner.api.post('/api/webhooks', { data: { url: hook.url, events: ['bogus'] } })).status()).toBe(400);
    const created = await owner.api.post('/api/webhooks', { data: { url: hook.url, events: ['creation.published', 'creation.revoked'] } });
    expect(created.status()).toBe(201);
    const { endpoint, secret } = await created.json();
    expect(secret).toMatch(/^whsec_/);
    expect(JSON.stringify(await (await owner.api.get('/api/webhooks')).json())).not.toContain(secret);
    expect(JSON.stringify(endpoint)).not.toContain('secretSealed');

    // Other creators cannot see, test, change or delete it.
    for (const call of [
      () => stranger.api.post(`/api/webhooks/${endpoint.id}/test`),
      () => stranger.api.get(`/api/webhooks/${endpoint.id}/deliveries`),
      () => stranger.api.patch(`/api/webhooks/${endpoint.id}`, { data: { active: false } }),
      () => stranger.api.delete(`/api/webhooks/${endpoint.id}`),
    ]) {
      expect((await call()).status()).toBe(404);
    }

    // Test ping: signed with the secret, fresh timestamp, delivery recorded as delivered.
    const ping = await owner.api.post(`/api/webhooks/${endpoint.id}/test`);
    expect(ping.status()).toBe(202);
    await expect.poll(() => hook.received.length, { timeout: 10000 }).toBe(1);
    const req = hook.received[0];
    expect(req.headers['x-tellthem-event']).toBe('ping');
    const ts = String(req.headers['x-tellthem-timestamp']);
    expect(Math.abs(Date.now() / 1000 - Number(ts))).toBeLessThan(60);
    expect(req.headers['x-tellthem-signature']).toBe(signPayload(secret, ts, req.body));
    expect(JSON.parse(req.body).id).toBe(req.headers['x-tellthem-delivery']);

    // A real event: publishing fires creation.published (but not unsubscribed events).
    const item = await owner.createPodcast('Evented');
    expect((await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: true } })).status()).toBe(200);
    await expect.poll(() => hook.received.length, { timeout: 10000 }).toBe(2);
    const evt = JSON.parse(hook.received[1].body);
    expect(evt.event).toBe('creation.published');
    expect(evt.data.creation).toEqual(expect.objectContaining({ id: item.id, title: 'Evented', creatorHandle: owner.handle }));
    expect(JSON.stringify(evt)).not.toContain('creatorId');
    expect((await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: false } })).status()).toBe(200);
    await new Promise((r) => setTimeout(r, 700));
    expect(hook.received).toHaveLength(2); // creation.unpublished is not subscribed

    await expect
      .poll(async () => ((await (await owner.api.get(`/api/webhooks/${endpoint.id}/deliveries`)).json()).items as any[]).map((d) => d.status).sort(), { timeout: 10000 })
      .toEqual(['delivered', 'delivered']);

    // Deliveries to a flaky receiver are retried with backoff until they succeed.
    const flaky = await receiver((n) => (n < 3 ? 500 : 200));
    closers.push(flaky.close);
    const second = await (await owner.api.post('/api/webhooks', { data: { url: flaky.url } })).json();
    expect((await owner.api.post(`/api/webhooks/${second.endpoint.id}/test`)).status()).toBe(202);
    await expect.poll(() => flaky.received.length, { timeout: 15000 }).toBe(3);
    await expect
      .poll(async () => ((await (await owner.api.get(`/api/webhooks/${second.endpoint.id}/deliveries`)).json()).items as any[])[0]?.status, { timeout: 10000 })
      .toBe('delivered');
    const d = ((await (await owner.api.get(`/api/webhooks/${second.endpoint.id}/deliveries`)).json()).items as any[])[0];
    expect(d.attempts).toBe(3);
    expect(d.lastStatusCode).toBe(200);

    // A permanently failing receiver is dead-lettered after the attempt cap (3 in tests).
    const down = await receiver(() => 500);
    closers.push(down.close);
    const third = await (await owner.api.post('/api/webhooks', { data: { url: down.url } })).json();
    expect((await owner.api.post(`/api/webhooks/${third.endpoint.id}/test`)).status()).toBe(202);
    await expect
      .poll(async () => ((await (await owner.api.get(`/api/webhooks/${third.endpoint.id}/deliveries`)).json()).items as any[])[0]?.status, { timeout: 15000 })
      .toBe('dead');
    expect(down.received).toHaveLength(3);
    const dead = ((await (await owner.api.get(`/api/webhooks/${third.endpoint.id}/deliveries`)).json()).items as any[])[0];
    expect(dead).toEqual(expect.objectContaining({ attempts: 3, lastStatusCode: 500 }));

    // Deleting the endpoint stops deliveries.
    expect((await owner.api.delete(`/api/webhooks/${endpoint.id}`)).status()).toBe(204);
    expect((await owner.api.get(`/api/webhooks/${endpoint.id}/deliveries`)).status()).toBe(404);
  });

  test('moderation changes are announced: revoke and moderator removal reach subscribed webhooks', async ({ playwright }) => {
    const owner = await creator(playwright);
    const admin = await anon(playwright);
    const hook = await receiver();
    closers.push(hook.close);
    await owner.api.post('/api/webhooks', { data: { url: hook.url, events: ['creation.revoked', 'creation.unpublished'] } });
    const item = await owner.createPodcast('Announced');
    await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: true } });
    expect((await admin.post(`/api/admin/creations/${item.id}/moderation`, { headers: ADMIN, data: { action: 'reject', reason: 'policy' } })).status()).toBe(200);
    await expect.poll(() => hook.received.map((r) => JSON.parse(r.body).event), { timeout: 10000 }).toEqual(['creation.unpublished']);
    expect((await admin.post(`/api/admin/creations/${item.id}/moderation`, { headers: ADMIN, data: { action: 'revoke', mode: 'soft' } })).status()).toBe(200);
    await expect.poll(() => hook.received.map((r) => JSON.parse(r.body).event), { timeout: 10000 }).toEqual(['creation.unpublished', 'creation.revoked']);
  });

  // -------------------------------------------------------------------- praise

  test('inbound praise: HMAC + timestamp window, idempotency, safety, ownership; native praise shares the table', async ({ playwright }) => {
    const owner = await creator(playwright);
    const fan = await creator(playwright);
    const visitor = await anon(playwright);
    const item = await owner.createPodcast('Praised Show');
    expect((await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: true } })).status()).toBe(200);
    const mine = await creator(playwright);
    const other = await mine.createPodcast('Not Yours');
    await mine.api.patch(`/api/creations/${other.id}/publish`, { data: { isPublished: true } });

    expect((await visitor.post('/api/inbound-sources', { data: { label: 'x' } })).status()).toBe(401);
    expect((await owner.api.post('/api/inbound-sources', { data: { label: '' } })).status()).toBe(400);
    const made = await owner.api.post('/api/inbound-sources', { data: { label: 'Community Discord' } });
    expect(made.status()).toBe(201);
    const { source, secret, url } = await made.json();
    expect(secret).toMatch(/^insec_/);
    expect(url).toBe(`http://localhost:3000/api/inbound/praise/${source.id}`);
    expect(JSON.stringify(await (await owner.api.get('/api/inbound-sources')).json())).not.toContain(secret);

    const send = (payload: Record<string, unknown>, opts: { secret?: string; ts?: number; tamper?: boolean } = {}) => {
      const body = JSON.stringify(payload);
      const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
      return visitor.post(`/api/inbound/praise/${source.id}`, {
        headers: {
          'content-type': 'application/json',
          'x-tellthem-timestamp': ts,
          'x-tellthem-signature': signPayload(opts.secret ?? secret, ts, opts.tamper ? body + ' ' : body),
        },
        data: body,
      });
    };
    const good = { externalId: 'msg-1', creationId: item.id, handle: '@fan_one', badge: 'Love Your Voice', message: 'Your voice made my whole morning.' };

    expect((await send(good, { secret: 'insec_wrong' })).status()).toBe(401);
    expect((await send(good, { tamper: true })).status()).toBe(401);
    expect((await send(good, { ts: Math.floor(Date.now() / 1000) - 3600 })).status()).toBe(401); // replay outside the window
    expect((await visitor.post(`/api/inbound/praise/${source.id}`, { data: good })).status()).toBe(401); // unsigned
    expect((await visitor.post('/api/inbound/praise/not-a-source', { data: good })).status()).toBe(401);

    const ok = await send(good);
    expect(ok.status()).toBe(201);
    expect((await ok.json()).praise).toEqual(expect.objectContaining({ handle: '@fan_one', badge: 'Love Your Voice', source: source.id }));
    const dup = await send(good); // identical re-delivery
    expect(dup.status()).toBe(200);
    expect((await dup.json()).duplicate).toBe(true);

    expect((await send({ ...good, externalId: 'msg-2', badge: 'Made Up' })).status()).toBe(400);
    expect((await send({ ...good, externalId: 'msg-3', message: 'x'.repeat(281) })).status()).toBe(400);
    expect((await send({ ...good, externalId: '' })).status()).toBe(400);
    const unsafe = await send({ ...good, externalId: 'msg-4', message: 'Great! Email me at someone@example.com' });
    expect(unsafe.status()).toBe(422);
    expect((await send({ ...good, externalId: 'msg-4', message: 'Perfectly kind now' })).status()).toBe(200); // same id stays rejected (idempotent)
    // A source can only praise its own creator's public work.
    expect((await send({ ...good, externalId: 'msg-5', creationId: other.id })).status()).toBe(404);

    // Native, session-authenticated praise lands in the same public list.
    expect((await visitor.post(`/api/creations/${item.id}/praise`, { data: { badge: 'Radio Ready', message: 'Radio ready!' } })).status()).toBe(401);
    expect((await owner.api.post(`/api/creations/${item.id}/praise`, { data: { badge: 'Radio Ready', message: 'me' } })).status()).toBe(400);
    expect((await fan.api.post(`/api/creations/${item.id}/praise`, { data: { badge: 'Radio Ready', message: 'Call 555-123-4567' } })).status()).toBe(422);
    expect((await fan.api.post(`/api/creations/${item.id}/praise`, { data: { badge: 'Radio Ready', message: 'Radio ready!' } })).status()).toBe(201);

    const list = (await (await visitor.get(`/api/creations/${item.id}/praise`)).json()).items as any[];
    expect(list.map((p) => p.message).sort()).toEqual(['Radio ready!', 'Your voice made my whole morning.']);
    expect(list.map((p) => p.handle).sort()).toEqual([fan.handle, '@fan_one'].sort());
    expect(JSON.stringify(list)).not.toContain('someone@example.com');

    // Praise is only listed (and accepted) for publicly visible work.
    await owner.api.patch(`/api/creations/${item.id}/publish`, { data: { isPublished: false } });
    expect((await visitor.get(`/api/creations/${item.id}/praise`)).status()).toBe(404);
    expect((await send({ ...good, externalId: 'msg-6' })).status()).toBe(404);

    expect((await owner.api.delete(`/api/inbound-sources/${source.id}`)).status()).toBe(204);
    expect((await send({ ...good, externalId: 'msg-7' })).status()).toBe(401);
  });

  test('health reports distribution capabilities', async ({ request }) => {
    const body = await (await request.get('/api/health')).json();
    expect(body.catalog.distribution).toEqual({ feeds: true, webhooks: { allowPrivateTargets: true } });
  });
});
