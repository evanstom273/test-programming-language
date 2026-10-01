import { test, expect } from '@playwright/test';
test('scene navigation renders live state and discards inactive event handlers', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await expect(editor).not.toBeEmpty();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(`integer: visits = 0.
 on start, do. go to Creator. end on.
 on keyDown(text: key), do. go to Arena. end on.
 scene Menu. end scene.
 scene Creator.
 input text: name = "Lyra".
 on enter, do. visits = visits + 1. print("Entered", visits). end on.
 on keyDown(text: key), do. print("OLD SCENE"). end on.
 button "Continue", do. go to Arena. end button.
 end scene.
 scene Arena.
 heading "Arena battle".
 stat "Hero", name.
 progress "Health", visits, 10.
 button "Back", do. go to Creator. end button.
 end scene.`);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('log')).toHaveText('Entered 1');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Mira');
  await page.getByRole('group', { name: 'Program event surface' }).press('x');
  await expect(
    page.getByRole('heading', { name: 'Arena battle' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('log')).not.toContainText('OLD SCENE');
  await expect(page.getByText('Mira', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('Mira');
  await expect(page.getByRole('log')).toHaveText('Entered 2');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
