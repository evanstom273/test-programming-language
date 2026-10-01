import {
  expect,
  type Page,
  type Browser,
  type TestInfo,
} from '@playwright/test';
import { pathToFileURL } from 'node:url';
export async function download(page: Page, info: TestInfo) {
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download standalone HTML', exact: true })
    .filter({ visible: true })
    .click();
  const artifact = await pending;
  expect(artifact.suggestedFilename()).toMatch(/\.html$/);
  const path = info.outputPath('Application.html');
  await artifact.saveAs(path);
  return path;
}
export async function openOffline(
  browser: Browser,
  path: string,
  info: TestInfo,
) {
  const context = await browser.newContext({
    offline: true,
    serviceWorkers: 'block',
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
  });
  const app = await context.newPage();
  // Managed cloud Chromium blocks file:// by administrator policy. Local runs
  // can preview the exact artifact through Playwright's loopback response;
  // CI/default always tests a real, offline file:// navigation.
  const url =
    process.env.STANDALONE_TEST_TRANSPORT === 'loopback'
      ? 'http://127.0.0.1/standalone-test.html'
      : pathToFileURL(path).href;
  if (process.env.STANDALONE_TEST_TRANSPORT === 'loopback')
    await app.route(url, (route) =>
      route.fulfill({ path, contentType: 'text/html' }),
    );
  const external: string[] = [];
  const errors: string[] = [];
  app.on('request', (r) => {
    if (/^https?:/.test(r.url()) && r.url() !== url) external.push(r.url());
  });
  app.on('pageerror', (error) => errors.push(error.message));
  await app.goto(url);
  return { context, app, external, errors };
}
