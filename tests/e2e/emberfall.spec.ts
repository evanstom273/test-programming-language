import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { openOffline } from '../helpers/standalone';
test.beforeAll(() => {
  execFileSync('npm', ['run', 'example:emberfall'], { stdio: 'pipe' });
});
test('standalone Emberfall can be won and replayed without the IDE', async ({
  browser,
}, info) => {
  const { context, app, external, errors } = await openOffline(
    browser,
    resolve('dist/emberfall/Emberfall.html'),
    info,
  );
  try {
    await app
      .getByRole('button', { name: 'Begin expedition', exact: true })
      .click();
    await app
      .getByRole('textbox', { name: 'Hero name', exact: true })
      .fill('Mira');
    await app
      .getByRole('button', { name: 'Light the lantern', exact: true })
      .click();
    await expect(app.getByText('Mira', { exact: true })).toBeVisible();
    const value = async (label: string) =>
      Number(
        await app
          .getByRole('progressbar', { name: label, exact: true })
          .getAttribute('aria-valuenow'),
      );
    for (let encounter = 1; encounter <= 4; encounter++) {
      await app
        .getByRole('button', { name: 'Enter the ruins', exact: true })
        .click();
      await expect(
        app.getByRole('button', { name: 'Strike', exact: true }),
      ).toBeEnabled();
      await expect(
        app.getByRole('textbox', { name: 'Hero name', exact: true }),
      ).toHaveCount(0);
      for (let turn = 0; turn < 50; turn++) {
        if (
          !(await app
            .getByRole('button', { name: 'Strike', exact: true })
            .count())
        )
          break;
        const hp = await value('Your health');
        const focus = await value('Focus');
        const potions = Number(
          await app
            .getByText('Potions', { exact: true })
            .locator('..')
            .locator('p')
            .last()
            .innerText(),
        );
        const heavy = await app
          .getByText('Heavy blow', { exact: true })
          .count();
        const action =
          hp < 26 && potions > 0
            ? 'Drink potion'
            : focus >= 2
              ? 'Burst (2 focus)'
              : heavy
                ? 'Guard'
                : 'Strike';
        await app.getByRole('button', { name: action, exact: true }).click();
        // Every accepted action changes state or navigates; wait for its worker result.
        await expect
          .poll(async () => ({
            hp: await app
              .getByRole('progressbar', { name: 'Your health', exact: true })
              .getAttribute('aria-valuenow', { timeout: 500 })
              .catch(() => null),
            focus: await app
              .getByRole('progressbar', { name: 'Focus', exact: true })
              .getAttribute('aria-valuenow', { timeout: 500 })
              .catch(() => null),
          }))
          .not.toEqual({ hp: String(hp), focus: String(focus) });
      }
      if (encounter < 4) {
        await expect(
          app.getByRole('heading', { name: 'A pocket of warmth' }),
        ).toBeVisible();
        await app
          .getByRole('button', { name: 'Rest by the fire', exact: true })
          .click();
        await app
          .getByRole('button', { name: 'Sharpen blade (8 gold)', exact: true })
          .click();
        await app
          .getByRole('button', { name: 'Continue the journey', exact: true })
          .click();
      }
    }
    await expect(
      app.getByRole('heading', { name: 'The beacon burns again' }),
    ).toBeVisible();
    expect(
      await app.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await app.screenshot({
      path: info.outputPath('emberfall-victory.png'),
      fullPage: true,
    });
    await app
      .getByRole('button', { name: 'Another expedition', exact: true })
      .click();
    await expect(
      app.getByRole('textbox', { name: 'Hero name', exact: true }),
    ).toHaveValue('Mira');
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
