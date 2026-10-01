import { PRIMITIVE_TYPES, type Parameter, type Value } from './ast';

export interface TypeDefinitions {
  enums: Map<string, { values: string[] }>;
  records: Map<string, Parameter[]>;
}
export function typeParts(type: string): { name: string; args: string[] } {
  const start = type.indexOf('<');
  if (start < 0) return { name: type, args: [] };
  const args: string[] = [];
  let depth = 0;
  let from = start + 1;
  for (let i = from; i < type.length - 1; i++) {
    if (type[i] === '<') depth++;
    if (type[i] === '>') depth--;
    if (type[i] === ',' && depth === 0) {
      args.push(type.slice(from, i));
      from = i + 1;
    }
  }
  args.push(type.slice(from, -1));
  return { name: type.slice(0, start), args };
}
export function validType(type: string, definitions: TypeDefinitions): boolean {
  const { name, args } = typeParts(type);
  if (args.length)
    return (
      (name === 'array' &&
        args.length === 1 &&
        validType(args[0], definitions)) ||
      (name === 'dictionary' &&
        args.length === 2 &&
        args[0] === 'text' &&
        validType(args[1], definitions))
    );
  return (
    PRIMITIVE_TYPES.has(name.toLowerCase()) ||
    definitions.enums.has(name) ||
    definitions.records.has(name)
  );
}
export function isObject(value: Value): value is Record<string, Value> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isVector(
  value: Value,
  dimension?: number,
): value is Record<string, number | string> {
  if (!isObject(value)) return false;
  const n =
    dimension ??
    (value.$type === 'vector2' ? 2 : value.$type === 'vector3' ? 3 : 0);
  const axes = n === 2 ? ['x', 'y'] : ['x', 'y', 'z'];
  return (
    n > 0 &&
    value.$type === 'vector' + n &&
    Object.keys(value).length === n + 1 &&
    axes.every((k) => typeof value[k] === 'number' && Number.isFinite(value[k]))
  );
}
export function matchesType(
  type: string,
  value: Value,
  definitions: TypeDefinitions,
  depth = 0,
): boolean {
  if (depth > 64) return false;
  const { name, args } = typeParts(type);
  if (name === 'array')
    return (
      Array.isArray(value) &&
      (!args.length ||
        value.every((v) => matchesType(args[0], v, definitions, depth + 1)))
    );
  if (name === 'dictionary')
    return (
      isObject(value) &&
      (!args.length ||
        Object.values(value).every((v) =>
          matchesType(args[1], v, definitions, depth + 1),
        ))
    );
  if (name.toLowerCase() === 'integer')
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      Number.isFinite(value)
    );
  if (name.toLowerCase() === 'float')
    return typeof value === 'number' && Number.isFinite(value);
  if (name.toLowerCase() === 'text') return typeof value === 'string';
  if (name.toLowerCase() === 'boolean') return typeof value === 'boolean';
  if (name === 'resource')
    return (
      isObject(value) &&
      value.$type === 'resource' &&
      typeof value.id === 'string' &&
      typeof value.path === 'string' &&
      Object.keys(value).length === 3
    );
  if (name === 'color')
    return (
      typeof value === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value)
    );
  if (name === 'vector2' || name === 'vector3')
    return isVector(value, name === 'vector2' ? 2 : 3);
  const variants = definitions.enums.get(name)?.values;
  if (variants) return typeof value === 'string' && variants.includes(value);
  const fields = definitions.records.get(name);
  return (
    !!fields &&
    isObject(value) &&
    Object.keys(value).length === fields.length &&
    fields.every(
      (f) =>
        Object.hasOwn(value, f.name) &&
        matchesType(f.typeName, value[f.name], definitions, depth + 1),
    )
  );
}
export function controlForType(
  type: string,
  enums: Map<string, unknown>,
): 'number' | 'text' | 'boolean' | 'enum' | 'array' | 'object' {
  if (enums.has(type)) return 'enum';
  const { name } = typeParts(type);
  if (name === 'integer' || name === 'float') return 'number';
  if (name === 'boolean') return 'boolean';
  if (name === 'array') return 'array';
  if (name === 'text' || name === 'color' || name === 'resource') return 'text';
  return 'object';
}
