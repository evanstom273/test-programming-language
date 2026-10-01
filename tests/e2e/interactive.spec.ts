import { expect, test, type Page } from '@playwright/test';

async function openFile(page: Page, name: string) {
  const open = page.getByRole('button', { name: 'Open files', exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
  await expect(page.locator('.cm-content')).not.toBeEmpty();
}

async function inspector(page: Page) {
  const open = page.getByRole('button', { name: 'Open inspector', exact: true });
  if (await open.isVisible()) await open.click();
  return page.getByRole('textbox', { name: 'Title', exact: true }).filter({ visible: true });
}

async function closeInspector(page: Page) {
  const close = page.getByRole('button', { name: 'Close inspector', exact: true }).filter({ visible: true });
  if (await close.count()) await close.last().click();
}

async function replaceSource(page: Page, source: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cm-content')).not.toBeEmpty();
});

test('calculator combines Inspector, live inputs, functions, persistence, and stale-source protection', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFile(page, 'interactive-calculator.lang');
  const source = await page.locator('.cm-content').innerText();
  const title = await inspector(page);
  await title.fill('Pocket calculator');
  await title.press('End');
  await title.pressSequentially('!');
  await expect(title).toBeFocused();
  await closeInspector(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const first = page.getByRole('spinbutton', { name: 'Number One', exact: true });
  const second = page.getByRole('spinbutton', { name: 'Number Two', exact: true });
  const operation = page.getByRole('combobox', { name: 'Operation', exact: true });
  await expect(first).toHaveValue('10');
  await first.fill('12');
  await second.fill('3');
  await operation.selectOption('multiply');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Pocket calculator! 36');
  await expect(page.locator('.cm-content')).toHaveText(source.replace(/\n/g, ''));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of [first, second, operation, page.getByRole('button', { name: 'Calculate', exact: true })]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `/tmp/language-lab-review/${testInfo.project.name}.png`, fullPage: true });

  await page.reload();
  await openFile(page, 'interactive-calculator.lang');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(first).toHaveValue('12');
  await expect(second).toHaveValue('3');
  await expect(operation).toHaveValue('multiply');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Pocket calculator! 36');

  await first.fill('');
  await expect(page.getByText('Enter a whole number.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await first.fill('8');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Pocket calculator! 24');
  await page.getByRole('button', { name: 'Clear output', exact: true }).click();
  await expect(page.getByRole('log')).not.toContainText('36');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Pocket calculator! 24');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nprint("Changed").');
  await expect(page.getByText('Source or Inspector values changed. Press Run to restart the program.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Changed');
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeEnabled();

  const currentTitle = await inspector(page);
  await currentTitle.fill('Renamed');
  await closeInspector(page);
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Renamed 24');
  expect(errors).toEqual([]);
});

test('all input controls, button state, reset, and invalid persisted types', async ({ page }) => {
  await replaceSource(page, 'input text: playerName = "Lyra". input boolean: enabled = true. input array: items = ["one"]. input integer: health = 100. button "Heal", do. health = health + 10. if enabled, do. print(playerName, items[0], health). end if. end button.');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('textbox', { name: 'Player Name', exact: true }).fill('Mira');
  await page.getByRole('textbox', { name: 'Items', exact: true }).fill('[bad');
  await expect(page.getByRole('button', { name: 'Heal', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Items', exact: true }).fill('["two"]');
  await page.getByRole('button', { name: 'Heal', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Mira two 110');
  await page.getByRole('button', { name: 'Heal', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Health', exact: true })).toHaveValue('120');
  await page.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Heal', exact: true }).click();
  await expect(page.getByRole('log')).not.toContainText('130');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Health', exact: true })).toHaveValue('100');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Reset saved inputs and restart', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Player Name', exact: true })).toHaveValue('Lyra');
  await expect(page.getByRole('checkbox')).toBeChecked();

  await page.getByRole('spinbutton', { name: 'Health', exact: true }).fill('20');
  await replaceSource(page, 'input text: health = "full". button "Show", do. print(health). end button.');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('different type');
  await expect(page.getByRole('button', { name: 'Show', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset saved inputs and restart', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Health', exact: true })).toHaveValue('full');
});

test('ordinary console and file switching remain usable', async ({ page }) => {
  await openFile(page, 'main.lang');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Hello Lyra');
  await expect(page.getByRole('group', { name: 'Program actions' })).toHaveCount(0);
  await openFile(page, 'interactive-calculator.lang');
  await expect(page.getByRole('log')).not.toContainText('Hello Lyra');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeEnabled();
  await openFile(page, 'main.lang');
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toHaveCount(0);
});

test('narrow screens and long program labels do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await replaceSource(page, 'export text: title = "Inspector". input text: extremelyLongUnbrokenVariableNameForWrapping = "value". button "AReallyLongButtonLabelThatMustWrapWithoutOverflow", do. print("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"). end button.');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'AReallyLongButtonLabelThatMustWrapWithoutOverflow', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const fieldset = page.getByRole('group', { name: 'Program inputs' });
  expect(await fieldset.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await inspector(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
