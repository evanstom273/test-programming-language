import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { readFile } from 'node:fs/promises';
import { showCode, showApp } from './workbench-helpers';

const game =
  'integer: count = 0. input text: name = "Lyra". button "Add point", do. count = count + 1. print(name, count). end button.';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cm-content')).not.toBeEmpty();
});
test('Fold view switch and resizer preserve inputs, button state and source', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showCode(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(game);
  await expect(
    page.getByRole('button', { name: 'Side by side', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Mira');
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  await expect(page.getByRole('log')).toHaveText('Mira 1');
  await showCode(page);
  await expect(page.locator('.cm-content')).toHaveText(game);
  await page.setViewportSize({ width: 840, height: 900 });
  await page.getByRole('button', { name: 'Side by side', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('Mira');
  const resize = page.getByRole('separator', { name: 'Resize code and app' });
  await resize.focus();
  await resize.press('ArrowRight');
  await expect(resize).toHaveAttribute('aria-valuenow', '52');
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Mira 2');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.cm-content')).toBeVisible();
  await showApp(page);
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Mira 3');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('touch editing, search, Problems, commands and preferences work without losing source', async ({
  page,
}) => {
  await showCode(page);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('print("Pocket editor").');
  await page.getByRole('button', { name: 'Insert :', exact: true }).click();
  await expect(content).toContainText('Pocket editor").:');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(content).toHaveText('print("Pocket editor").');
  await page
    .getByRole('button', { name: 'Open settings', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Code size' }).selectOption('20');
  await page.getByLabel('Wrap long lines').uncheck();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '20px');
  await page.getByRole('button', { name: 'Open project search' }).click();
  await page
    .getByRole('textbox', { name: 'Search project', exact: true })
    .fill('Pocket editor');
  await page.getByRole('button').filter({ hasText: 'main.lang:1' }).click();
  await expect(content).toBeFocused();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\ninteger health = 1.');
  await page.getByRole('button', { name: 'Open problems' }).click();
  await expect(page.getByRole('dialog', { name: 'Problems' })).toContainText(
    'I do not understand',
  );
  await page
    .getByRole('dialog', { name: 'Problems' })
    .getByRole('button')
    .filter({ hasText: 'I do not understand' })
    .first()
    .click();
  await expect(content).toBeFocused();
  await page.keyboard.press('ControlOrMeta+k');
  await page
    .getByRole('combobox', { name: 'Search commands and files' })
    .fill('Settings');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await showCode(page);
  await expect(content).toContainText('integer health');
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '20px');
});
test('open file tabs retain per-file undo history', async ({ page }) => {
  await showCode(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('print("First file").');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const files = page.getByRole('button', { name: 'Open files', exact: true });
  if (await files.isVisible()) await files.click();
  page.once('dialog', (d) => d.accept('second.lang'));
  await page
    .getByRole('button', { name: 'New file', exact: true })
    .filter({ visible: true })
    .click();
  const close = page.getByRole('button', {
    name: 'Close explorer',
    exact: true,
  });
  if (await close.count()) await close.click();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('print("Second file").');
  await page.getByRole('tab', { name: 'main.lang', exact: true }).click();
  await expect(page.locator('.cm-content')).toHaveText('print("First file").');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nprint("Extra").');
  await page.getByRole('tab', { name: 'second.lang', exact: true }).click();
  await page.getByRole('tab', { name: 'main.lang', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.cm-content')).toHaveText('print("First file").');
  await page.getByRole('tab', { name: 'second.lang', exact: true }).click();
  await expect(page.locator('.cm-content')).toHaveText('print("Second file").');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('tab', { name: 'second.lang', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.cm-content')).toHaveText('print("Second file").');
});
test('export center downloads standalone HTML, source ZIP and honest native build kits', async ({
  page,
}, info) => {
  await page.getByRole('button', { name: 'Open export', exact: true }).click();
  for (const [action, filename, entry] of [
    ['Download HTML', 'main.lang.html', ''],
    ['Download project ZIP', 'main.lang.zip', 'langlab.json'],
    [
      'Download Windows build kit',
      'main.lang-windows-build-kit.zip',
      'src-tauri/Cargo.toml',
    ],
    [
      'Download Android build kit',
      'main.lang-android-build-kit.zip',
      '.github/workflows/build.yml',
    ],
  ]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: action, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(filename);
    const path = info.outputPath(filename);
    await file.saveAs(path);
    const bytes = await readFile(path);
    if (entry) {
      const entries = unzipSync(bytes);
      expect(entries[entry]).toBeTruthy();
      if (action.includes('build kit')) {
        expect(strFromU8(entries['README.md'])).toContain(
          'NOT an EXE or APK yet',
        );
        expect(entries['dist/index.html']).toBeTruthy();
      }
    } else expect(bytes.toString()).toContain('id="app-project"');
  }
  await expect(page.getByRole('status')).toContainText('Next: build the APK');
});
test('narrow and landscape workspaces contain overflow and keep view controls reachable', async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 840, height: 380 },
    { width: 1440, height: 1000 },
    { width: 1440, height: 380 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole('button', { name: 'Run', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open export', exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Code', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await page.locator('.lab-editor').boundingBox())!.height,
    ).toBeGreaterThan(100);
  }
});
