import { expect, test } from '@playwright/test';
import { download, openOffline } from '../helpers/standalone';

test('production PWA can export a self-contained HTML app offline and the file works independently', async ({
  playwright,
}, info) => {
  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const author = await browser.newContext();
  try {
    const page = await author.newPage();
    await page.goto(
      'http://127.0.0.1:4175/test-programming-language/?runner=1',
    );
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then((r) => r.scope),
    );
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await author.setOffline(true);
    await page
      .getByLabel('Open .lang file', { exact: true })
      .setInputFiles({
        name: 'Offline app.lang',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'input integer: number = 6. button "Double", do. print(number * 2). end button.',
        ),
      });
    await expect(
      page.getByRole('button', { name: 'Double', exact: true }),
    ).toBeEnabled();
    const path = await download(page, info);
    await author.close();
    const { context, app, external, errors } = await openOffline(
      browser,
      path,
      info,
    );
    try {
      await app.getByRole('button', { name: 'Double', exact: true }).click();
      await expect(app.getByRole('log')).toHaveText('12');
      await app
        .getByRole('spinbutton', { name: 'Number', exact: true })
        .fill('8');
      await app.getByRole('button', { name: 'Double', exact: true }).click();
      await expect(app.getByRole('log')).toContainText('16');
      expect(
        await app.locator('.cm-content, input[type=file], aside').count(),
      ).toBe(0);
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
