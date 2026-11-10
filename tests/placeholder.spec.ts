import { expect, test } from '@playwright/test';

/**
 * When the AI provider is not connected (the test server never has a key) or does not answer,
 * the server substitutes a built-in sketch. That substitution must be declared by the API and
 * shown by the studio, never passed off as the song, episode or spot that was asked for.
 */
test.describe('placeholder results are labelled honestly', () => {
  test('every generation endpoint declares a placeholder', async ({ request }) => {
    const music = await request.post('/api/generate-music', {
      data: { promptText: 'Generate a radio single performed by a Rock Band.', isClip: false },
    });
    expect(music.ok()).toBeTruthy();
    const song = await music.json();
    expect(song.fallback).toEqual({ audio: true, text: true, reason: 'not_configured' });
    expect(song.rawText).toContain('placeholder');
    // The sketch is real playable audio (RIFF/WAVE), just not what was requested.
    expect(Buffer.from(song.audioBase64, 'base64').subarray(0, 4).toString('latin1')).toBe('RIFF');

    const instrumental = await request.post('/api/generate-music', {
      data: { promptText: 'This track MUST be strictly INSTRUMENTAL.', isClip: true },
    });
    // No lyrics were requested, so only the audio is a placeholder.
    expect((await instrumental.json()).fallback).toEqual({ audio: true, text: false, reason: 'not_configured' });

    const podcast = await request.post('/api/generate-podcast', {
      data: { showTitle: 'Test Show', episodeTopic: 'Testing', targetMinutes: 5 },
    });
    expect((await podcast.json()).fallback).toEqual({ audio: true, text: true, reason: 'not_configured' });

    const commercial = await request.post('/api/generate-commercial', {
      data: { brandName: 'Test Brand', spotLength: '30s' },
    });
    expect((await commercial.json()).fallback).toEqual({ audio: true, text: true, reason: 'not_configured' });
  });

  test('the studio shows a placeholder as a placeholder, not as a finished song', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Create music/ }).click();

    const notice = page.getByTestId('fallback-notice').first();
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toContainText('Placeholder sketch');
    await expect(notice).toContainText('not your finished song');
    await expect(page.getByTestId('featured-fallback-notice')).toContainText('not your finished song');

    const card = page.locator('[data-testid^="studio-song-post-"]').first();
    // The requested length and the AI origin label are not claimed for a placeholder.
    await expect(card).toContainText('PLACEHOLDER SKETCH');
    await expect(card).not.toContainText('3:50 MAX');
    await expect(card).toContainText('built-in, not AI audio');
  });

  test('real provider output carries no placeholder notice', async ({ page }) => {
    await page.route('**/api/generate-music', (route) =>
      route.fulfill({ json: { audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', mimeType: 'audio/wav', rawText: '[Verse]\nA real line' } })
    );
    await page.route('**/api/generate-title', (route) => route.fulfill({ json: { title: 'Real Studio Take' } }));
    await page.route('**/api/generate-cover', (route) => route.fulfill({ json: { coverImageUrl: null } }));
    await page.goto('/');
    await page.getByRole('button', { name: /Create music/ }).click();
    await expect(page.getByRole('heading', { name: 'Real Studio Take' }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('fallback-notice')).toHaveCount(0);
    await expect(page.getByTestId('featured-fallback-notice')).toHaveCount(0);
  });
});
