import { test, expect } from '@playwright/test';

test('music-first studio supports genres, custom blends, vocal modes, and real playback', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Music Studio', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create music', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hair Metal Band', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hair Metal Band', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hair Metal Band', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Rock', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Electronic', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Electronic', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByLabel('All genres & blends').selectOption('Custom Genre');
  await page.getByLabel('Describe your genre blend').fill('Disco strings with rock drums');
  await page.getByRole('button', { name: 'Instrumental', exact: true }).click();
  await page.locator('.studio-fine-tune summary').click();
  await expect(page.getByLabel('Lyrics mode')).toHaveValue('Instrumental');
  await page.getByRole('button', { name: 'Duet', exact: true }).click();
  await expect(page.getByLabel('Lyrics mode')).toHaveValue('Auto');
  await expect(page.getByRole('button', { name: 'AI creates lyrics', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Enter your own lyrics', exact: true }).click();
  await expect(page.getByLabel('Lyrics mode')).toHaveValue('Custom');
  await page.getByLabel('Custom lyrics').fill('[Verse]\nAn original song starts here');
  await page.reload();
  await expect(page.getByLabel('Custom lyrics')).toHaveValue('[Verse]\nAn original song starts here');
  await expect(page.getByLabel('Describe your genre blend')).toHaveValue('Disco strings with rock drums');
  await expect(page.locator('.studio-waveform canvas')).toBeVisible();
  await page.locator('.studio-play').click();
  await expect.poll(() => page.locator('.studio-player audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  await page.locator('.studio-play').click();
  await expect.poll(() => page.locator('.studio-player audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  expect(errors).toEqual([]);
});

test('approved studio design fits desktop and mobile without hidden controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/');
  await page.locator('.studio-cover').evaluate((img: HTMLImageElement) => img.decode());
  await expect(page.locator('.studio-waveform canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/music-desktop.png' });
  expect(await page.getByRole('button', { name: 'Create music', exact: true }).evaluate(e => e.getBoundingClientRect().bottom)).toBeLessThan(1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/music-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const el of await page.locator('.music-compose button').all()) {
    if (!await el.isVisible()) continue;
    const box = await el.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x || 0) + (box?.width || 0)).toBeLessThanOrEqual(391);
  }
});

test('create music sends selected sound controls and saves generated audio to the library', async ({ page }) => {
  const { encodeWav } = await import('../src/utils/creativeAudio');
  const audio = Buffer.from(await encodeWav([new Float32Array(16000)], 16000).arrayBuffer()).toString('base64');
  let sent: any;
  await page.route('**/api/generate-music', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { audioBase64: audio, mimeType: 'audio/wav', rawText: 'An original instrumental' } });
  });
  await page.route('**/api/generate-title', route => route.fulfill({ json: { title: 'Fresh Studio Take' } }));
  await page.route('**/api/generate-cover', route => route.fulfill({ json: { coverImageUrl: null } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Electronic', exact: true }).click();
  await page.getByRole('button', { name: 'Instrumental', exact: true }).click();
  await page.getByRole('button', { name: '0:30 Short clip', exact: true }).click();
  await page.getByLabel('Creative brief').fill('An original electronic soundscape');
  await page.getByRole('button', { name: 'Create music', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save · Fresh Studio Take', exact: true })).toBeVisible();
  expect(sent.isClip).toBe(true);
  expect(sent.promptText).toContain('Electronic');
  expect(sent.promptText).toContain('strictly INSTRUMENTAL');
  await page.getByRole('button', { name: 'Save · Fresh Studio Take', exact: true }).click();
  await page.getByRole('button', { name: 'Publish to Community' }).first().click();
  await expect(page.getByRole('button', { name: 'Published to Community ✓' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'My Library', exact: true }).first().click();
  await expect(page.locator('.cw-track')).toContainText('Fresh Studio Take');
  await page.getByRole('button', { name: 'Listen', exact: true }).first().click();
  const showcase = page.getByRole('region', { name: 'Public Community Showcase' });
  await expect(showcase).toBeVisible();
  await expect(showcase).toContainText('Fresh Studio Take');
  await showcase.getByRole('button', { name: 'Hair Metal', exact: true }).click();
  await expect(showcase).toContainText('Sunset Strip Arena Nights');
  await showcase.getByRole('button', { name: 'All', exact: true }).click();
  await showcase.getByLabel('Search creator handles').fill('@studio_voyager');
  await expect(showcase).toContainText('Fresh Studio Take');
  await showcase.getByLabel('Play Fresh Studio Take').click();
  await expect(page.getByTestId('persistent-community-player')).toBeVisible();
  await expect(page.getByTestId('persistent-community-player')).toContainText('Fresh Studio Take');
  await expect(page.getByTestId('community-audio-visualizer')).toBeVisible();
  await expect(page.getByTestId('community-audio-visualizer')).toHaveAttribute('data-playing', 'true');
  await page.getByLabel('Pause Fresh Studio Take in player').click();
  await expect(page.getByTestId('community-audio-visualizer')).toHaveAttribute('data-playing', 'false');
  await showcase.getByRole('button', { name: /Podcasts/ }).click();
  await expect(showcase).toContainText('Narrators: Alex (Puck) & Sam (Kore)');
  await expect(showcase.getByLabel(/Playback scrubber for/).first()).toBeVisible();
});

