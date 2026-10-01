import type { Page } from '@playwright/test';
export async function showCode(page: Page) {
  if (!(await page.locator('.cm-content').isVisible()))
    await page.getByRole('button', { name: 'Code', exact: true }).click();
}
export async function showApp(page: Page) {
  if (
    !(await page
      .getByRole('region', { name: 'Running app', exact: true })
      .isVisible())
  )
    await page.getByRole('button', { name: 'App', exact: true }).click();
}
