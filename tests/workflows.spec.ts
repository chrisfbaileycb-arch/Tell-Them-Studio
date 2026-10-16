import { test, expect } from '@playwright/test';

test('one music workspace preserves briefs and jingle settings across navigation and reload', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(main.getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: '0:30 Short clip', exact: true }).click();
  await page.getByLabel('Creative brief').fill('A cheerful coffee shop jingle for our autumn opening');
  await page.getByRole('button', { name: 'My Library', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByLabel('Creative brief')).toHaveValue('A cheerful coffee shop jingle for our autumn opening');
  await page.reload();
  await expect(page.getByLabel('Creative brief')).toHaveValue('A cheerful coffee shop jingle for our autumn opening');
  await expect(page.getByRole('button', { name: '0:30 Short clip', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Create music' })).toBeEnabled();
  const briefTop = await page.getByLabel('Creative brief').evaluate(e => e.getBoundingClientRect().top);
  const settingsTop = await page.locator('.studio-fine-tune summary').evaluate(e => e.getBoundingClientRect().top);
  expect(briefTop).toBeLessThan(settingsTop);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/create-mobile.png', fullPage: true });
});

test('creative tools retain separate conversations and drafts through handoff and refresh', async ({ page }) => {
  await page.goto('/#creative');
  await page.route('**/api/creative-assistant', route => route.fulfill({ json: { text: 'An original chorus for autumn mornings' } }));
  await page.getByRole('button', { name: 'Lyrics designer', exact: true }).click();
  await page.getByLabel('Your idea', { exact: true }).fill('Write a new chorus');
  await page.getByRole('button', { name: 'Ask the assistant' }).click();
  await expect(page.locator('.cw-message.assistant')).toContainText('An original chorus');
  await page.getByLabel('Your idea', { exact: true }).fill('Make the chorus warmer');
  await page.getByRole('button', { name: 'Sound discovery', exact: true }).click();
  await expect(page.getByLabel('Your idea', { exact: true })).toHaveValue('');
  await page.getByLabel('Your idea', { exact: true }).fill('Describe a gentle brass sound');
  await page.getByRole('button', { name: 'Lyrics designer', exact: true }).click();
  await expect(page.getByLabel('Your idea', { exact: true })).toHaveValue('Make the chorus warmer');
  await page.getByRole('button', { name: 'Edit in lyrics studio' }).click();
  await expect(page.locator('textarea').filter({ hasText: 'An original chorus' })).toBeVisible();
  await page.reload();
  await expect(page.locator('textarea').filter({ hasText: 'An original chorus' })).toBeVisible();
  await page.getByRole('button', { name: 'Creative assistant', exact: true }).click();
  await expect(page.locator('.cw-message.assistant')).toContainText('An original chorus');
  await expect(page.getByLabel('Your idea', { exact: true })).toHaveValue('Make the chorus warmer');
  await page.reload();
  await expect(page.locator('.cw-message.assistant')).toContainText('An original chorus');
  await page.getByRole('button', { name: 'Sound discovery', exact: true }).click();
  await expect(page.getByLabel('Your idea', { exact: true })).toHaveValue('Describe a gentle brass sound');
});

test('publishing requires manual acknowledgement and podcast release planning is optional', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Handoff Link (Top 10 Platforms)' }).first().click();
  const link = page.getByRole('link', { name: 'Open Spotify Handoff' });
  // Intercept the external navigation while retaining the app's click handler.
  await link.evaluate(el => el.addEventListener('click', event => event.preventDefault()));
  await link.click();
  await expect(page.getByRole('button', { name: 'Upload noted by you ✓' })).toHaveCount(0);
  await page.getByRole('button', { name: 'I uploaded it', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Upload noted by you ✓' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Upload noted by you ✓' }).click();
  await expect(page.getByRole('button', { name: 'Upload noted by you ✓' })).toHaveCount(0);
  await page.goto('/#podcasts');
  await expect(page.getByRole('button', { name: /Produce .*Min Podcast/ })).toBeEnabled();
  await expect(page.getByText('Optional release plan · notes only, no automatic scheduling', { exact: true })).toBeVisible();
  await expect(page.getByText('Weekly Consistency & Anti-Spam Pledge:', { exact: true })).toHaveCount(0);
});
