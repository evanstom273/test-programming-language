import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

const origin = 'http://127.0.0.1:4175';
const base = '/test-programming-language/';

test('Pages PWA has decodable icons and starts offline after a browser restart', async ({ playwright }, testInfo) => {
  const chromium = playwright.chromium;
  // A normal persistent profile avoids incognito's intentional install blocker.
  const profile = testInfo.outputPath('pwa-profile');
  const options = {
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    const page = await context.newPage();
    await page.goto(origin + base);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe(base + 'language-lab.webmanifest');
    const response = await page.request.get(origin + manifestHref);
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      id: base + 'language-lab', scope: base,
      start_url: base + '?source=pwa', display: 'standalone'
    });
    expect(manifest.icons).toHaveLength(4);
    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, origin).href);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');
      // Browser image.decode alone tolerated the previously malformed files.
      const decoded = PNG.sync.read(await response.body(), { checkCRC: true });
      expect(`${decoded.width}x${decoded.height}`).toBe(icon.sizes);
    }
    await page.evaluate(() => navigator.serviceWorker.ready.then((registration) => registration.scope));
    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(origin + base + 'sw.js');
    const cdp = await context.newCDPSession(page);
    expect((await cdp.send('Page.getAppManifest')).errors).toEqual([]);
    await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);

    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await context.setOffline(true);
    const offline = await context.newPage();
    await offline.goto(new URL(manifest.start_url, origin).href);
    await expect(offline.locator('.cm-content')).not.toBeEmpty();
    await offline.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(offline.getByRole('alert')).toHaveCount(0);
    await expect(offline.getByRole('log')).not.toBeEmpty();
  } finally {
    await context.close();
  }
});
