import { describe, expect, it } from 'vitest';
import { runSource } from '../src/language/runtime';

describe('Python-style range loops', () => {
  it('supports range(stop) with a zero start and exclusive stop', () => {
    expect(
      runSource('for x in range(5), do. print(x). end for.').output,
    ).toEqual(['0', '1', '2', '3', '4']);
  });

  it('supports range(start, stop) with an exclusive stop', () => {
    expect(
      runSource('for x in range(2, 5), do. print(x). end for.').output,
    ).toEqual(['2', '3', '4']);
  });

  it('supports positive and negative steps', () => {
    expect(
      runSource('for x in range(1, 10, 2), do. print(x). end for.').output,
    ).toEqual(['1', '3', '5', '7', '9']);

    expect(
      runSource('for x in range(10, 0, -2), do. print(x). end for.').output,
    ).toEqual(['10', '8', '6', '4', '2']);
  });

  it('allows empty ranges', () => {
    expect(
      runSource('for x in range(3, 3), do. print(x). end for.').output,
    ).toEqual([]);
  });

  it('requires one to three integer arguments and a non-zero step', () => {
    expect(() => runSource('for x in range(), do. print(x). end for.')).toThrow(
      /range expects 1 to 3 arguments/,
    );
    expect(() =>
      runSource('for x in range(1, 2, 3, 4), do. print(x). end for.'),
    ).toThrow(/range expects 1 to 3 arguments/);
    expect(() =>
      runSource('for x in range(1.5, 4), do. print(x). end for.'),
    ).toThrow(/range expects integer/);
    expect(() =>
      runSource('for x in range(1, 4, 0), do. print(x). end for.'),
    ).toThrow(/range step cannot be zero/);
  });

  it('keeps the existing typed from/to loop inclusive', () => {
    expect(
      runSource(
        'for integer: x from 1 to 3, do. print(x). end for.',
      ).output,
    ).toEqual(['1', '2', '3']);
  });
});
