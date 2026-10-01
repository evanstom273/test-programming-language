import { expect, test, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';

async function explorer(page: Page) {
  const open = page.getByRole('button', { name: 'Open files', exact: true });
  if (await open.isVisible()) await open.click();
}
async function closeExplorer(page: Page) {
  const closes = page
    .getByRole('button', { name: 'Close explorer', exact: true })
    .filter({ visible: true });
  if (await closes.count()) await closes.last().click();
}
async function source(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
}
async function prompt(page: Page, button: string, value: string) {
  page.once('dialog', (d) => d.accept(value));
  await page
    .getByRole('button', { name: button, exact: true })
    .filter({ visible: true })
    .click();
}
const moduleZip = () =>
  Buffer.from(
    zipSync({
      'langlab.json': strToU8(
        JSON.stringify({
          schemaVersion: 1,
          name: 'Modules',
          entry: 'main.lang',
        }),
      ),
      'main.lang': strToU8(
        'import "./lib/maths.lang" as maths. input integer: amount = 3. button "Calculate", do. print(maths.double(amount)). end button.',
      ),
      'lib/': new Uint8Array(),
      'lib/maths.lang': strToU8(
        'export integer: factor = 2. public function double(integer: value). return value * factor. end function.',
      ),
    }),
  );
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cm-content')).not.toBeEmpty();
});

test('imports a multi-file project, applies module Inspector overrides, retains session across editor selection, and exports ZIP', async ({
  page,
}) => {
  await explorer(page);
  await page.getByLabel('Import project archive').first().setInputFiles({
    name: 'modules.zip',
    mimeType: 'application/zip',
    buffer: moduleZip(),
  });
  await expect(
    page
      .getByRole('combobox', { name: 'Project', exact: true })
      .filter({ visible: true }),
  ).toHaveValue(/.+/);
  await expect(
    page
      .getByRole('button', { name: 'lib/maths.lang', exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await closeExplorer(page);
  const openInspector = page.getByRole('button', {
    name: 'Open inspector',
    exact: true,
  });
  if (await openInspector.isVisible()) await openInspector.click();
  await page
    .getByRole('spinbutton', { name: 'Factor', exact: true })
    .filter({ visible: true })
    .fill('4');
  const close = page
    .getByRole('button', { name: 'Close inspector', exact: true })
    .filter({ visible: true });
  if (await close.count()) await close.last().click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('12');
  await explorer(page);
  await page
    .getByRole('button', { name: 'lib/maths.lang', exact: true })
    .filter({ visible: true })
    .click();
  await closeExplorer(page);
  await expect(
    page.getByRole('button', { name: 'Calculate', exact: true }),
  ).toBeEnabled();
  await source(
    page,
    'export integer: factor = 2. public function double(integer: value). return value * factor + 1. end function.',
  );
  await expect(
    page.getByRole('button', { name: 'Calculate', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('13');
  await explorer(page);
  await page
    .getByText('Project actions', { exact: true })
    .filter({ visible: true })
    .click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export ZIP', exact: true })
    .filter({ visible: true })
    .click();
  expect((await download).suggestedFilename()).toBe('Modules.zip');
  await closeExplorer(page);
  await page.reload();
  await explorer(page);
  await page
    .getByRole('combobox', { name: 'Project', exact: true })
    .filter({ visible: true })
    .selectOption({ label: 'Modules' });
  await closeExplorer(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('13');
});

test('creates folders/files, persists rapid document switches, changes entry, and preserves identity on rename', async ({
  page,
}) => {
  await explorer(page);
  await prompt(page, 'New project', 'Scratch');
  await expect(
    page
      .getByRole('combobox', { name: 'Project', exact: true })
      .filter({ visible: true }),
  ).toHaveValue(/.+/);
  await prompt(page, 'New folder', 'lib');
  await expect(
    page
      .getByRole('button', { name: 'lib', exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await prompt(page, 'New file', 'lib/helper.lang');
  await expect(
    page
      .getByRole('button', { name: 'lib/helper.lang', exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await closeExplorer(page);
  await source(page, 'print("Helper persisted").');
  await explorer(page);
  await page
    .getByRole('button', { name: 'main.lang', exact: true })
    .filter({ visible: true })
    .click();
  await closeExplorer(page);
  await source(page, 'print("Main persisted").');
  await explorer(page);
  await page
    .getByRole('combobox', { name: 'Entry point', exact: true })
    .filter({ visible: true })
    .selectOption('lib/helper.lang');
  await closeExplorer(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Helper persisted');
  await explorer(page);
  await page
    .getByText('Selected file actions', { exact: true })
    .filter({ visible: true })
    .click();
  await prompt(page, 'Rename / move', 'renamed.lang');
  await expect(
    page
      .getByRole('button', { name: 'renamed.lang', exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await closeExplorer(page);
  await page.reload();
  await explorer(page);
  await page
    .getByRole('combobox', { name: 'Project', exact: true })
    .filter({ visible: true })
    .selectOption({ label: 'Scratch' });
  await page
    .getByRole('button', { name: 'renamed.lang', exact: true })
    .filter({ visible: true })
    .click();
  await closeExplorer(page);
  await expect(page.locator('.cm-content')).toContainText('Main persisted');
});

test('worker analysis does not run code; Stop discards sessions and Run recreates them', async ({
  page,
}) => {
  await source(
    page,
    'function forever(). while true, do. end while. return 1. end function. export integer: computed = forever().',
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Program stopped');
  await source(
    page,
    'input integer: count = 0. button "Count", do. count = count + 1. print(count). end button.',
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('1');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Count', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Count', exact: true }),
  ).toHaveValue('0');
});

test('actual worker reports module diagnostics and bounded output without blocking the page', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { RuntimeClient } = await import(
      /* @vite-ignore */ String('/src/runtime/client.ts')
    );
    const { singleFileSnapshot } = await import(
      /* @vite-ignore */ String('/src/workspace/model.ts')
    );
    const client = new RuntimeClient();
    const fail = await client.request({
      type: 'run',
      project: singleFileSnapshot('import "./missing.lang" as missing.'),
    });
    const bounded = await client.request({
      type: 'run',
      project: singleFileSnapshot(
        'for integer: i from 1 to 1500, do. print(i). end for.',
      ),
    });
    const infinite = await client.request({
      type: 'run',
      project: singleFileSnapshot('while true, do. end while.'),
    });
    const random = await client.request({
      type: 'run',
      project: singleFileSnapshot('print(randomInteger(7, 7)).'),
    });
    client.stop();
    return { fail, bounded, infinite, random };
  });
  expect(result.random.snapshot?.output).toEqual(['7']);
  expect(result.fail.diagnostics[0].code).toBe('MODULE_NOT_FOUND');
  expect(result.bounded.snapshot?.output).toHaveLength(1001);
  expect(result.infinite.diagnostics[0].message).toContain(
    'too many operations',
  );
});

test('imports/downloads a source file and rejects a corrupt ZIP without changing the project', async ({
  page,
}) => {
  await explorer(page);
  const projects = page
    .getByRole('combobox', { name: 'Project', exact: true })
    .filter({ visible: true });
  const before = await projects.inputValue();
  await page
    .getByLabel('Import project archive')
    .first()
    .setInputFiles({
      name: 'bad.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a ZIP'),
    });
  await expect(page.getByRole('alert')).toContainText('ZIP');
  await expect(projects).toHaveValue(before);
  page.once('dialog', (d) => d.accept('imported.lang'));
  await page
    .getByLabel('Import source file')
    .first()
    .setInputFiles({
      name: 'source.lang',
      mimeType: 'text/plain',
      buffer: Buffer.from('print("Imported source").'),
    });
  await expect(
    page
      .getByRole('button', { name: 'imported.lang', exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByText('Selected file actions', { exact: true })
    .filter({ visible: true })
    .click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download file', exact: true })
    .filter({ visible: true })
    .click();
  expect((await download).suggestedFilename()).toBe('imported.lang');
  await closeExplorer(page);
  await expect(page.locator('.cm-content')).toContainText('Imported source');
});
