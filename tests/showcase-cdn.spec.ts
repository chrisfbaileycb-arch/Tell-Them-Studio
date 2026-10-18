import { test, expect, APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import { startCatalog } from '../src/server/catalog/factory';
import { createCatalogRouter } from '../src/server/routes/catalogRoutes';

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

const uniqueHandle = () => `@show_${Math.random().toString(36).slice(2, 10)}`;

async function purge(api: APIRequestContext) {
  const shows = await api.get('/api/shows');
  if (shows.status() === 200) {
    for (const s of (await shows.json()).items as { id: string }[]) await api.delete(`/api/shows/${s.id}`);
  }
  const res = await api.get('/api/creations?mine=1&limit=100');
  if (res.status() !== 200) return;
  for (const item of (await res.json()).items as { id: string }[]) await api.delete(`/api/creations/${item.id}`);
}

test.describe('Track C: Isolated Showcase Frontend & CDN Delivery', () => {
  test('CDN routing: 302 redirects for public audio, ?direct=1 bypass, range streaming, and purge webhook', async () => {
    // Spin up a mock CDN purge webhook listener
    const purgedKeys: string[] = [];
    const purgeServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { keys: string[] };
          if (Array.isArray(parsed.keys)) purgedKeys.push(...parsed.keys);
        } catch {
          // ignore
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((r) => purgeServer.listen(0, '127.0.0.1', r));
    const purgePort = (purgeServer.address() as { port: number }).port;
    const purgeUrl = `http://127.0.0.1:${purgePort}/purge`;

    // Create an isolated catalog context configured with CDN_BASE_URL and CDN_PURGE_WEBHOOK_URL
    const cdnBaseUrl = 'https://cdn.example.org/audio-assets';
    const catalog = startCatalog({
      CATALOG_DATA_DIR: ':memory:',
      CDN_BASE_URL: cdnBaseUrl,
      CDN_PURGE_WEBHOOK_URL: purgeUrl,
      SESSION_SECRET: 'test-session-secret-at-least-32-chars-long-01234',
    });
    const ctx = await catalog.getContext();

    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.get('/api/health', async (_req, res) => {
      res.json({ status: 'ok', catalog: await catalog.health() });
    });
    const router = createCatalogRouter({
      getContext: async () => ctx,
      allowedOrigins: ['*'],
    });
    app.use(router);

    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const testBase = `http://127.0.0.1:${port}`;

    try {
      // 1. Health advertises CDN capability
      const healthRes = await fetch(`${testBase}/api/health`);
      expect(healthRes.status).toBe(200);
      const health = await healthRes.json();
      expect(health.catalog.cdn).toEqual({ enabled: true, baseUrl: cdnBaseUrl });

      // 2. Create and publish a creation
      const sessionRes = await fetch(`${testBase}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: '@cdn_creator' }),
      });
      const cookie = sessionRes.headers.get('set-cookie') || '';

      const audioBuf = wavUnique(400);
      const createRes = await fetch(`${testBase}/api/creations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          title: 'CDN Test Audio',
          genre: 'Rock Band',
          lyrics: 'Testing CDN delivery',
          provenance: 'AI-Generated Material',
          kind: 'music',
          audioBase64: audioBuf.toString('base64'),
        }),
      });
      expect(createRes.status).toBe(201);
      const { creation } = await createRes.json();

      // Initially private: 404 for unauthenticated callers, direct 200 for owner
      const privAnon = await fetch(`${testBase}/api/creations/${creation.id}/audio`, { redirect: 'manual' });
      expect(privAnon.status).toBe(404);

      const privOwner = await fetch(`${testBase}/api/creations/${creation.id}/audio`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(privOwner.status).toBe(200);

      // Publish the creation
      const pubRes = await fetch(`${testBase}/api/creations/${creation.id}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ isPublished: true }),
      });
      expect(pubRes.status).toBe(200);

      // 3. Public access redirects (302) to the CDN URL with Cache-Control: public, max-age=3600
      const cdnRedirect = await fetch(`${testBase}/api/creations/${creation.id}/audio`, { redirect: 'manual' });
      expect(cdnRedirect.status).toBe(302);
      expect(cdnRedirect.headers.get('location')).toMatch(new RegExp(`^${cdnBaseUrl}/[a-f0-9-]+\\.wav$`));
      expect(cdnRedirect.headers.get('cache-control')).toBe('public, max-age=3600');

      // 4. ?direct=1 query parameter bypasses CDN redirect and streams directly with range support
      const directStream = await fetch(`${testBase}/api/creations/${creation.id}/audio?direct=1`, {
        headers: { Range: 'bytes=0-99' },
      });
      expect(directStream.status).toBe(206);
      expect(directStream.headers.get('content-range')).toMatch(/^bytes 0-99\/\d+$/);
      expect(Number(directStream.headers.get('content-length'))).toBe(100);

      // 5. Delete triggers CDN purge webhook
      const delRes = await fetch(`${testBase}/api/creations/${creation.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      });
      expect(delRes.status).toBe(204);

      // Wait briefly for the best-effort purge notification
      await new Promise((r) => setTimeout(r, 200));
      expect(purgedKeys.length).toBeGreaterThan(0);
      expect(purgedKeys[0]).toMatch(/\.wav$/);
    } finally {
      server.close();
      purgeServer.close();
      ctx.worker.stop();
    }
  });

  test('standalone showcase app renders at /showcase, plays audio, supports praise, and handles offline', async ({
    page,
    playwright,
  }) => {
    const creator = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
    const cHandle = uniqueHandle();
    const suffix = Math.random().toString(36).slice(2, 6);
    const trackTitle = `Showcase Track ${suffix}`;

    try {
      // Connect and publish a creation to the live catalog
      expect((await creator.post('/api/session', { data: { handle: cHandle } })).status()).toBe(201);
      const created = await creator.post('/api/creations', {
        data: {
          title: trackTitle,
          genre: 'Pop Band',
          lyrics: 'An upbeat original showcase test song.',
          provenance: 'AI-Generated Material',
          kind: 'music',
          audioBase64: wavUnique(500).toString('base64'),
        },
      });
      expect(created.status()).toBe(201);
      const { creation } = await created.json();
      expect((await creator.patch(`/api/creations/${creation.id}/publish`, { data: { isPublished: true } })).status()).toBe(200);

      // Also create a podcast show with feed
      const showRes = await creator.post('/api/shows', {
        data: {
          title: `Showcase Radio ${suffix}`,
          description: 'A public podcast series',
        },
      });
      expect(showRes.status()).toBe(201);

      // 1. Visit /showcase directly
      await page.goto('/showcase');
      const app = page.getByTestId('showcase-app');
      await expect(app).toBeVisible();

      // Card is displayed with metadata
      const card = page.locator('article').filter({ has: page.getByRole('heading', { name: trackTitle }) });
      await expect(card).toBeVisible();
      await expect(card).toContainText(cHandle);

      // Report button is present
      await expect(card.getByRole('button', { name: `Report ${trackTitle}` })).toBeVisible();

      // 2. Audio playback sets active player
      await card.getByTestId('card-play-button').click();
      const player = page.getByTestId('showcase-player');
      await expect(player).toBeVisible();
      await expect(player.getByTestId('player-title')).toHaveText(trackTitle);

      // 3. Praise can be submitted from the isolated showcase
      await card.getByRole('button', { name: 'Praise', exact: true }).click();
      await card.getByPlaceholder('What did you love about this track?').fill('Incredible hooks!');
      await card.getByRole('button', { name: 'Send' }).click();
      await expect(card.getByTestId('praise-badges')).toContainText('Radio Ready');

      // 4. RSS Feeds tab displays the public podcast feed
      await page.getByRole('tab', { name: /RSS Feeds/ }).click();
      const showCard = page.locator('div').filter({ has: page.getByRole('heading', { name: `Showcase Radio ${suffix}` }) });
      await expect(showCard.first()).toBeVisible();

      // 5. Open studio link is present
      await expect(page.getByTestId('back-to-studio')).toHaveAttribute('href', '/');

      // 6. Isolated offline mode handling: when backend is unreachable, explains itself gracefully
      const offlinePage = await page.context().newPage();
      await offlinePage.route('**/api/creations*', (route) => route.abort());
      await offlinePage.goto('/showcase');
      await expect(offlinePage.getByTestId('showcase-offline')).toBeVisible();
      await expect(offlinePage.getByTestId('showcase-offline')).toContainText('Catalog Service Unavailable');
      await offlinePage.close();
    } finally {
      await purge(creator);
      await creator.dispose();
    }
  });

  test('navbar includes Showcase link pointing to /showcase', async ({ page }) => {
    await page.goto('/');
    const showcaseLink = page.getByTestId('nav-open-showcase');
    await expect(showcaseLink).toBeVisible();
    await expect(showcaseLink).toHaveAttribute('href', '/showcase');
  });
});
