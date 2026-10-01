import { expect, test, type Page } from '@playwright/test';
import { download, openOffline } from '../helpers/standalone';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

async function runner(page: Page, code: string) {
  await page.goto('/?runner=1');
  await page.getByLabel('Open .lang file', { exact: true }).setInputFiles({
    name: 'My calculator.lang',
    mimeType: 'text/plain',
    buffer: Buffer.from(code),
  });
}

test('downloaded HTML is the complete interactive app offline, without the IDE or installation', async ({
  page,
  browser,
}, info) => {
  await runner(
    page,
    `enum Operation [add, multiply].
    export text: title = "Calculator".
    @range(0, 100, 1) input integer: numberOne = 10.
    input integer: numberTwo = 5.
    input Operation: operation = add.
    integer: count = 0.
    signal calculated(integer: value).
    on calculated(integer: value), do. print(title, value, count). end on.
    function calculate().
      if operation is multiply, do. return numberOne * numberTwo.
      else, do. return numberOne + numberTwo. end if.
    end function.
    button "Calculate", do. count = count + 1. emit calculated(calculate()). end button.
    print("</script><script>window.pwned=true</script> 🐉").`,
  );
  await expect(
    page.getByRole('button', { name: 'Calculate', exact: true }),
  ).toBeEnabled();
  await page.getByText('Program settings (exports)', { exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Shared calculator');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page
    .getByRole('spinbutton', { name: 'Number One', exact: true })
    .fill('99');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const path = await download(page, info);
  const html = await readFile(path, 'utf8');
  expect(html).not.toContain('inputOverrides');
  await page.close();
  const { context, app, external, errors } = await openOffline(
    browser,
    path,
    info,
  );
  try {
    await expect(
      app.getByRole('heading', { name: 'My calculator', exact: true }),
    ).toBeVisible();
    await expect(
      app.getByRole('spinbutton', { name: 'Number One', exact: true }),
    ).toHaveValue('10');
    await expect(app.getByRole('log')).toContainText(
      '</script><script>window.pwned=true</script> 🐉',
    );
    expect(
      await app.evaluate(
        () => (window as unknown as { pwned?: boolean }).pwned,
      ),
    ).toBeUndefined();
    await app.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(app.getByRole('log')).toContainText('Shared calculator 15 1');
    await app
      .getByRole('spinbutton', { name: 'Number One', exact: true })
      .fill('7');
    await app
      .getByRole('combobox', { name: 'Operation', exact: true })
      .selectOption('multiply');
    await app.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(app.getByRole('log')).toContainText('Shared calculator 35 2');
    await app.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(
      app.getByRole('spinbutton', { name: 'Number One', exact: true }),
    ).toHaveValue('10');
    await app.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(app.getByRole('log')).toContainText('Shared calculator 15 1');
    await expect(app.getByRole('log')).not.toContainText('35 2');
    expect(
      await app.locator('input[type=file], .cm-content, aside').count(),
    ).toBe(0);
    await expect(app.getByText('Inspector', { exact: true })).toHaveCount(0);
    expect(await app.evaluate(() => indexedDB.databases())).toEqual([]);
    expect(
      await app.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await app
        .getByRole('button', { name: 'Calculate', exact: true })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(app.workers().length).toBe(1);
    await app.screenshot({
      path: info.outputPath('standalone.png'),
      fullPage: true,
    });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('project export bundles modules and configured resources without running unrelated files', async ({
  page,
  browser,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.cm-content')).not.toBeEmpty();
  const open = page.getByRole('button', { name: 'Open files', exact: true });
  if (await open.isVisible()) await open.click();
  await page
    .getByLabel('Import project archive')
    .first()
    .setInputFiles({
      name: 'project.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(
        zipSync({
          'langlab.json': strToU8(
            JSON.stringify({
              schemaVersion: 1,
              name: 'Resource app',
              entry: 'main.lang',
            }),
          ),
          'main.lang': strToU8(
            'import "./lib/maths.lang" as maths. @file("*.json") export resource: data = Resource("one.json"). record Player [text: name, integer: score]. Player: player = loadResource(data). print(player.name, maths.double(player.score)).',
          ),
          'lib/maths.lang': strToU8(
            'public function double(integer: value). return value * 2. end function.',
          ),
          'one.json': strToU8('{"name":"Lyra","score":4}'),
          'two.json': strToU8('{"name":"Mira","score":7}'),
          'unused.lang': strToU8(
            'This is not valid source and must not execute.',
          ),
          'image.bin': new Uint8Array([0, 255, 127]),
        }),
      ),
    });
  await expect(page.locator('.cm-content')).toContainText('loadResource');
  const close = page
    .getByRole('button', { name: 'Close explorer', exact: true })
    .filter({ visible: true });
  if (await close.count()) await close.last().click();
  const inspector = page.getByRole('button', {
    name: 'Open inspector',
    exact: true,
  });
  if (await inspector.isVisible()) await inspector.click();
  await page
    .getByRole('combobox', { name: 'Data', exact: true })
    .filter({ visible: true })
    .selectOption('two.json');
  const closeInspector = page
    .getByRole('button', { name: 'Close inspector', exact: true })
    .filter({ visible: true });
  if (await closeInspector.count()) await closeInspector.last().click();
  if (await open.isVisible()) await open.click();
  await page
    .getByText('Project actions', { exact: true })
    .filter({ visible: true })
    .click();
  const path = await download(page, info);
  await page.close();
  const { context, app, external, errors } = await openOffline(
    browser,
    path,
    info,
  );
  try {
    await expect(app.getByRole('log')).toHaveText('Mira 14');
    await app.reload();
    await expect(app.getByRole('log')).toHaveText('Mira 14');
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('standalone lifecycle, Stop, restart, output and execution limits remain worker isolated', async ({
  page,
  browser,
}, info) => {
  await runner(
    page,
    `input float: elapsed = 0.
    on start, do. print("started"). end on.
    on update(float: delta), do. elapsed = elapsed + delta. end on.
    on keyDown(text: key), do. print(key). end on.
    button "Flood", do. for i in range(2000), do. print(i). end for. end button.
    button "Loop", do. while true, do. end while. end button.`,
  );
  const path = await download(page, info);
  await page.close();
  const { context, app, external, errors } = await openOffline(
    browser,
    path,
    info,
  );
  try {
    const elapsed = app.getByRole('spinbutton', {
      name: 'Elapsed',
      exact: true,
    });
    await expect
      .poll(async () => Number(await elapsed.inputValue()))
      .toBeGreaterThan(0);
    const surface = app.getByRole('group', { name: 'Program event surface' });
    await surface.press('k');
    await expect(app.getByRole('log')).toContainText('k');
    await app.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(elapsed).toBeDisabled();
    await expect.poll(() => app.workers().length).toBe(0);
    const stopped = await elapsed.inputValue();
    await app.waitForTimeout(100);
    await expect(elapsed).toHaveValue(stopped);
    await app.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(elapsed).toBeEnabled();
    await app.getByRole('button', { name: 'Flood', exact: true }).click();
    await expect(app.getByRole('log')).toContainText('Output limit reached');
    await expect(app.getByRole('log').locator(':scope > div')).toHaveCount(
      1001,
    );
    await app.getByRole('button', { name: 'Loop', exact: true }).click();
    await expect(app.getByRole('alert')).toContainText('too many operations');
    await app.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(app.getByRole('log')).toHaveText('started');
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('export reports analysis errors and never runs a computed export to discover configuration', async ({
  page,
}, info) => {
  await runner(page, 'integer missing = 1.');
  await page
    .getByRole('button', { name: 'Download standalone HTML', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('My calculator.lang:1:');
  await expect(
    page.getByRole('button', { name: 'Download standalone HTML', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Open .lang file', { exact: true }).setInputFiles({
    name: 'Computed.lang',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'function stuck(). while true, do. end while. end function. export integer: number = stuck().',
    ),
  });
  await download(page, info);
});
