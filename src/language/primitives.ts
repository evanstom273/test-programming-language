import type { Value } from './ast';
import { isVector } from './types';
import { VALUE_LIMITS } from './program';
export function primitive(name: string, args: Value[]): Value {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (
    ['abs', 'floor', 'ceil', 'round', 'min', 'max', 'clamp', 'lerp'].includes(
      name,
    )
  ) {
    if (!args.every((v) => typeof v === 'number' && Number.isFinite(v)))
      fail(name + ' expects finite numbers.');
    const [a, b, c] = args as number[];
    if (name === 'clamp' && b > c) fail('clamp minimum cannot exceed maximum.');
    const value =
      name === 'abs'
        ? Math.abs(a)
        : name === 'floor'
          ? Math.floor(a)
          : name === 'ceil'
            ? Math.ceil(a)
            : name === 'round'
              ? Math.round(a)
              : name === 'min'
                ? Math.min(a, b)
                : name === 'max'
                  ? Math.max(a, b)
                  : name === 'clamp'
                    ? Math.min(c, Math.max(b, a))
                    : a + (b - a) * c;
    if (!Number.isFinite(value)) fail(name + ' result must be finite.');
    return value;
  }
  if (['trim', 'lower', 'upper', 'split', 'contains'].includes(name)) {
    if (
      typeof args[0] !== 'string' ||
      (args.length > 1 && typeof args[1] !== 'string')
    )
      fail(name + ' expects text arguments.');
    const [a, b] = args as string[];
    if (name === 'trim') return a.trim();
    if (name === 'lower') return a.toLowerCase();
    if (name === 'upper') return a.toUpperCase();
    if (name === 'contains') return a.includes(b);
    const parts: string[] = [];
    if (b === '') {
      for (const character of a) {
        if (parts.length === VALUE_LIMITS.collection)
          fail('split exceeds runtime resource limits.');
        parts.push(character);
      }
    } else parts.push(...a.split(b, VALUE_LIMITS.collection + 1));
    if (parts.length > VALUE_LIMITS.collection)
      fail('split exceeds runtime resource limits.');
    return parts;
  }
  if (name === 'join') {
    if (
      !Array.isArray(args[0]) ||
      !args[0].every((v) => typeof v === 'string') ||
      typeof args[1] !== 'string'
    )
      fail('join expects an array of text and a text separator.');
    const parts = args[0] as string[],
      separator = args[1] as string;
    const length =
      parts.reduce((n, part) => n + part.length, 0) +
      Math.max(0, parts.length - 1) * separator.length;
    if (length > VALUE_LIMITS.text)
      fail('join exceeds runtime resource limits.');
    return parts.join(separator);
  }
  if (name === 'size') {
    const value = args[0];
    if (typeof value === 'string') {
      let count = 0;
      for (const _ of value) count++;
      return count;
    }
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object' && !('$type' in value))
      return Object.keys(value).length;
    return fail('size expects text, an array or a dictionary.');
  }
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
