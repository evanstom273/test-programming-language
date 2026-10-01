import type { ExportOverrides, ExportValue, Value } from './ast';

/** Shared UI metadata. Components never need access to the AST or interpreter. */
export interface ProgramField {
  name: string;
  label?: string;
  fileId?: string;
  path?: string;
  computedDefault?: boolean;
  typeName: string;
  control: 'number' | 'text' | 'boolean' | 'enum' | 'array';
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
  modules?: Record<string, { exportOverrides?: ExportOverrides; inputOverrides?: ExportOverrides }>;
  cancelled?: () => boolean;
  maxSteps?: number;
}

export interface ProgramSnapshot {
  inputs: ProgramField[];
  inputValues: ExportOverrides;
  buttons: ProgramButton[];
  output: string[];
}

export function labelFor(name: string): string {
  return name
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isLanguageValue(value: unknown): value is Value {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every(isLanguageValue));
}

