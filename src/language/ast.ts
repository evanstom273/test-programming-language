import type { SourceSpan } from './diagnostics';

export type Value = number | string | boolean | Value[] | null;
export type ExportValue = number | string | boolean | Value[];
export type ExportOverrides = Record<string, ExportValue>;

export type TypeName = string;
export type Located = { line: number; column: number; span: SourceSpan };

export type Expression = Located & (
  | { kind: 'literal'; value: Value }
  | { kind: 'identifier'; name: string }
  | { kind: 'array'; values: Expression[] }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'call'; name: string; args: Expression[] }
  | { kind: 'unary'; operator: 'not' | 'negative'; value: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
);

export interface Parameter {
  span: SourceSpan;
  typeName: TypeName;
  name: string;
  line: number;
  column: number;
}

interface IfBranch {
  condition: Expression;
  body: Statement[];
}

export type Statement = Located & (
  | { kind: 'import'; path: string; alias: string }
  | { kind: 'enum'; name: string; values: string[] }
  | { kind: 'declare'; typeName: TypeName; name: string; value: Expression; exposure: 'export' | 'input' | null }
  | { kind: 'button'; label: string; body: Statement[] }
  | { kind: 'assign'; name: string; value: Expression }
  | { kind: 'print'; values: Expression[] }
  | { kind: 'if'; branches: IfBranch[]; elseBody: Statement[] | null }
  | { kind: 'while'; condition: Expression; body: Statement[] }
  | { kind: 'forEach'; itemName: string; iterable: Expression; body: Statement[] }
  | { kind: 'forRange'; typeName: TypeName; itemName: string; start: Expression; end: Expression; step: Expression | null; body: Statement[] }
  | { kind: 'forPythonRange'; itemName: string; args: Expression[]; body: Statement[] }
  | { kind: 'function'; name: string; public?: boolean; parameters: Parameter[]; body: Statement[] }
  | { kind: 'return'; value: Expression | null }
  | { kind: 'expression'; expression: Expression }
);

export const PRIMITIVE_TYPES = new Set(['integer', 'text', 'boolean', 'array']);
