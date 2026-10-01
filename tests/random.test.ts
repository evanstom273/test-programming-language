import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgramSession, runSource } from '../src/language/runtime';

describe('randomInteger built-in', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an inclusive integer in the requested range', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999999);

    expect(runSource('print(randomInteger(3, 7)).').output).toEqual(['3']);
    expect(runSource('print(randomInteger(3, 7)).').output).toEqual(['7']);
  });

  it('works inside persistent interactive game state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const session = new ProgramSession(
      'integer: health = 20. button "Hit", do. integer: damage = randomInteger(4, 8). health = health - damage. print("Damage:", damage, "Health:", health). end button.'
    );

    session.pressButton('button-0');
    session.pressButton('button-0');

    expect(session.snapshot().output).toEqual([
      'Damage: 6 Health: 14',
      'Damage: 6 Health: 8'
    ]);
  });

  it('validates arity, integer bounds, ordering, and reserved name', () => {
    expect(() => runSource('print(randomInteger(1)).')).toThrow(/exactly 2 arguments/);
    expect(() => runSource('print(randomInteger(1, 2.5)).')).toThrow(/integer minimum and maximum/);
    expect(() => runSource('print(randomInteger(10, 1)).')).toThrow(/minimum cannot be greater/);
    expect(() => new ProgramSession('function randomInteger(integer: first, integer: second). return first. end function.')).toThrow(/built in/);
  });
});
