import type { Value } from './ast';
import { isVector } from './types';
export function primitive(name: string, args: Value[]): Value {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (name === 'Vector2' || name === 'Vector3') {
    if (!args.every((v) => typeof v === 'number' && Number.isFinite(v)))
      fail(name + ' expects finite numbers.');
    return {
      $type: name.toLowerCase(),
      x: args[0],
      y: args[1],
      ...(name === 'Vector3' ? { z: args[2] } : {}),
    };
  }
  if (name === 'Color') {
    if (
      !args.every(
        (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1,
      )
    )
      fail('Color channels must be between 0 and 1.');
    return (
      '#' +
      (args as number[])
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }
  if (name === 'parseJSON') {
    if (typeof args[0] !== 'string') fail('parseJSON expects text.');
    try {
      return JSON.parse(args[0] as string) as Value;
    } catch {
      return fail('Invalid JSON.');
    }
  }
  if (name === 'toJSON') return JSON.stringify(args[0]);
  const [a, b] = args;
  if (!isVector(a)) return fail(name + ' expects a vector.');
  const axes = a.$type === 'vector2' ? ['x', 'y'] : ['x', 'y', 'z'];
  const magnitude = Math.hypot(...axes.map((k) => a[k] as number));
  if (name === 'length') return magnitude;
  if (name === 'normalized')
    return {
      ...a,
      ...Object.fromEntries(
        axes.map((k) => [
          k,
          magnitude === 0 ? 0 : (a[k] as number) / magnitude,
        ]),
      ),
    };
  if (name === 'dot') {
    if (!isVector(b) || a.$type !== b.$type)
      return fail('dot expects matching vector dimensions.');
    return axes.reduce(
      (sum, k) => sum + (a[k] as number) * (b[k] as number),
      0,
    );
  }
  return fail('Unknown primitive: ' + name);
}
export function vectorOperation(
  operator: string,
  left: Value,
  right: Value,
): Value | undefined {
  if (
    operator === 'plus' &&
    (typeof left === 'string' || typeof right === 'string')
  )
    return undefined;
  if (!isVector(left) && !isVector(right)) return undefined;
  if (operator === 'is' || operator === 'is not') return undefined;
  if (typeof left === 'number' && operator === 'times')
    return vectorOperation(operator, right, left);
  if (!isVector(left))
    throw new Error('Vector operation needs a vector on the left.');
  const axes = left.$type === 'vector2' ? ['x', 'y'] : ['x', 'y', 'z'];
  if (
    (operator === 'plus' || operator === 'minus') &&
    isVector(right) &&
    left.$type === right.$type
  )
    return {
      ...left,
      ...Object.fromEntries(
        axes.map((k) => [
          k,
          (left[k] as number) +
            (operator === 'plus' ? 1 : -1) * (right[k] as number),
        ]),
      ),
    };
  if (
    (operator === 'times' || operator === 'divided by') &&
    typeof right === 'number' &&
    (operator !== 'divided by' || right !== 0)
  )
    return {
      ...left,
      ...Object.fromEntries(
        axes.map((k) => [
          k,
          operator === 'times'
            ? (left[k] as number) * right
            : (left[k] as number) / right,
        ]),
      ),
    };
  throw new Error('Unsupported vector operation or mismatched dimensions.');
}
