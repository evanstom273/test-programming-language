import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { loadProject } from '../extensions/vscode/src/project';
import { compileProject, type Program } from '../src/language/analysis';
import { RuntimeSession } from '../src/language/runtime';
let program: Program;
beforeAll(async () => {
  program = compileProject(
    await loadProject(
      resolve('examples/emberfall/main.lang'),
      [resolve('examples/emberfall')],
      new Map(),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());
function game(danger = 1) {
  const s = new RuntimeSession(program, {
    modules: { [program.entryId]: { exportOverrides: { danger } } },
  });
  const click = (label: string) => {
    const b = s.snapshot().buttons.find((b) => b.label === label);
    expect(b, `button ${label} in ${s.snapshot().scene?.name}`).toBeTruthy();
    s.pressButton(b!.id);
  };
  const stat = (label: string) =>
    s
      .snapshot()
      .scene?.items.find((i) => i.kind === 'stat' && i.label === label);
  const progress = (label: string) =>
    s
      .snapshot()
      .scene?.items.find((i) => i.kind === 'progress' && i.label === label) as {
      value: number;
      maximum: number;
    };
  const input = (name: string, value: string | boolean) =>
    s.setInput(name, value);
  return { s, click, stat, progress, input };
}
it('starts on the title, normalizes names and keeps character inputs out of battle', () => {
  const g = game();
  g.click('Begin expedition');
  g.input('chosenName', '  Mira   of the   Ash ');
  g.input('calling', 'Arcanist');
  g.click('Light the lantern');
  expect(g.stat('Adventurer')).toMatchObject({ value: 'Mira of the' });
  expect(g.progress('Health').maximum).toBe(34);
  g.click('Enter the ruins');
  expect(g.s.snapshot().inputs).toHaveLength(0);
  expect(g.stat('Potions')).toMatchObject({ value: '4' });
  const hp = g.progress('Your health').value;
  g.click('Burst (2 focus)');
  expect(g.progress('Your health').value).toBe(hp);
  g.click('Drink potion');
  expect(g.progress('Your health').value).toBe(hp);
});
it.each(['Warden', 'Duelist', 'Arcanist'])(
  'can win a complete expedition with %s and replay cleanly',
  (calling) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const g = game();
    g.click('Begin expedition');
    g.input('calling', calling);
    g.click('Light the lantern');
    for (let floor = 1; floor <= 4; floor++) {
      g.click('Enter the ruins');
      for (
        let turn = 0;
        turn < 50 && g.s.snapshot().scene?.name === 'Battle';
        turn++
      ) {
        const hp = g.progress('Your health');
        const focus = g.progress('Focus').value;
        const intent = (g.stat('Enemy intent') as { value: string }).value;
        if (
          hp.value < hp.maximum * 0.6 &&
          (g.stat('Potions') as { value: string }).value !== '0'
        )
          g.click('Drink potion');
        else if (focus >= 2) g.click('Burst (2 focus)');
        else if (intent === 'Heavy blow') g.click('Guard');
        else g.click('Strike');
      }
      if (floor < 4) {
        expect(g.s.snapshot().scene?.name).toBe('Camp');
        g.click('Rest by the fire');
        const hp = g.progress('Health').value;
        g.click('Rest by the fire');
        expect(g.progress('Health').value).toBe(hp);
        g.click('Sharpen blade (8 gold)');
        g.click('Continue the journey');
      }
    }
    expect(g.s.snapshot().scene?.name).toBe('Dawn');
    expect(g.stat('Encounters won')).toMatchObject({ value: '4' });
    g.click('Another expedition');
    g.click('Light the lantern');
    expect(g.stat('Encounter')).toMatchObject({ value: '1' });
    expect(g.progress('Health').value).toBe(g.progress('Health').maximum);
  },
);
it('danger override can cause defeat; retry resets health and progression', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const g = game(3);
  g.click('Begin expedition');
  g.click('Light the lantern');
  g.input('route', 'SunkenVault');
  g.click('Enter the ruins');
  for (let i = 0; i < 30 && g.s.snapshot().scene?.name === 'Battle'; i++)
    g.click('Guard');
  expect(g.s.snapshot().scene?.name).toBe('Ashes');
  g.click('Try again');
  g.click('Light the lantern');
  expect(g.progress('Health').value).toBe(48);
});
it('vault rewards and shops preserve state without allowing free repeated purchases', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const g = game();
  g.click('Begin expedition');
  g.click('Light the lantern');
  g.input('route', 'SunkenVault');
  g.click('Enter the ruins');
  for (let i = 0; i < 10 && g.s.snapshot().scene?.name === 'Battle'; i++)
    g.click('Strike');
  expect(g.s.snapshot().scene?.name).toBe('Camp');
  expect(g.stat('Gold')).toMatchObject({ value: '14' });
  g.click('Buy potion (5 gold)');
  g.click('Sharpen blade (8 gold)');
  expect(g.stat('Gold')).toMatchObject({ value: '1' });
  const power = g.stat('Power');
  g.click('Sharpen blade (8 gold)');
  expect(g.stat('Power')).toEqual(power);
});
