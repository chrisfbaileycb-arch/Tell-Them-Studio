import { test, expect } from '@playwright/test';
import { sanitizeApiBase, safeHttpUrl } from '../src/showcase/ShowcaseApp';

test.describe('PWA Compliance & API Security Hardening', () => {
  test('Web App Manifest and PNG icons meet mobile & desktop installability standards', async ({ request }) => {
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();

    expect(manifest.id).toBe('/');
    expect(manifest.name).toBe('Tell Them Studio');
    expect(manifest.short_name).toBe('Tell Them');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');

    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toContain('192x192:any');
    expect(sizes).toContain('512x512:any');
    expect(sizes).toContain('512x512:maskable');

    for (const iconPath of ['/pwa-192x192.png', '/pwa-512x512.png', '/pwa-maskable-512x512.png', '/apple-touch-icon.png']) {
      const iconRes = await request.get(iconPath);
      expect(iconRes.status(), iconPath).toBe(200);
      const buf = await iconRes.body();
      expect(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    }
  });

  test('HTML entry points include PWA manifest link and mobile/iOS meta tags', async ({ request }) => {
    for (const route of ['/', '/studio', '/showcase']) {
      const res = await request.get(route);
      expect(res.status(), route).toBe(200);
      const html = await res.text();
      expect(html, route).toContain('rel="manifest" href="/manifest.webmanifest"');
      expect(html, route).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
      expect(html, route).toContain('name="mobile-web-app-capable" content="yes"');
      expect(html, route).toContain('name="apple-mobile-web-app-capable" content="yes"');
    }
  });

  test('In-app PWA install prompt and offline connectivity indicator work in Studio UI', async ({ page }) => {
    await page.goto('/studio');

    // Simulate browser firing beforeinstallprompt
    await page.evaluate(() => {
      const evt = new Event('beforeinstallprompt') as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
      };
      evt.prompt = async () => {};
      evt.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(evt);
    });

    const installBtn = page.getByTestId('pwa-install-button');
    await expect(installBtn).toBeVisible();
    await expect(installBtn).toContainText('Install App');
    await installBtn.click();
    await expect(installBtn).toHaveCount(0);

    // Simulate going offline and back online
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByTestId('pwa-offline-indicator')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('pwa-offline-indicator')).toHaveCount(0);
  });

  test('API security: cross-origin POST guard, input validation, header hardening, and XSS sanitization', async ({
    request,
    page,
  }) => {
    // 1. Security headers and server fingerprint removal
    const health = await request.get('/api/health');
    expect(health.headers()['x-powered-by']).toBeUndefined();
    expect(health.headers()['x-content-type-options']).toBe('nosniff');
    expect(health.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(health.headers()['x-permitted-cross-domain-policies']).toBe('none');

    // 2. Cross-origin POST requests from untrusted origins are blocked on AI endpoints
    for (const endpoint of [
      '/api/creative-assistant',
      '/api/generate-title',
      '/api/generate-cover',
      '/api/generate-music',
      '/api/generate-podcast',
      '/api/generate-commercial',
    ]) {
      const crossSite = await request.post(endpoint, {
        headers: { Origin: 'https://evil-attacker.example' },
        data: {},
      });
      expect(crossSite.status(), endpoint).toBe(403);
      expect((await crossSite.json()).code).toBe('forbidden_origin');
    }

    // 3. Type confusion and invalid input payloads return 400 JSON without crashing
    expect(
      (await request.post('/api/generate-title', { data: { musicPrompt: ['not-a-string'] } })).status()
    ).toBe(400);
    expect(
      (await request.post('/api/generate-cover', { data: { lyricContext: { bad: true } } })).status()
    ).toBe(400);
    expect(
      (
        await request.post('/api/generate-music', {
          data: { promptText: 'Rock song', images: [{ mimeType: 'text/html', data: 'AAAA' }] },
        })
      ).status()
    ).toBe(400);
    expect(
      (
        await request.post('/api/generate-podcast', {
          data: { showTitle: 'Show', hostAVoice: 'bad voice; drop table' },
        })
      ).status()
    ).toBe(400);
    expect(
      (
        await request.post('/api/generate-podcast', {
          data: { showTitle: 'Show', targetMinutes: 99999 },
        })
      ).status()
    ).toBe(400);
    expect(
      (
        await request.post('/api/generate-commercial', {
          data: { brandName: 'Brand', voiceName: '<script>alert(1)</script>' },
        })
      ).status()
    ).toBe(400);

    // 4. Malformed JSON on AI routes returns 400 JSON (not Express HTML stack trace)
    const badJson = await request.post('/api/generate-music', {
      headers: { 'content-type': 'application/json' },
      data: '{ malformed json',
    });
    expect(badJson.status()).toBe(400);
    expect((await badJson.json()).code).toBe('invalid_json');

    // 5. URL scheme sanitization in Showcase prevents javascript: XSS via ?apiBase
    expect(sanitizeApiBase('javascript:alert(1)//')).toBe('');
    expect(sanitizeApiBase('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeApiBase('https://user:pass@example.com/api')).toBe('');
    expect(sanitizeApiBase('https://catalog.example.com/')).toBe('https://catalog.example.com');
    expect(safeHttpUrl('javascript:alert(1)')).toBe('#');
    expect(safeHttpUrl('https://feeds.example.com/show.xml')).toBe('https://feeds.example.com/show.xml');

    await page.goto('/showcase?apiBase=javascript:alert(1)//');
    await expect(page.getByTestId('back-to-studio')).toHaveAttribute('href', '/studio');
  });
});
