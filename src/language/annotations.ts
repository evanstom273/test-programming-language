import type { Statement } from './ast';
import { LanguageError } from './lexer';
export interface FieldHints {
  range?: { minimum: number; maximum: number; step: number };
  group?: string;
  help?: string;
  multiline?: boolean;
  placeholder?: string;
  file?: string;
  color?: boolean;
}
/** Pure metadata validation: annotation arguments never execute language expressions. */
export function declarationHints(
  statement: Extract<Statement, { kind: 'declare' }>,
): { label?: string; hints: FieldHints } {
  const hints: FieldHints = {};
  let label: string | undefined;
  const seen = new Set<string>();
  for (const annotation of statement.annotations ?? []) {
    const { name, args } = annotation;
    const fail = (message: string): never => {
      throw new LanguageError(
        message,
        annotation.line,
        annotation.column,
        annotation.span,
      );
    };
    if (seen.has(name)) fail('Duplicate annotation @' + name + '.');
    seen.add(name);
    if (name === 'range') {
      if (!['integer', 'float'].includes(statement.typeName))
        fail('@range requires integer or float.');
      if (
        args.length < 2 ||
        args.length > 3 ||
        !args.every((a) => typeof a === 'number' && Number.isFinite(a))
      )
        fail('@range expects minimum, maximum, and optional step numbers.');
      const [
        minimum,
        maximum,
        step = statement.typeName === 'integer' ? 1 : 0.01,
      ] = args as number[];
      if (
        minimum > maximum ||
        step <= 0 ||
        (statement.typeName === 'integer' &&
          ![minimum, maximum, step].every(Number.isSafeInteger))
      )
        fail('Invalid @range bounds or step.');
      hints.range = { minimum, maximum, step };
    } else if (
      ['label', 'help', 'group', 'placeholder', 'file'].includes(name)
    ) {
      if (
        args.length !== 1 ||
        typeof args[0] !== 'string' ||
        args[0].length > 1024
      )
        fail('@' + name + ' expects one text literal (up to 1024 characters).');
      if (
        ['placeholder', 'file'].includes(name) &&
        statement.typeName !== 'text' &&
        !(name === 'file' && statement.typeName === 'resource')
      )
        fail('@' + name + ' requires text.');
      if (name === 'label') label = args[0] as string;
      else
        hints[name as 'group' | 'help' | 'placeholder' | 'file'] =
          args[0] as string;
    } else if (name === 'multiline' || name === 'color') {
      if (
        args.length ||
        !['text', ...(name === 'color' ? ['color'] : [])].includes(
          statement.typeName,
        )
      )
        fail('@' + name + ' requires a text declaration and no arguments.');
      hints[name] = true;
    } else fail('Unknown annotation @' + name + '.');
  }
  if (statement.typeName === 'resource' && hints.file === undefined)
    hints.file = '*';
  if (statement.typeName === 'color') hints.color = true;
  if (
    [hints.multiline, hints.file !== undefined, hints.color].filter(Boolean)
      .length > 1
  )
    throw new LanguageError(
      'Use only one of @multiline, @file, and @color.',
      statement.line,
      statement.column,
      statement.span,
    );
  return { label, hints };
}
export function matchingAssets(paths: string[], pattern: string): string[] {
  const patterns = pattern.split(',').map((p) => p.trim());
  return paths.filter((path) =>
    patterns.some((p) => {
      const escaped = p
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      return new RegExp('^' + escaped + '$', 'i').test(
        p.includes('/') ? path : path.split('/').at(-1)!,
      );
    }),
  );
}
