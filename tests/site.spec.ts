import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * The public site: landing, pricing, legal drafts, per-track share pages and crawler files.
 * The studio itself lives at /studio and is covered by the other specs.
 */

const ORIGIN = 'http://localhost:3000';
const handle = () => `@s_${Math.random().toString(36).slice(2, 10)}`;

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

/** Creates a creator session on `request`, uploads one track and publishes it. */
async function publishTrack(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const session = await request.post('/api/session', { data: { handle: handle() } });
  expect(session.status()).toBe(201);
  const creatorHandle = (await session.json()).profile.handle as string;
  const created = await request.post('/api/creations', {
    data: {
      title: 'Porchlight Promise',
      genre: 'Country Band',
      lyrics: '[Verse 1]\nMorning light on the river',
      provenance: 'AI-Generated Material',
      kind: 'music',
      durationLabel: '2:48',
      audioBase64: wav().toString('base64'),
      ...over,
    },
  });
  expect(created.status(), await created.text()).toBeLessThan(300);
  const id = (await created.json()).creation.id as string;
  const published = await request.patch(`/api/creations/${id}/publish`, { data: { isPublished: true } });
  expect(published.status(), await published.text()).toBe(200);
  return { id, handle: creatorHandle };
}

async function purgeMine(request: APIRequestContext) {
  const res = await request.get('/api/creations?mine=1&limit=100');
  if (res.status() !== 200) return;
  for (const item of (await res.json()).items as { id: string }[]) {
    await request.delete(`/api/creations/${item.id}`);
  }
}

test.describe('public site', () => {
  test.afterEach(async ({ request }) => {
    await purgeMine(request);
  });

  test('the landing page is server-rendered with social tags and a clear way in', async ({ page, request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    // No template token or partial marker may ever reach a visitor.
    expect(html).not.toContain('__TT_');
    expect(html).not.toContain('<!--@');
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/">`);
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/images/og-default.jpg">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    // The message is in the HTML itself, not painted in by a script.
    expect(html).toMatch(/<h1><em>Tell them<\/em> in a song\.<\/h1>/);

    const image = await request.get('/images/og-default.jpg');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/jpeg');
    expect((await request.get('/favicon.svg')).status()).toBe(200);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell them in a song.');
    await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Open the studio' })).toHaveAttribute('href', '/studio');
    await expect(page.locator('.plan-mini')).toHaveCount(4);
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms');
  });

  test('an idea typed on the landing page is waiting in the studio', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('What do you want to tell them?').fill('A lullaby for Grandpa Joe, who taught me to fish');
    await page.getByRole('button', { name: 'Start my song' }).click();
    await expect(page).toHaveURL(/\/studio#bands$/);
    await expect(page.getByLabel('Creative brief')).toHaveValue('A lullaby for Grandpa Joe, who taught me to fish');
  });

  test('studio links from before the move still open the studio', async ({ page }) => {
    await page.goto('/#library');
    await expect(page).toHaveURL(/\/studio#library$/);
    await expect(page.getByRole('heading', { name: 'Your library, your way.' })).toBeVisible();
  });

  test('pricing presents the planned plans as a preview, with monthly and yearly views', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('.notice').first()).toContainText('Paid plans are not on sale yet');
    await expect(page.locator('.plan')).toHaveCount(4);

    const creator = page.locator('.plan[data-plan="creator"]');
    await expect(creator.locator('.plan-amount')).toHaveText('$12');
    await expect(creator.locator('.plan-credits')).toContainText('80 credits');
    await page.getByRole('button', { name: /Yearly/ }).click();
    await expect(creator.locator('.plan-amount')).toHaveText('$9');
    await expect(creator.locator('.plan-billing')).toHaveText('$108 billed yearly, save 25%');
    await page.getByRole('button', { name: 'Monthly' }).click();
    await expect(creator.locator('.plan-amount')).toHaveText('$12');

    // Only the free plan can be started; nothing paid is purchasable yet.
    await expect(page.locator('.plan[data-plan="free"]').getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/studio');
    await expect(page.locator('.plan .btn-disabled')).toHaveCount(3);
    await expect(page.locator('.credit-table tbody tr')).toHaveCount(6);
  });

  test('legal pages are published as clearly labelled drafts', async ({ request }) => {
    for (const [path, heading] of [
      ['/terms', 'Terms of use'],
      ['/privacy', 'Privacy'],
      ['/refunds', 'Refunds and cancelling'],
    ]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      const html = await res.text();
      expect(html, path).toContain(`<h1>${heading}</h1>`);
      expect(html, path).toContain('<strong>Draft.</strong>');
      expect(html, path).not.toContain('__TT_');
      expect(html, path).not.toContain('<!--@');
      expect(html, path).toContain(`<link rel="canonical" href="${ORIGIN}${path}">`);
    }
  });

  test('a published track gets a share page; private and unknown ones do not', async ({ page, request }) => {
    const track = await publishTrack(request, { title: 'Rock & Roll <3 "Tonight"' });

    const res = await request.get(`/s/${track.id}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('__TT_');
    // Creator-supplied text is escaped everywhere it appears.
    expect(html).toContain('<h1>Rock &amp; Roll &lt;3 &quot;Tonight&quot;</h1>');
    expect(html).not.toContain('<h1>Rock & Roll <3');
    expect(html).toContain(track.handle);
    expect(html).toContain('AI-Generated Material');
    expect(html).toContain(`<meta property="og:audio" content="${ORIGIN}/api/creations/${track.id}/audio">`);
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/s/${track.id}">`);
    expect(html).toContain('Morning light on the river');

    await page.goto(`/s/${track.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rock & Roll <3 "Tonight"');
    await expect(page.locator('audio')).toHaveAttribute('src', `/api/creations/${track.id}/audio`);
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.locator('[data-share-status]')).toHaveText(/Link copied|Copy this link/);
    await page.getByText('Report this song').click();
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.locator('[data-report-status]')).toHaveText('Thanks. Your report was received and will be reviewed.');

    // Unpublished work is indistinguishable from work that never existed.
    expect((await request.patch(`/api/creations/${track.id}/publish`, { data: { isPublished: false } })).status()).toBe(200);
    expect((await request.get(`/s/${track.id}`)).status()).toBe(404);
    expect((await request.get('/s/00000000-0000-4000-8000-000000000000')).status()).toBe(404);
    expect((await request.get('/s/not-an-id')).status()).toBe(404);
  });

  test('new published tracks appear on the landing page and in the showcase with share links', async ({ page, request }) => {
    const track = await publishTrack(request, { title: 'Landing Page Lullaby' });

    await page.goto('/');
    await expect(page.locator('#community-feed')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#community-feed').getByRole('link', { name: 'Landing Page Lullaby' })).toHaveAttribute('href', `/s/${track.id}`);
    await expect(page.locator('#community-feed').getByRole('button', { name: 'Play Landing Page Lullaby' })).toBeVisible();

    await page.goto('/showcase');
    const card = page.getByTestId('showcase-card').filter({ hasText: 'Landing Page Lullaby' });
    await expect(card.getByTestId('card-share-link')).toHaveAttribute('href', `/s/${track.id}`);
  });

  test('crawler files, redirects and not-found handling', async ({ request }) => {
    const track = await publishTrack(request);

    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);

    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(sitemap).toContain(`<loc>${ORIGIN}/pricing</loc>`);
    expect(sitemap).toContain(`<loc>${ORIGIN}/s/${track.id}</loc>`);

    const missing = await request.get('/definitely-not-a-page');
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain('That one is not');

    const api = await request.get('/api/definitely-not-an-endpoint');
    expect(api.status()).toBe(404);
    expect((await api.json()).code).toBe('not_found');

    // Page templates are never served raw: .html addresses redirect to the clean route or 404.
    const alias = await request.get('/pricing.html', { maxRedirects: 0 });
    expect(alias.status()).toBe(301);
    expect(alias.headers()['location']).toBe('/pricing');
    expect((await request.get('/share.html')).status()).toBe(404);
  });
});
