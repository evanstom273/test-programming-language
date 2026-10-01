import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { singleFileSnapshot } from '../../src/workspace/model';
import { standaloneDocument } from '../../src/build/standalone/document';

test.beforeAll(() => {
  const build = spawnSync(process.execPath, ['scripts/build-vscode.mjs'], {
    encoding: 'utf8',
  });
  expect(build.status, build.stderr).toBe(0);
});
test('VS Code preview uses shared worker controls, separate Inspector configuration and stale-source protection', async ({
  page,
}) => {
  const project = singleFileSnapshot(
    '# language additions work in this host\nexport integer: factor = 2. input integer: value = 3. button "Calculate", do. for i in range(3), do. if i is 1, do. continue. end if. print(value * factor, upper("ok")). end for. end button.',
  );
  const host = JSON.parse(
    await readFile('extensions/vscode/dist/preview-host.json', 'utf8'),
  );
  const html = standaloneDocument(project, host);
  await page.addInitScript(() => {
    (window as any).messages = [];
    (window as any).acquireVsCodeApi = () => ({
      postMessage: (m: unknown) => (window as any).messages.push(m),
    });
  });
  await page.route('http://127.0.0.1/preview-test', (route) =>
    route.fulfill({ body: html, contentType: 'text/html' }),
  );
  await page.goto('http://127.0.0.1/preview-test');
  const action = page.getByRole('button', { name: 'Calculate', exact: true });
  await action.click();
  await expect(page.getByRole('log')).toContainText('6 OK');
  await page.getByRole('spinbutton', { name: 'Factor', exact: true }).fill('4');
  await expect(action).toBeDisabled();
  await page
    .getByRole('button', { name: 'Apply configuration / Restart', exact: true })
    .click();
  await action.click();
  await expect(page.getByRole('log')).toContainText('12 OK');
  expect(
    await page.evaluate(() =>
      (window as any).messages.some(
        (m: any) => m.type === 'configure' && m.value === 4,
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => window.postMessage({ type: 'stale' }, '*'));
  await expect(action).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('changed');
  await page
    .getByRole('button', { name: 'Run latest source', exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (window as any).messages.some((m: any) => m.type === 'run'),
    ),
  ).toBe(true);
});
