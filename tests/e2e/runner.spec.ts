import { expect, test, type Page } from '@playwright/test';
async function choose(page: Page, source: string, name = 'game.lang') {
  await page.getByLabel('Open .lang file', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(source),
  });
}
async function projectCount(page: Page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === 'language-lab'))
      return 0;
    return new Promise<number>((accept, reject) => {
      const request = indexedDB.open('language-lab');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const count = db
          .transaction('projects')
          .objectStore('projects')
          .count();
        count.onsuccess = () => {
          db.close();
          accept(count.result);
        };
      };
    });
  });
}

test('direct file runner auto-runs without loading the editor or creating a workspace', async ({
  page,
}) => {
  const editorRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /CodeMirror|codemirror|src\/Editor|src\/db\.ts|src\/App\.tsx/.test(
        request.url(),
      )
    )
      editorRequests.push(request.url());
  });
  await page.goto('/?runner=1');
  await choose(
    page,
    'for i in range(2), do. print("hello", i, randomInteger(4,4)). end for.',
    'Hello world.lang',
  );
  await expect(page.getByRole('log')).toContainText('hello 0 4');
  await expect(page.getByRole('log')).toContainText('hello 1 4');
  expect(await projectCount(page)).toBe(0);
  expect(editorRequests).toEqual([]);
  await expect(page.locator('.cm-content')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('log')).not.toContainText('hello 0');
  expect(await projectCount(page)).toBe(0);
});

test('runner reuses annotated controls, exports, signals, live state and explicit project import', async ({
  page,
}, info) => {
  await page.goto('/?runner=1');
  const source =
    '@label("Game title") export text: title = "Lab". @range(1, 10, 1) input integer: amount = 2. input integer: total = 0. signal added(integer: count). on added(integer: count), do. print(title, count). end on. on start, do. print("Ready"). end on. button "Add", do. total = total + amount. emit added(total). end button.';
  await choose(page, source);
  await expect(page.getByRole('log')).toContainText('Ready');
  await page.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Lab 3');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Lab 6');
  await page.getByText('Program settings (exports)', { exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Game title', exact: true })
    .fill('Adventure');
  await expect(
    page.getByRole('button', { name: 'Add', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Adventure 3');
  expect(await projectCount(page)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await page
      .getByRole('spinbutton', { name: 'Amount', exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: '/tmp/language-lab-review/runner-' + info.project.name + '.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Save as project', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Project copy saved', exact: true }),
  ).toBeDisabled();
  expect(await projectCount(page)).toBe(1);
  await page
    .getByRole('button', { name: 'Open saved project in IDE', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText(
    'export text: title = "Lab"',
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Amount', exact: true }),
  ).toHaveValue('3');
  await expect(
    page.getByRole('spinbutton', { name: 'Total', exact: true }),
  ).toHaveValue('0');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Adventure 3');
});

test('IDE entry and desktop drop open a temporary file without changing the library', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.cm-content')).not.toBeEmpty();
  const before = await projectCount(page);
  const files = page.getByRole('button', { name: 'Open files', exact: true });
  if (await files.isVisible()) await files.click();
  await page
    .getByRole('button', { name: 'Open / Run .lang File', exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Language Lab Runner' }),
  ).toBeVisible();
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['print("dropped").'], 'dropped.lang'));
    window.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByRole('log')).toContainText('dropped');
  expect(await projectCount(page)).toBe(before);
});

test('file launches are handled when supported and replace old worker sessions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'launchQueue', {
      configurable: true,
      value: {
        setConsumer: (consumer: unknown) => {
          (window as unknown as { deliver: unknown }).deliver = consumer;
        },
      },
    });
  });
  await page.goto('/?runner=1');
  await choose(
    page,
    'input float: elapsed = 0. on update(float: delta), do. elapsed = elapsed + delta. end on.',
  );
  await expect
    .poll(async () =>
      Number(
        await page.getByRole('spinbutton', { name: 'Elapsed' }).inputValue(),
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stopped = await page
    .getByRole('spinbutton', { name: 'Elapsed' })
    .inputValue();
  await page.waitForTimeout(150);
  await expect(page.getByRole('spinbutton', { name: 'Elapsed' })).toHaveValue(
    stopped,
  );
  await page.evaluate(() => {
    (window as unknown as { deliver: (p: unknown) => void }).deliver({
      files: [
        {
          getFile: async () =>
            new File(['print("launched").'], 'launched.lang'),
        },
      ],
    });
  });
  await expect(page.getByRole('log')).toContainText('launched');
  await expect(page.getByRole('spinbutton', { name: 'Elapsed' })).toHaveCount(
    0,
  );
  expect(await projectCount(page)).toBe(0);
});

test('invalid files and unavailable dependencies report errors without storage or host access', async ({
  page,
}) => {
  await page.goto('/?runner=1');
  await choose(page, 'print(1).', 'wrong.txt');
  await expect(page.getByRole('alert')).toContainText('.lang extension');
  await choose(page, 'integer missing = 1.');
  await expect(page.getByRole('alert')).toContainText('game.lang:1:');
  await choose(page, 'import "./missing.lang" as missing.');
  await expect(page.getByRole('alert')).toContainText('Missing source module');
  await choose(page, 'dictionary: data = loadResource("data.json").');
  await expect(page.getByRole('alert')).toContainText('existing project JSON');
  await choose(page, 'print("recovered").');
  await expect(page.getByRole('log')).toContainText('recovered');
  expect(await projectCount(page)).toBe(0);
});

test('source downloads contain portable source and use the language MIME type', async ({
  page,
}) => {
  await page.goto('/?runner=1');
  const source = 'export integer: health = 100. print(health).\n';
  await choose(page, source, 'Portable game.lang');
  await page.getByText('Program settings (exports)', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Health', exact: true }).fill('7');
  await page
    .getByRole('button', { name: 'Save as project', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open saved project in IDE', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText('health = 100');
  const files = page.getByRole('button', { name: 'Open files', exact: true });
  if (await files.isVisible()) await files.click();
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob)
        (window as unknown as { lastDownloadType: string }).lastDownloadType =
          blob.type;
      return original(blob);
    };
  });
  await page.getByText('Selected file actions', { exact: true }).filter({ visible: true }).click();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download file', exact: true })
    .filter({ visible: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Portable game.lang');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile((await download.path())!, 'utf8')).toBe(source);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { lastDownloadType: string }).lastDownloadType,
    ),
  ).toBe('text/x-language-lab;charset=utf-8');
});
