import type { FieldHints } from './annotations';
import type { ExportOverrides, ExportValue, Value } from './ast';

/** Shared UI metadata. Components never need access to the AST or interpreter. */
export interface ProgramField {
  name: string;
  label?: string;
  variableName?: string;
  hints?: FieldHints;
  assets?: string[];
  assetIds?: Record<string, string>;
  fileId?: string;
  path?: string;
  computedDefault?: boolean;
  typeName: string;
  control: 'number' | 'text' | 'boolean' | 'enum' | 'array' | 'object';
  defaultValue: ExportValue;
  options?: string[];
}

export interface ProgramButton {
  id: string;
  label: string;
}

export interface ProgramOptions {
  exportOverrides?: ExportOverrides;
  inputOverrides?: ExportOverrides;
  modules?: Record<
    string,
    { exportOverrides?: ExportOverrides; inputOverrides?: ExportOverrides }
  >;
  cancelled?: () => boolean;
  maxSteps?: number;
}

export interface ProgramSnapshot {
  inputs: ProgramField[];
  inputValues: ExportOverrides;
  buttons: ProgramButton[];
  output: string[];
  events: string[];
}

export function labelFor(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isLanguageValue(value: unknown): value is Value {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++count > 20_000 || item.depth > 64) return false;
    const v = item.value;
    if (
      v === null ||
      typeof v === 'string' ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v))
    )
      continue;
    if (
      !v ||
      typeof v !== 'object' ||
      (!Array.isArray(v) &&
        ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
    )
      return false;
    const children = Array.isArray(v) ? v : Object.values(v);
    if (children.length > 10_000) return false;
    for (const child of children)
      pending.push({ value: child, depth: item.depth + 1 });
  }
  return true;
}
