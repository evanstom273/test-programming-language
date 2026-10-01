import { test, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('lang:open supplies a selected file to the built lightweight runner', async ({
  playwright,
}) => {
  const build = spawnSync(process.execPath, ['scripts/lang.mjs', '--build'], {
    encoding: 'utf8',
  });
  expect(build.status, build.stdout + build.stderr).toBe(0);
  const root = await mkdtemp(join(tmpdir(), 'langlab-open-'));
  const file = join(root, 'My game.lang');
  await writeFile(
    file,
    'input integer: number = 4. button "Double", do. print(number * 2). end button.',
  );
  const child = spawn(
    process.execPath,
    [resolve('.langlab-cli/cli/main.js'), 'open', file],
    { env: { ...process.env, LANGLAB_NO_BROWSER: '1' } },
  );
  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  try {
    const url = await new Promise<string>((accept, reject) => {
      let output = '';
      const timer = setTimeout(
        () => reject(new Error('CLI server did not start: ' + output)),
        10000,
      );
      child.stdout.on('data', (chunk) => {
        output += String(chunk);
        const match = output.match(/Language Lab Runner: (http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          accept(match[1]);
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('CLI server exited: ' + code));
      });
      child.stderr.on('data', (chunk) => {
        output += String(chunk);
      });
    });
    const page = await browser.newPage();
    await page.goto(url);
    await expect(
      page.getByRole('heading', { name: 'Language Lab Runner' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Double', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('8');
    await page
      .getByRole('spinbutton', { name: 'Number', exact: true })
      .fill('9');
    await page.getByRole('button', { name: 'Double', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('18');
    await expect(page.locator('.cm-content')).toHaveCount(0);
    expect(
      (await page.evaluate(() => indexedDB.databases())).some(
        (db) => db.name === 'language-lab',
      ),
    ).toBe(false);
  } finally {
    child.kill('SIGINT');
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});
