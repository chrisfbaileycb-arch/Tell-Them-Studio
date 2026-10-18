import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const uniqueHandle = () => `@gui_${Math.random().toString(36).slice(2, 10)}`;

/** Random audio so revocation (which blocklists by content hash) never leaks between tests. */
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

async function createPublished(api: APIRequestContext, body: Record<string, unknown>) {
  const created = await api.post('/api/creations', {
    data: {
      genre: 'Rock Band',
      lyrics: '[Verse]\nMorning light',
      provenance: 'AI-Generated Material',
      kind: 'music',
      audioBase64: wavUniqueBuffer().toString('base64'),
      ...body,
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

test.describe('governance UI: attribution, reporting, consent', () => {
  test('showcase credits the parent project of a remix and lets anyone report a listing', async ({ page, playwright }) => {
    const author = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
    const remixer = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
    const authorHandle = uniqueHandle();
    const suffix = Math.random().toString(36).slice(2, 6);
    const parentTitle = `Original Anthem ${suffix}`;
    const childTitle = `Remixed Anthem ${suffix}`;
    try {
      expect((await author.post('/api/session', { data: { handle: authorHandle } })).status()).toBe(201);
      expect((await remixer.post('/api/session', { data: { handle: uniqueHandle() } })).status()).toBe(201);
      const parentId = await createPublished(author, { title: parentTitle, remixPermitted: true });
      await createPublished(remixer, { title: childTitle, remixOfId: parentId });

      await page.goto('/');
      const showcase = await openListen(page);
      const cardFor = (title: string) =>
        showcase.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      const childCard = cardFor(childTitle);
      await expect(childCard.getByTestId('remix-credit')).toContainText(`Remix of ${authorHandle}`);
      await expect(childCard.getByTestId('remix-credit')).toContainText(parentTitle);
      await expect(cardFor(parentTitle).getByTestId('remix-credit')).toHaveCount(0);

      // Anonymous report: no account needed, and the confirmation is shown.
      const parentCard = cardFor(parentTitle);
      await parentCard.getByRole('button', { name: `Report ${parentTitle}` }).click();
      await parentCard.getByLabel('Reason').selectOption('rights');
      await parentCard.getByRole('button', { name: 'Send report' }).click();
      await expect(parentCard.getByTestId('report-sent')).toContainText('received');
    } finally {
      await purge(remixer);
      await purge(author);
      await author.dispose();
      await remixer.dispose();
    }
  });

  test('a creator can withdraw consent from My Library and undo it during the grace period', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    const handle = uniqueHandle();
    await page.addInitScript((h) => localStorage.setItem('tell-them-handle', h), handle);
    const { encodeWav } = await import('../src/utils/creativeAudio');
    const samples = new Float32Array(16000).map(() => Math.random() * 0.2 - 0.1);
    const audio = Buffer.from(await encodeWav([samples], 16000).arrayBuffer()).toString('base64');
    await page.route('**/api/generate-music', (route) =>
      route.fulfill({ json: { audioBase64: audio, mimeType: 'audio/wav', rawText: 'An original instrumental' } })
    );
    await page.route('**/api/generate-title', (route) => route.fulfill({ json: { title: 'Withdrawable Take' } }));
    await page.route('**/api/generate-cover', (route) => route.fulfill({ json: { coverImageUrl: null } }));

    await page.goto('/');
    await expect(page.getByTestId('catalog-status')).toHaveAttribute('data-catalog-status', 'online');
    try {
      await page.getByRole('button', { name: 'Electronic', exact: true }).click();
      await page.getByRole('button', { name: 'Instrumental', exact: true }).click();
      await page.getByRole('button', { name: '0:30 Short clip', exact: true }).click();
      await page.getByLabel('Creative brief').fill('An original electronic soundscape');
      await page.getByRole('button', { name: 'Create music', exact: true }).click();
      await page.getByRole('button', { name: 'Save · Withdrawable Take', exact: true }).click();
      await page.getByRole('button', { name: 'My Library', exact: true }).first().click();

      const sync = page.getByTestId('library-sync-status').first();
      await expect(sync).toHaveAttribute('data-sync-state', 'synced');
      await page.getByLabel('Public listening (local preview)').check();
      await expect(sync).toContainText('Published to the live catalog');
      const titlesPublic = async () =>
        ((await (await page.request.get('/api/creations?limit=50')).json()).items as { title: string }[]).map((i) => i.title);
      expect(await titlesPublic()).toContain('Withdrawable Take');

      await page.getByTestId('withdraw-consent').click();
      await expect(sync).toContainText('Consent withdrawn');
      await expect(sync).toHaveAttribute('data-sync-state', 'local');
      expect(await titlesPublic()).not.toContain('Withdrawable Take');
      await expect(page.getByLabel('Public listening (local preview)')).toBeDisabled();

      // Still withdrawn after a reload: the local mirror never re-publishes withdrawn work.
      await page.reload();
      await page.getByRole('button', { name: 'My Library', exact: true }).first().click();
      await expect(page.getByTestId('library-sync-status').first()).toContainText('Consent withdrawn');
      expect(await titlesPublic()).not.toContain('Withdrawable Take');

      await page.getByTestId('undo-withdrawal').click();
      await expect(page.getByTestId('library-sync-status').first()).toContainText('Consent restored');
      const mine = (await (await page.request.get('/api/creations?mine=1')).json()).items as {
        title: string;
        revokedAt: string | null;
        isPublished: boolean;
      }[];
      const restored = mine.find((i) => i.title === 'Withdrawable Take');
      expect(restored?.revokedAt).toBeNull();
      // Restoring never re-lists the work: the creator must publish again (re-moderated).
      expect(await titlesPublic()).not.toContain('Withdrawable Take');
    } finally {
      await purge(page.request);
    }
  });
});
