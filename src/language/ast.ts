import type { SourceSpan } from './diagnostics';

export type Value =
  | number
  | string
  | boolean
  | Value[]
  | { [key: string]: Value }
  | null;
export type ExportValue = Exclude<Value, null>;
export type ExportOverrides = Record<string, ExportValue>;

export type TypeName = string;
export type Located = { line: number; column: number; span: SourceSpan };

export type Expression = Located &
  (
    | { kind: 'literal'; value: Value }
    | { kind: 'identifier'; name: string }
    | { kind: 'array'; values: Expression[] }
    | { kind: 'object'; entries: { key: string; value: Expression }[] }
    | { kind: 'member'; target: Expression; name: string }
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

export interface Annotation extends Located {
  name: string;
  args: Value[];
}

interface IfBranch {
  condition: Expression;
  body: Statement[];
}

export type Statement = Located &
  (
    | { kind: 'import'; path: string; alias: string }
    | { kind: 'record'; name: string; fields: Parameter[] }
    | { kind: 'signal'; name: string; parameters: Parameter[] }
    | {
        kind: 'handler';
        event: string;
        parameters: Parameter[];
        body: Statement[];
      }
    | { kind: 'emit'; name: string; args: Expression[] }
    | { kind: 'set'; target: Expression; value: Expression }
    | { kind: 'enum'; name: string; values: string[] }
    | {
        kind: 'declare';
        typeName: TypeName;
        name: string;
        value: Expression;
        exposure: 'export' | 'input' | null;
        constant?: boolean;
        annotations?: Annotation[];
      }
    | { kind: 'button'; label: string; body: Statement[] }
    | { kind: 'assign'; name: string; value: Expression }
    | { kind: 'print'; values: Expression[] }
    | { kind: 'if'; branches: IfBranch[]; elseBody: Statement[] | null }
    | { kind: 'while'; condition: Expression; body: Statement[] }
    | {
        kind: 'forEach';
        itemName: string;
        iterable: Expression;
        body: Statement[];
      }
    | {
        kind: 'forRange';
        typeName: TypeName;
        itemName: string;
        start: Expression;
        end: Expression;
        step: Expression | null;
        body: Statement[];
      }
    | {
        kind: 'forPythonRange';
        itemName: string;
        args: Expression[];
        body: Statement[];
      }
    | {
        kind: 'function';
        name: string;
        public?: boolean;
        returnType?: TypeName;
        parameters: Parameter[];
        body: Statement[];
      }
    | { kind: 'return'; value: Expression | null }
    | { kind: 'expression'; expression: Expression }
  );

export const PRIMITIVE_TYPES = new Set([
  'integer',
  'float',
  'text',
  'boolean',
  'array',
  'dictionary',
  'vector2',
  'vector3',
  'color',
  'resource',
]);
