import { showCode, showApp } from './workbench-helpers';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
async function source(page: Page, text: string) {
  await showCode(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
}
async function closeDrawer(page: Page, name: string) {
  const close = page
    .getByRole('button', { name, exact: true })
    .filter({ visible: true });
  if (await close.count()) await close.last().click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cm-content')).not.toBeEmpty();
});
test('annotations render accessible controls and persist custom labels without rewriting source', async ({
  page,
}, info) => {
  const code = `@label("Game title") @help("Shown at startup") export text: title = "Lab".
    @group("Player") @range(0, 10, 0.5) @label("Speed") input float: moveSpeed = 1.5.
    @group("Player") @multiline @placeholder("Write a note") input text: notes = "Hello".
    @color input text: tint = "#58a6ff".
    input dictionary<text,integer>: stats = {"hp": 5}.
    button "Show", do. print(title, moveSpeed, notes, tint, stats.hp). end button.`;
  await source(page, code);
  const open = page.getByRole('button', {
    name: 'Open inspector',
    exact: true,
  });
  if (await open.isVisible()) await open.click();
  await page
    .getByRole('textbox', { name: 'Game title', exact: true })
    .filter({ visible: true })
    .fill('Adventure');
  await closeDrawer(page, 'Close inspector');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Player', exact: true }),
  ).toBeVisible();
  const speed = page.getByRole('spinbutton', { name: 'Speed', exact: true });
  await speed.fill('2.5');
  await page
    .getByRole('textbox', { name: 'Notes', exact: true })
    .fill('Hello\nWorld');
  await page
    .getByRole('textbox', { name: 'Stats', exact: true })
    .fill('{"hp":8}');
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByRole('log')).toContainText(
    'Adventure 2.5 Hello\nWorld #58a6ff 8',
  );
  await expect(
    page.getByRole('slider', { name: 'Speed slider' }),
  ).toHaveAttribute('step', '0.5');
  await expect(page.getByLabel('Tint colour picker')).toHaveAttribute(
    'type',
    'color',
  );
  await expect(page.getByPlaceholder('Write a note')).toHaveJSProperty(
    'tagName',
    'TEXTAREA',
  );
  for (const control of [
    speed,
    page.getByRole('slider'),
    page.getByLabel('Tint colour picker'),
  ])
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '/tmp/language-lab-review/gdscript-' + info.project.name + '.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('.cm-content')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(speed).toHaveValue('2.5');
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByRole('log')).toContainText(
    'Adventure 2.5 Hello\nWorld #58a6ff 8',
  );
  await expect(page.locator('.cm-content')).toContainText('moveSpeed = 1.5');
});
test('worker lifecycle updates stop, restart and become stale; keyboard and pointer events stay on their surface', async ({
  page,
}) => {
  await source(
    page,
    `input float: elapsed = 0. on start, do. print("started"). end on.
    on update(float: deltaTime), do. elapsed = elapsed + deltaTime. end on.
    on keyDown(text: key), do. print("key", key). end on.
    on pointerDown(float: x, float: y), do. print("pointer"). end on.`,
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const elapsed = page.getByRole('spinbutton', {
    name: 'Elapsed',
    exact: true,
  });
  await expect
    .poll(async () => Number(await elapsed.inputValue()))
    .toBeGreaterThan(0.1);
  const surface = page.getByRole('group', { name: 'Program event surface' });
  await surface.click();
  await surface.press('k');
  await expect(page.getByRole('log')).toContainText('key k');
  await expect(page.getByRole('log')).toContainText('pointer');
  await expect(
    page.getByRole('log').getByText('started', { exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(elapsed).toBeDisabled();
  const stopped = await elapsed.inputValue();
  await page.waitForTimeout(150);
  await expect(elapsed).toHaveValue(stopped);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(elapsed).toBeEnabled();
  await source(page, 'print("changed").');
  await showApp(page);
  await expect(elapsed).toBeDisabled();
});
test('project JSON resources are selected in the Inspector and loaded with typed validation', async ({
  page,
}) => {
  const open = page.getByRole('button', { name: 'Open files', exact: true });
  if (await open.isVisible()) await open.click();
  await page
    .getByLabel('Import project archive')
    .first()
    .setInputFiles({
      name: 'resources.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(
        zipSync({
          'langlab.json': strToU8(
            JSON.stringify({
              schemaVersion: 1,
              name: 'Resources',
              entry: 'main.lang',
            }),
          ),
          'main.lang': strToU8(
            '@file("*.json") export resource: playerData = Resource("one.json"). record Player [text: name]. Player: player = loadResource(playerData). print(player.name).',
          ),
          'one.json': strToU8('{"name":"Lyra"}'),
          'two.json': strToU8('{"name":"Mira"}'),
        }),
      ),
    });
  await expect(page.locator('.cm-content')).toContainText('playerData');
  await closeDrawer(page, 'Close explorer');
  const inspector = page.getByRole('button', {
    name: 'Open inspector',
    exact: true,
  });
  if (await inspector.isVisible()) await inspector.click();
  await page
    .getByRole('combobox', { name: 'Player Data', exact: true })
    .filter({ visible: true })
    .selectOption('two.json');
  await closeDrawer(page, 'Close inspector');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Mira');
  await page.reload();
  await expect(page.locator('.cm-content')).not.toBeEmpty();
  if (await open.isVisible()) await open.click();
  await page
    .getByRole('combobox', { name: 'Project', exact: true })
    .filter({ visible: true })
    .selectOption({ label: 'Resources' });
  await closeDrawer(page, 'Close explorer');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Mira');
});
