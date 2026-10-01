import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgramSession, runSource } from '../src/language/runtime';

describe('randomInteger built-in', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an inclusive integer in the requested range', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.999999);

    expect(runSource('print(randomInteger(3, 7)).').output).toEqual(['3']);
    expect(runSource('print(randomInteger(3, 7)).').output).toEqual(['7']);
  });

  it('works inside persistent interactive game state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const session = new ProgramSession(
      'integer: health = 20. button "Hit", do. integer: damage = randomInteger(4, 8). health = health - damage. print("Damage:", damage, "Health:", health). end button.',
    );

    session.pressButton('button-0');
    session.pressButton('button-0');

    expect(session.snapshot().output).toEqual([
      'Damage: 6 Health: 14',
      'Damage: 6 Health: 8',
    ]);
  });

  it('validates arity, integer bounds, ordering, and reserved name', () => {
    expect(() => runSource('print(randomInteger(1)).')).toThrow(
      /exactly 2 arguments/,
    );
    expect(() => runSource('print(randomInteger(1, 2.5)).')).toThrow(
      /integer minimum and maximum/,
    );
    expect(() => runSource('print(randomInteger(10, 1)).')).toThrow(
      /minimum cannot be greater/,
    );
    expect(
      () =>
        new ProgramSession(
          'function randomInteger(integer: first, integer: second). return first. end function.',
        ),
    ).toThrow(/built in/);
  });
});

describe('randomInteger with static analysis and modules', () => {
  afterEach(() => vi.restoreAllMocks());
  it('does not sample randomness while discovering computed Inspector defaults', async () => {
    const { inspectSource } = await import('../src/language/runtime');
    const random = vi.spyOn(Math, 'random');
    expect(
      inspectSource('export integer: roll = randomInteger(1, 6).')[0],
    ).toMatchObject({ name: 'roll', computedDefault: true });
    expect(random).not.toHaveBeenCalled();
  });
  it('works in public imported functions and keeps the imported module state', async () => {
    const { compileProject } = await import('../src/language/analysis');
    const { RuntimeSession } = await import('../src/language/runtime');
    const { singleFileSnapshot } = await import('../src/workspace/model');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const p = singleFileSnapshot(
      'import "./dice.lang" as dice. button "Roll", do. print(dice.roll()). end button.',
    );
    p.files.push({
      ...p.files[0],
      id: 'dice',
      path: 'dice.lang',
      name: 'dice.lang',
      content:
        'integer: total = 0. public function roll(). total = total + randomInteger(1, 6). return total. end function.',
    });
    const session = new RuntimeSession(compileProject(p));
    session.pressButton('button-0');
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['4', '8']);
  });
});
