import { test, expect, APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const uniqueHandle = () => `@feed_${Math.random().toString(36).slice(2, 10)}`;

function wavUniqueBuffer(samples = 800): Buffer {
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

async function purge(api: APIRequestContext) {
  const shows = await api.get('/api/shows');
  if (shows.status() === 200) {
    for (const s of (await shows.json()).items as { id: string }[]) await api.delete(`/api/shows/${s.id}`);
  }
  const hooks = await api.get('/api/webhooks');
  if (hooks.status() === 200) {
    for (const w of (await hooks.json()).items as { id: string }[]) await api.delete(`/api/webhooks/${w.id}`);
  }
  const res = await api.get('/api/creations?mine=1&limit=100');
  if (res.status() !== 200) return;
  for (const item of (await res.json()).items as { id: string }[]) await api.delete(`/api/creations/${item.id}`);
}

test.describe('distribution UI: feeds, schedule and webhooks', () => {
  test('a creator builds a show, publishes an episode to a real feed, and registers a webhook', async ({ page }) => {
    test.setTimeout(60000);
    page.setDefaultTimeout(10000);
    page.on('dialog', (d) => void d.accept());
    const handle = uniqueHandle();
    const suffix = Math.random().toString(36).slice(2, 6);
    const episodeTitle = `Feed Episode ${suffix}`;
    const showTitle = `Studio Weekly ${suffix}`;
    await page.addInitScript((h) => localStorage.setItem('tell-them-handle', h), handle);

    await page.goto('/');
    await expect(page.getByTestId('catalog-status')).toHaveAttribute('data-catalog-status', 'online');
    try {
      // Create the podcast server-side first; the library mirrors it back on the next sync.
      await page.getByRole('button', { name: 'My Library', exact: true }).first().click();
      const panel = page.getByTestId('distribution-panel');
      await expect(panel).toBeVisible();
      // The app opens the creator session on its own once the catalog is online.
      await expect(page.getByTestId('shows-section')).toBeVisible();

      const created = await page.request.post('/api/creations', {
        data: {
          title: episodeTitle,
          genre: 'Podcast',
          lyrics: 'A short original conversation about songwriting.',
          provenance: 'AI Multi-Host Podcast',
          kind: 'podcast',
          audioBase64: wavUniqueBuffer().toString('base64'),
        },
      });
      expect(created.status()).toBeLessThan(300);

      await page.reload();
      await page.getByRole('button', { name: 'My Library', exact: true }).first().click();
      await expect(page.getByTestId('shows-section')).toBeVisible();

      await page.getByRole('form', { name: 'Create a show' }).getByLabel('Show title').fill(showTitle);
      await page.getByRole('button', { name: 'Create show' }).click();
      const card = page.getByTestId('show-card');
      await expect(card).toBeVisible();
      const feedUrl = await card.getByTestId('feed-url').inputValue();
      expect(feedUrl).toMatch(/\/feeds\/[a-z0-9-]+\.xml$/);

      // The feed is live but empty until an episode is published.
      const feedPath = new URL(feedUrl).pathname;
      let feed = await page.request.get(feedPath);
      expect(feed.status()).toBe(200);
      expect(await feed.text()).not.toContain(episodeTitle);

      await card.getByRole('button', { name: 'Save weekly schedule' }).click();
      await expect(card.getByTestId('next-slot')).toContainText('Next weekly slot');

      await card.getByLabel('Add podcast from library').selectOption({ label: episodeTitle });
      await card.getByRole('button', { name: 'Add episode' }).click();
      const row = card.getByTestId('episode-row');
      await expect(row).toContainText(episodeTitle);
      await expect(row.getByTestId('episode-state')).toHaveText('draft');

      await row.getByRole('button', { name: 'Publish now' }).click();
      await expect(row.getByTestId('episode-state')).toContainText('published');

      feed = await page.request.get(feedPath);
      const xml = await feed.text();
      expect(xml).toContain(episodeTitle);
      expect(xml).toContain('<enclosure');

      // Webhook: the signing secret is displayed exactly once.
      await page.getByRole('form', { name: 'Add a webhook' }).getByLabel('Endpoint URL').fill('http://localhost:9/hook');
      await page.getByRole('button', { name: 'Add webhook' }).click();
      await expect(page.getByTestId('webhook-secret')).toContainText('whsec_');
      await page.getByRole('button', { name: 'I saved it' }).click();
      await expect(page.getByTestId('webhook-secret')).toHaveCount(0);
      await expect(page.getByTestId('webhook-row')).toHaveCount(1);
      await page.getByTestId('webhook-row').getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByTestId('webhook-row')).toHaveCount(0);
    } finally {
      await purge(page.request);
    }
  });

  test('without a reachable community service the panel explains itself and the library still works', async ({ page }) => {
    await page.route('**/api/session', (route) => route.abort());
    await page.goto('/');
    await page.getByRole('button', { name: 'My Library', exact: true }).first().click();
    await expect(page.getByTestId('distribution-unavailable')).toContainText('not reachable');
    await expect(page.getByRole('heading', { name: 'My saved creations' })).toBeVisible();
  });
});
