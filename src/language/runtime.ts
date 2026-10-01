import { BUILTIN_FUNCTIONS } from './builtins';
import { LanguageError } from './lexer';
import { parseSource } from './parser';
import { compileSource, type Program, type ModuleDefinition } from './analysis';
import { type SourceSpan, pointSpan } from './diagnostics';
import { PRIMITIVE_TYPES, type Value, type ExportValue, type ExportOverrides, type TypeName, type Located, type Expression, type Statement } from './ast';
import { isLanguageValue, type ProgramField, type ProgramSnapshot, type ProgramOptions } from './program';
export type { ExportValue, ExportOverrides } from './ast';
export type ExportField = ProgramField;

interface VariableRecord {
  typeName: TypeName;
  value: Value;
}

interface EnumDefinition {
  name: string;
  values: string[];
}

interface FunctionDefinition {
  statement: Extract<Statement, { kind: 'function' }>;
}

export interface RunResult {
  output: string[];
}

class Environment {
  private variables = new Map<string, VariableRecord>();

  constructor(private parent: Environment | null = null) {}

  declare(name: string, typeName: TypeName, value: Value, line: number, column: number) {
    if (this.variables.has(name)) {
      throw new LanguageError('Variable "' + name + '" already exists in this scope.', line, column);
    }
    this.variables.set(name, { typeName, value });
  }

  get(name: string): VariableRecord | undefined {
    return this.variables.get(name) ?? this.parent?.get(name);
  }

  set(name: string, value: Value, line: number, column: number): VariableRecord {
    const local = this.variables.get(name);
    if (local) {
      local.value = value;
      return local;
    }
    if (this.parent) return this.parent.set(name, value, line, column);
    throw new LanguageError('Unknown variable "' + name + '".', line, column);
  }
}

interface RuntimeContext {
  shared: { output: string[]; outputBytes: number; truncated: boolean; steps: number; depth: number; deadline: number; cancelled: () => boolean; maxSteps: number; lastSpan: SourceSpan };
  imports: Map<string, RuntimeContext>;
  module: ModuleDefinition;
  globals: Environment;
  enums: Map<string, EnumDefinition>;
  enumValues: Set<string>;
  functions: Map<string, FunctionDefinition>;
  overrides: ExportOverrides;
  inputOverrides: ExportOverrides;
  inputs: Map<string, ProgramField & Located>;
}

interface ReturnSignal {
  returned: true;
  value: Value;
}

const MAX_STEPS = 100_000;



export function validateSource(source: string): void {
  parseSource(source);
}

export function inspectSource(source: string): ExportField[] {
  return compileSource(source).modules.flatMap(m => m.exports);
}

/** Mutable state belongs to one session; Programs are reusable immutable values. */
export class RuntimeSession {
  private readonly contexts = new Map<string, RuntimeContext>();
  private readonly buttons = new Map<string, { statement: Extract<Statement, {kind: 'button'}>; context: RuntimeContext }>();
  private readonly shared: RuntimeContext['shared'];
  readonly program: Program;

  constructor(program: Program, options: ProgramOptions = {}) {
    this.program = program;
    this.shared = { output: [], outputBytes: 0, truncated: false, steps: 0, depth: 0, deadline: Date.now() + 2000,
      cancelled: options.cancelled ?? (() => false), maxSteps: options.maxSteps ?? MAX_STEPS, lastSpan: pointSpan(program.entryId) };
    for (const module of program.modules) {
      const enums = collectEnums(module.statements);
      const moduleOptions = options.modules?.[module.id] ?? (module.id === program.entryId ? options : {});
      const context: RuntimeContext = {
        shared: this.shared, module, imports: new Map(), globals: new Environment(), enums,
        enumValues: new Set(Array.from(enums.values()).flatMap(e => e.values)), functions: collectFunctions(module.statements),
        overrides: moduleOptions.exportOverrides ?? {}, inputOverrides: moduleOptions.inputOverrides ?? {}, inputs: new Map()
      };
      this.contexts.set(module.id, context);
      for (const statement of module.statements) if (statement.kind === 'button') {
        const prefix = module.id === program.entryId ? '' : module.id + ':';
        this.buttons.set(prefix + 'button-' + [...this.buttons.values()].filter(b => b.context === context).length, { statement, context });
      }
    }
    for (const context of this.contexts.values()) for (const [alias, id] of Object.entries(context.module.imports)) context.imports.set(alias, this.contexts.get(id)!);
    this.action(() => { for (const context of this.contexts.values()) executeStatements(context.module.statements, context.globals, context, true); });
  }

  private action(work: () => void) {
    this.shared.steps = 0; this.shared.depth = 0; this.shared.deadline = Date.now() + 2000;
    try { work(); } catch (error) {
      if (error instanceof LanguageError && error.span.start.offset === 0 && error.span.end.offset === 0) error.span = this.shared.lastSpan;
      throw error;
    }
  }
  private inputKey(context: RuntimeContext, name: string) { return context.module.id === this.program.entryId ? name : context.module.id + ':' + name; }
  snapshot(): ProgramSnapshot {
    const inputValues: ExportOverrides = Object.create(null); const inputs: ProgramField[] = [];
    for (const context of this.contexts.values()) for (const [name, field] of context.inputs) {
      const key = this.inputKey(context, name);
      inputValues[key] = context.globals.get(name)!.value as ExportValue;
      inputs.push({ ...field, name: key, label: name, fileId: context.module.id, path: context.module.path });
    }
    return structuredClone({ inputs, inputValues, buttons: Array.from(this.buttons, ([id, b]) => ({ id, label: b.statement.label })), output: this.shared.output });
  }
  setInput(key: string, value: unknown): void {
    for (const context of this.contexts.values()) for (const [name, field] of context.inputs) {
      if (this.inputKey(context, name) !== key) continue;
      if (!isLanguageValue(value)) throw new LanguageError('Inputs must contain language values (no objects or non-finite numbers).', field.line, field.column, field.span);
      assertResourceValue(value, field);
      assertType(field.typeName, value, name, field.line, field.column, context.enums);
      context.globals.set(name, structuredClone(value), field.line, field.column); return;
    }
    throw new LanguageError('Unknown input "' + key + '".', 1, 1);
  }
  pressButton(id: string): void {
    const button = this.buttons.get(id);
    if (!button) throw new LanguageError('Unknown button "' + id + '".', 1, 1);
    this.action(() => executeStatements(button.statement.body, new Environment(button.context.globals), button.context, true));
  }
  clearOutput(): void { this.shared.output = []; this.shared.outputBytes = 0; this.shared.truncated = false; }
}

/** Compatibility facade for single-source callers. The IDE uses compiled Programs. */
export class ProgramSession extends RuntimeSession {
  constructor(source: string, options: ProgramOptions = {}) { super(compileSource(source), options); }
}

export function runSource(source: string, overrides: ExportOverrides = {}): RunResult {
  return { output: new ProgramSession(source, { exportOverrides: overrides }).snapshot().output };
}

function collectEnums(statements: Statement[]): Map<string, EnumDefinition> {
  const enums = new Map<string, EnumDefinition>();
  for (const statement of statements) {
    if (statement.kind !== 'enum') continue;
    if (PRIMITIVE_TYPES.has(statement.name.toLowerCase()) || enums.has(statement.name)) {
      throw new LanguageError('Type "' + statement.name + '" is already defined.', statement.line, statement.column);
    }
    enums.set(statement.name, { name: statement.name, values: statement.values });
  }
  return enums;
}

function collectFunctions(statements: Statement[]): Map<string, FunctionDefinition> {
  const functions = new Map<string, FunctionDefinition>();
  for (const statement of statements) {
    if (statement.kind !== 'function') continue;
    if (BUILTIN_FUNCTIONS.has(statement.name)) {
      throw new LanguageError('Function "' + statement.name + '" is built in and cannot be redefined.', statement.line, statement.column);
    }
    if (functions.has(statement.name)) {
      throw new LanguageError('Function "' + statement.name + '" is already defined.', statement.line, statement.column);
    }
    functions.set(statement.name, { statement });
  }
  return functions;
}

function executeStatements(statements: Statement[], env: Environment, context: RuntimeContext, topLevel = false): ReturnSignal | null {
  for (const statement of statements) {
    context.shared.lastSpan = statement.span;
    tick(context, statement.line, statement.column);

    if (statement.kind === 'import' || statement.kind === 'enum' || statement.kind === 'function' || statement.kind === 'button') continue;

    if (statement.kind === 'declare') {
      let value = evaluate(statement.value, env, context);
      if (statement.exposure === 'input') {
        assertType(statement.typeName, value, statement.name, statement.line, statement.column, context.enums);
        context.inputs.set(statement.name, {
          name: statement.name, typeName: statement.typeName,
          control: controlForType(statement.typeName, context.enums),
          defaultValue: cloneExportValue(value, statement.line, statement.column),
          options: context.enums.get(statement.typeName)?.values,
          line: statement.line, column: statement.column, span: statement.span
        });
      }
      const overrides = statement.exposure === 'input' ? context.inputOverrides : context.overrides;
      if (statement.exposure && Object.prototype.hasOwnProperty.call(overrides, statement.name)) {
        value = overrides[statement.name];
      }
      if (!isLanguageValue(value)) throw new LanguageError('Invalid value for "' + statement.name + '".', statement.line, statement.column);
      assertType(statement.typeName, value, statement.name, statement.line, statement.column, context.enums);
      env.declare(statement.name, statement.typeName, structuredClone(value), statement.line, statement.column);
      continue;
    }

    if (statement.kind === 'assign') {
      const current = env.get(statement.name);
      if (!current) throw new LanguageError('Unknown variable "' + statement.name + '".', statement.line, statement.column);
      const value = evaluate(statement.value, env, context);
      assertType(current.typeName, value, statement.name, statement.line, statement.column, context.enums);
      env.set(statement.name, value, statement.line, statement.column);
      continue;
    }

    if (statement.kind === 'print') {
      appendOutput(context, statement.values.map((value) => format(evaluate(value, env, context))).join(' '));
      continue;
    }

    if (statement.kind === 'expression') {
      evaluate(statement.expression, env, context);
      continue;
    }

    if (statement.kind === 'return') {
      if (topLevel) throw new LanguageError('return can only be used inside a function.', statement.line, statement.column);
      return { returned: true, value: statement.value ? evaluate(statement.value, env, context) : null };
    }

    if (statement.kind === 'if') {
      let branchRan = false;
      for (const branch of statement.branches) {
        if (asBoolean(evaluate(branch.condition, env, context), branch.condition.line, branch.condition.column)) {
          const result = executeStatements(branch.body, new Environment(env), context, topLevel);
          if (result) return result;
          branchRan = true;
          break;
        }
      }
      if (!branchRan && statement.elseBody) {
        const result = executeStatements(statement.elseBody, new Environment(env), context, topLevel);
        if (result) return result;
      }
      continue;
    }

    if (statement.kind === 'while') {
      while (asBoolean(evaluate(statement.condition, env, context), statement.condition.line, statement.condition.column)) {
        context.shared.lastSpan = statement.span;
    tick(context, statement.line, statement.column);
        const result = executeStatements(statement.body, new Environment(env), context, topLevel);
        if (result) return result;
      }
      continue;
    }

    if (statement.kind === 'forEach') {
      const iterable = evaluate(statement.iterable, env, context);
      if (!Array.isArray(iterable)) {
        throw new LanguageError('for each expects an array.', statement.line, statement.column);
      }
      for (const value of iterable) {
        context.shared.lastSpan = statement.span;
    tick(context, statement.line, statement.column);
        const loopEnv = new Environment(env);
        loopEnv.declare(statement.itemName, inferType(value), value, statement.line, statement.column);
        const result = executeStatements(statement.body, loopEnv, context, topLevel);
        if (result) return result;
      }
      continue;
    }

    if (statement.kind === 'forRange') {
      const start = evaluate(statement.start, env, context);
      const end = evaluate(statement.end, env, context);
      const step = statement.step ? evaluate(statement.step, env, context) : 1;
      if (typeof start !== 'number' || typeof end !== 'number' || typeof step !== 'number' || step === 0) {
        throw new LanguageError('Range for loops require numeric start, end, and non-zero step values.', statement.line, statement.column);
      }
      const condition = step > 0 ? (value: number) => value <= end : (value: number) => value >= end;
      for (let value = start; condition(value); value += step) {
        context.shared.lastSpan = statement.span;
    tick(context, statement.line, statement.column);
        assertType(statement.typeName, value, statement.itemName, statement.line, statement.column, context.enums);
        const loopEnv = new Environment(env);
        loopEnv.declare(statement.itemName, statement.typeName, value, statement.line, statement.column);
        const result = executeStatements(statement.body, loopEnv, context, topLevel);
        if (result) return result;
      }
    }

    if (statement.kind === 'forPythonRange') {
      const args = statement.args.map((argument) => evaluate(argument, env, context));
      if (!args.every((value) => typeof value === 'number' && Number.isSafeInteger(value))) {
        throw new LanguageError('range expects integer start, stop, and step values.', statement.line, statement.column, statement.span);
      }

      const start = args.length === 1 ? 0 : args[0] as number;
      const stop = args.length === 1 ? args[0] as number : args[1] as number;
      const step = args.length === 3 ? args[2] as number : 1;

      if (step === 0) {
        throw new LanguageError('range step cannot be zero.', statement.line, statement.column, statement.span);
      }

      const condition = step > 0
        ? (value: number) => value < stop
        : (value: number) => value > stop;

      for (let value = start; condition(value); value += step) {
        context.shared.lastSpan = statement.span;
        tick(context, statement.line, statement.column);
        const loopEnv = new Environment(env);
        loopEnv.declare(statement.itemName, 'integer', value, statement.line, statement.column);
        const result = executeStatements(statement.body, loopEnv, context, topLevel);
        if (result) return result;
      }
      continue;
    }
  }

  return null;
}

function evaluate(expression: Expression, env: Environment, context: RuntimeContext): Value {
  context.shared.lastSpan = expression.span;
  try {
    const value = evaluateValue(expression, env, context);
    assertResourceValue(value, expression);
    return value;
  } catch (error) {
    if (error instanceof LanguageError && error.span.start.offset === 0 && error.span.end.offset === 0) error.span = expression.span;
    throw error;
  }
}

function evaluateValue(expression: Expression, env: Environment, context: RuntimeContext): Value {
  tick(context, expression.line, expression.column);

  if (expression.kind === 'literal') return expression.value;

  if (expression.kind === 'identifier') {
    const variable = env.get(expression.name);
    if (variable) return variable.value;
    if (context.enumValues.has(expression.name)) return expression.name;
    throw new LanguageError('Unknown value "' + expression.name + '".', expression.line, expression.column);
  }

  if (expression.kind === 'array') return expression.values.map((item) => evaluate(item, env, context));

  if (expression.kind === 'index') {
    const target = evaluate(expression.target, env, context);
    const index = evaluate(expression.index, env, context);
    if (!Array.isArray(target)) throw new LanguageError('Only arrays can be indexed with [ ].', expression.line, expression.column);
    if (typeof index !== 'number' || !Number.isInteger(index)) throw new LanguageError('Array indexes must be integers.', expression.line, expression.column);
    if (index < 0 || index >= target.length) throw new LanguageError('Array index is out of range.', expression.line, expression.column);
    return target[index];
  }

  if (expression.kind === 'call') return callFunction(expression, env, context);

  if (expression.kind === 'unary') {
    const value = evaluate(expression.value, env, context);
    if (expression.operator === 'not') return !asBoolean(value, expression.line, expression.column);
    if (typeof value !== 'number') throw new LanguageError('Unary minus expects a number.', expression.line, expression.column);
    return -value;
  }

  if (expression.operator === 'and') {
    const left = asBoolean(evaluate(expression.left, env, context), expression.left.line, expression.left.column);
    return left && asBoolean(evaluate(expression.right, env, context), expression.right.line, expression.right.column);
  }
  if (expression.operator === 'or') {
    const left = asBoolean(evaluate(expression.left, env, context), expression.left.line, expression.left.column);
    return left || asBoolean(evaluate(expression.right, env, context), expression.right.line, expression.right.column);
  }

  const left = evaluate(expression.left, env, context);
  const right = evaluate(expression.right, env, context);

  if (expression.operator === 'plus') {
    if (typeof left === 'string' || typeof right === 'string') return format(left) + format(right);
    return numberOperation(left, right, (a, b) => a + b, 'plus', expression);
  }
  if (expression.operator === 'minus') return numberOperation(left, right, (a, b) => a - b, 'minus', expression);
  if (expression.operator === 'times') return numberOperation(left, right, (a, b) => a * b, 'times', expression);
  if (expression.operator === 'divided by') {
    if (right === 0) throw new LanguageError('Cannot divide by zero.', expression.line, expression.column);
    return numberOperation(left, right, (a, b) => a / b, 'divided by', expression);
  }
  if (expression.operator === 'remainder') return numberOperation(left, right, (a, b) => a % b, 'remainder', expression);

  if (expression.operator === 'is') return valuesEqual(left, right);
  if (expression.operator === 'is not') return !valuesEqual(left, right);
  if (expression.operator === 'less than') return compareNumbers(left, right, (a, b) => a < b, expression);
  if (expression.operator === 'less than or equal to') return compareNumbers(left, right, (a, b) => a <= b, expression);
  if (expression.operator === 'greater than') return compareNumbers(left, right, (a, b) => a > b, expression);
  if (expression.operator === 'greater than or equal to') return compareNumbers(left, right, (a, b) => a >= b, expression);

  throw new LanguageError('Unknown operation "' + expression.operator + '".', expression.line, expression.column);
}

function callFunction(expression: Extract<Expression, { kind: 'call' }>, env: Environment, context: RuntimeContext): Value {
  if (expression.name === 'randomInteger') {
    if (expression.args.length !== 2) {
      throw new LanguageError('randomInteger expects exactly 2 arguments: minimum and maximum.', expression.line, expression.column);
    }

    const minimum = evaluate(expression.args[0], env, context);
    const maximum = evaluate(expression.args[1], env, context);

    if (typeof minimum !== 'number' || typeof maximum !== 'number' || !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      throw new LanguageError('randomInteger expects integer minimum and maximum values.', expression.line, expression.column);
    }
    if (minimum > maximum) {
      throw new LanguageError('randomInteger minimum cannot be greater than maximum.', expression.line, expression.column);
    }

    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }

  let target = context; let name = expression.name;
  if (name.includes('.')) {
    const [alias, member] = name.split('.');
    target = context.imports.get(alias)!; name = member;
  }
  const definition = target?.functions.get(name);
  if (target !== context && !definition?.statement.public) throw new LanguageError('Function is not public.', expression.line, expression.column, expression.span);
  if (!definition) throw new LanguageError('Unknown function "' + expression.name + '".', expression.line, expression.column);

  const fn = definition.statement;
  if (fn.parameters.length !== expression.args.length) {
    throw new LanguageError(
      'Function "' + fn.name + '" expects ' + fn.parameters.length + ' argument(s), but received ' + expression.args.length + '.',
      expression.line,
      expression.column
    );
  }

  const functionEnv = new Environment(target.globals);
  fn.parameters.forEach((parameter, index) => {
    const value = evaluate(expression.args[index], env, context);
    assertType(parameter.typeName, value, parameter.name, parameter.line, parameter.column, target.enums);
    functionEnv.declare(parameter.name, parameter.typeName, value, parameter.line, parameter.column);
  });

  context.shared.depth++;
  if (context.shared.depth > 128) throw new LanguageError('Call depth limit exceeded.', expression.line, expression.column, expression.span);
  try { return executeStatements(fn.body, functionEnv, target)?.value ?? null; }
  finally { context.shared.depth--; }
}

function numberOperation(left: Value, right: Value, operation: (a: number, b: number) => number, name: string, location: Located): number {
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new LanguageError(name + ' expects numbers.', location.line, location.column);
  }
  return operation(left, right);
}

function compareNumbers(left: Value, right: Value, comparison: (a: number, b: number) => boolean, location: Located): boolean {
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new LanguageError('Numeric comparison expects numbers.', location.line, location.column);
  }
  return comparison(left, right);
}

function valuesEqual(left: Value, right: Value): boolean {
  if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left) === JSON.stringify(right);
  return left === right;
}

function asBoolean(value: Value, line: number, column: number): boolean {
  if (typeof value !== 'boolean') throw new LanguageError('Condition must evaluate to true or false.', line, column);
  return value;
}

function assertType(typeName: TypeName, value: Value, name: string, line: number, column: number, enums: Map<string, EnumDefinition>) {
  const lower = typeName.toLowerCase();
  const validPrimitive =
    (lower === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
    (lower === 'text' && typeof value === 'string') ||
    (lower === 'boolean' && typeof value === 'boolean') ||
    (lower === 'array' && Array.isArray(value));

  if (PRIMITIVE_TYPES.has(lower)) {
    if (!validPrimitive) throw new LanguageError('"' + name + '" is declared as ' + typeName + ', but the assigned value has a different type.', line, column);
    return;
  }

  const enumDefinition = enums.get(typeName);
  if (!enumDefinition) throw new LanguageError('Unknown type "' + typeName + '".', line, column);
  if (typeof value !== 'string' || !enumDefinition.values.includes(value)) {
    throw new LanguageError(
      '"' + name + '" must be one of ' + enumDefinition.values.join(', ') + ' for enum ' + typeName + '.',
      line,
      column
    );
  }
}

function inferType(value: Value): TypeName {
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  return 'value';
}

function controlForType(typeName: string, enums: Map<string, EnumDefinition>): ExportField['control'] {
  if (enums.has(typeName)) return 'enum';
  if (typeName.toLowerCase() === 'integer') return 'number';
  if (typeName.toLowerCase() === 'boolean') return 'boolean';
  if (typeName.toLowerCase() === 'array') return 'array';
  return 'text';
}

function cloneExportValue(value: Value, line: number, column: number): ExportValue {
  if (value === null) throw new LanguageError('Exported values cannot be empty.', line, column);
  return structuredClone(value);
}

function format(value: Value): string {
  if (Array.isArray(value)) return '[' + value.map(format).join(', ') + ']';
  if (value === null) return 'nothing';
  return String(value);
}

function tick(context: RuntimeContext, line: number, column: number) {
  context.shared.steps += 1;
  if (context.shared.cancelled()) throw new LanguageError('Program stopped.', line, column, context.shared.lastSpan);
  if (Date.now() > context.shared.deadline) throw new LanguageError('Execution time limit exceeded.', line, column, context.shared.lastSpan);
  if (context.shared.steps > context.shared.maxSteps) {
    throw new LanguageError('Program stopped after too many operations. Check for an endless loop.', line, column);
  }
}

function appendOutput(context: RuntimeContext, text: string) {
  if (context.shared.truncated) return;
  const line = text.slice(0, 8192);
  if (context.shared.output.length >= 1000 || context.shared.outputBytes + line.length > 256_000) {
    context.shared.output.push('[Output limit reached; clear output to resume logging.]'); context.shared.truncated = true; return;
  }
  context.shared.output.push(line); context.shared.outputBytes += line.length;
}
function assertResourceValue(value: Value, at: Located) {
  let count = 0; let size = 0;
  function visit(v: Value, depth: number) {
    size += typeof v === 'string' ? v.length : 8;
    if (size > 1_000_000 || ++count > 20_000 || depth > 64 || (typeof v === 'string' && v.length > 65_536) || (Array.isArray(v) && v.length > 10_000)) {
      throw new LanguageError('Value exceeds runtime resource limits.', at.line, at.column, at.span);
    }
    if (Array.isArray(v)) v.forEach(x => visit(x, depth + 1));
  }
  visit(value, 0);
}
