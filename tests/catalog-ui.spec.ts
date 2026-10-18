import { test, expect, Page, APIRequestContext } from '@playwright/test';

const uniqueHandle = () => `@ui_${Math.random().toString(36).slice(2, 10)}`;

function wavBase64(samples = 800): string {
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
  return Buffer.concat([h, data]).toString('base64');
}

async function claimAndPublish(api: APIRequestContext, title: string) {
  const session = await api.post('/api/session', { data: { handle: uniqueHandle() } });
  expect(session.status()).toBe(201);
  const created = await api.post('/api/creations', {
    data: {
      title,
      genre: 'Rock Band',
      lyrics: '[Verse]\nMorning light',
      provenance: 'AI-Generated Material',
      kind: 'music',
      durationLabel: '2:48',
      audioBase64: wavBase64(),
    },
  });
  expect(created.status()).toBeLessThan(300);
  const id = (await created.json()).creation.id as string;
  expect((await api.patch(`/api/creations/${id}/publish`, { data: { isPublished: true } })).status()).toBe(200);
  return id;
}

async function purge(api: APIRequestContext) {
  const res = await api.get('/api/creations?mine=1&limit=100');
  if (res.status() !== 200) return;
  for (const item of (await res.json()).items as { id: string }[]) await api.delete(`/api/creations/${item.id}`);
}

const openListen = async (page: Page) => {
  await page.getByRole('button', { name: 'Listen', exact: true }).first().click();
  const showcase = page.getByRole('region', { name: 'Public Community Showcase' });
  await expect(showcase).toBeVisible();
  return showcase;
};

test.describe('catalog UI and fallback modes', () => {
  test('default handle works locally: seeds stay visible and status explains how to sync', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('catalog-status')).toHaveAttribute('data-catalog-status', 'needs-handle');
    const showcase = await openListen(page);
    await expect(showcase).toContainText('Sunset Strip Arena Nights');
    await expect(showcase.getByTestId('feed-source')).toHaveAttribute('data-feed-source', 'demo');
  });

  test('with the backend unreachable the studio still loads and falls back to demo content', async ({ page }) => {
    await page.route('**/api/session', (route) => route.abort());
    await page.route('**/api/creations**', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByTestId('catalog-status')).toHaveAttribute('data-catalog-status', 'offline');
    await expect(page.getByRole('button', { name: 'Create music', exact: true })).toBeVisible();
    const showcase = await openListen(page);
    await expect(showcase).toContainText('Sunset Strip Arena Nights');
    await expect(showcase.getByTestId('feed-source')).toHaveAttribute('data-feed-source', 'demo');
  });

  test('a non-JSON API response (e.g. misrouted SPA fallback) is treated as offline, not as data', async ({ page }) => {
    await page.route('**/api/creations**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('/');
    const showcase = await openListen(page);
    await expect(showcase).toContainText('Sunset Strip Arena Nights');
    await expect(showcase.getByTestId('feed-source')).toHaveAttribute('data-feed-source', 'demo');
  });

  test('published catalog items replace demo seeds, stream from the server, and survive going offline via the cache', async ({
    page,
    playwright,
  }) => {
    const api = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
    const title = `Catalog Anthem ${Math.random().toString(36).slice(2, 6)}`;
    const id = await claimAndPublish(api, title);
    try {
      await page.goto('/');
      let showcase = await openListen(page);
      await expect(showcase).toContainText(title);
      await expect(showcase).not.toContainText('Sunset Strip Arena Nights');
      await expect(showcase.getByTestId('feed-source')).toHaveAttribute('data-feed-source', 'catalog');

      await showcase.getByLabel(`Play ${title}`).click();
      const player = page.getByTestId('persistent-community-player');
      await expect(player).toContainText(title);
      await expect(player.locator('audio')).toHaveAttribute('src', new RegExp(`/api/creations/${id}/audio$`));

      // Backend goes away: the last known catalog contents are still shown, with an honest label.
      await page.route('**/api/session', (route) => route.abort());
      await page.route('**/api/creations**', (route) => route.abort());
      await page.reload();
      showcase = await openListen(page);
      await expect(showcase).toContainText(title);
      await expect(showcase.getByTestId('feed-source')).toHaveAttribute('data-feed-source', 'cache');
    } finally {
      await purge(api);
      await api.dispose();
    }
  });

  test('a creator with their own handle is connected and generated tracks sync to the catalog', async ({ page }) => {
    const handle = uniqueHandle();
    await page.addInitScript((h) => localStorage.setItem('tell-them-handle', h), handle);
    const { encodeWav } = await import('../src/utils/creativeAudio');
    const audio = Buffer.from(await encodeWav([new Float32Array(16000)], 16000).arrayBuffer()).toString('base64');
    await page.route('**/api/generate-music', (route) =>
      route.fulfill({ json: { audioBase64: audio, mimeType: 'audio/wav', rawText: 'An original instrumental' } })
    );
    await page.route('**/api/generate-title', (route) => route.fulfill({ json: { title: 'Synced Studio Take' } }));
    await page.route('**/api/generate-cover', (route) => route.fulfill({ json: { coverImageUrl: null } }));

    await page.goto('/');
    await expect(page.getByTestId('catalog-status')).toHaveAttribute('data-catalog-status', 'online');
    try {
      await page.getByRole('button', { name: 'Electronic', exact: true }).click();
      await page.getByRole('button', { name: 'Instrumental', exact: true }).click();
      await page.getByRole('button', { name: '0:30 Short clip', exact: true }).click();
      await page.getByLabel('Creative brief').fill('An original electronic soundscape');
      await page.getByRole('button', { name: 'Create music', exact: true }).click();
      await page.getByRole('button', { name: 'Save · Synced Studio Take', exact: true }).click();
      await page.getByRole('button', { name: 'My Library', exact: true }).first().click();
      const sync = page.getByTestId('library-sync-status').first();
      await expect(sync).toHaveAttribute('data-sync-state', 'synced');
      await expect(sync).toContainText('Backed up');

      const mine = await (await page.request.get('/api/creations?mine=1')).json();
      expect(mine.items.map((i: { title: string }) => i.title)).toContain('Synced Studio Take');
      expect(mine.items[0].isPublished).toBe(false);

      // Making it public in the library publishes it server-side (through moderation).
      await page.getByLabel('Public listening (local preview)').check();
      await expect(sync).toContainText('Published to the live catalog');
      const publicList = await (await page.request.get('/api/creations?limit=50')).json();
      expect(publicList.items.map((i: { title: string }) => i.title)).toContain('Synced Studio Take');
    } finally {
      await purge(page.request);
    }
  });

  test('publishing from the studio with a claimed handle promotes the item to the live catalog', async ({ page }) => {
    const handle = uniqueHandle();
    await page.addInitScript((h) => localStorage.setItem('tell-them-handle', h), handle);
    const { encodeWav } = await import('../src/utils/creativeAudio');
    const audio = Buffer.from(await encodeWav([new Float32Array(16000)], 16000).arrayBuffer()).toString('base64');
    await page.route('**/api/generate-music', (route) =>
      route.fulfill({ json: { audioBase64: audio, mimeType: 'audio/wav', rawText: 'An original instrumental' } })
    );
    await page.route('**/api/generate-title', (route) => route.fulfill({ json: { title: 'Promoted Studio Take' } }));
    await page.route('**/api/generate-cover', (route) => route.fulfill({ json: { coverImageUrl: null } }));

    await page.goto('/');
    try {
      await page.getByRole('button', { name: 'Electronic', exact: true }).click();
      await page.getByRole('button', { name: 'Instrumental', exact: true }).click();
      await page.getByRole('button', { name: '0:30 Short clip', exact: true }).click();
      await page.getByLabel('Creative brief').fill('An original electronic soundscape');
      await page.getByRole('button', { name: 'Create music', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Save · Promoted Studio Take', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Publish to Community' }).first().click();
      await expect(page.getByRole('button', { name: 'Published to Community ✓' }).first()).toBeVisible();
      await expect
        .poll(async () => {
          const list = await (await page.request.get('/api/creations?limit=50')).json();
          return list.items.map((i: { title: string }) => i.title);
        })
        .toContain('Promoted Studio Take');
      await expect(page.getByRole('status').filter({ hasText: 'live Public Community Showcase' })).toBeVisible();
      // The local item and its server copy are shown once, not twice.
      const showcase = await openListen(page);
      await expect(showcase.getByLabel('Play Promoted Studio Take')).toHaveCount(1);
    } finally {
      await purge(page.request);
    }
  });
});
