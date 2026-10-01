import { VALUE_LIMITS } from './program';
import {
  matchesType,
  isObject,
  controlForType,
  type TypeDefinitions,
} from './types';
import { declarationHints, matchingAssets } from './annotations';
import { primitive, vectorOperation } from './primitives';
import { BUILTIN_FUNCTIONS, BUILTIN_SIGNATURES, HOST_EVENTS } from './builtins';
import { LanguageError } from './lexer';
import { parseSource } from './parser';
import { compileSource, type Program, type ModuleDefinition } from './analysis';
import { type SourceSpan, pointSpan } from './diagnostics';
import {
  PRIMITIVE_TYPES,
  type Value,
  type ExportValue,
  type ExportOverrides,
  type TypeName,
  type Located,
  type Expression,
  type Statement,
} from './ast';
import {
  isLanguageValue,
  type ProgramField,
  type ProgramSnapshot,
  type ProgramOptions,
} from './program';
export type { ExportValue, ExportOverrides } from './ast';
export type ExportField = ProgramField;

interface VariableRecord {
  typeName: TypeName;
  value: Value;
  constant?: boolean;
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

  declare(
    name: string,
    typeName: TypeName,
    value: Value,
    line: number,
    column: number,
    constant = false,
  ) {
    if (this.variables.has(name)) {
      throw new LanguageError(
        'Variable "' + name + '" already exists in this scope.',
        line,
        column,
      );
    }
    this.variables.set(name, {
      typeName,
      value: structuredClone(value),
      constant,
    });
  }

  get(name: string): VariableRecord | undefined {
    return this.variables.get(name) ?? this.parent?.get(name);
  }

  set(
    name: string,
    value: Value,
    line: number,
    column: number,
  ): VariableRecord {
    const local = this.variables.get(name);
    if (local) {
      if (local.constant)
        throw new LanguageError(
          'Cannot change constant "' + name + '".',
          line,
          column,
        );
      local.value = structuredClone(value);
      return local;
    }
    if (this.parent) return this.parent.set(name, value, line, column);
    throw new LanguageError('Unknown variable "' + name + '".', line, column);
  }
}

interface RuntimeContext {
  shared: {
    output: string[];
    outputBytes: number;
    truncated: boolean;
    steps: number;
    depth: number;
    deadline: number;
    cancelled: () => boolean;
    maxSteps: number;
    lastSpan: SourceSpan;
  };
  definitions: TypeDefinitions;
  resources: Program['resources'];
  enqueue: (context: RuntimeContext, event: string, args: Value[]) => void;
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

type ReturnSignal =
  | { returned: true; value: Value }
  | { returned: false; control: 'break' | 'continue'; value?: never };

const MAX_STEPS = 100_000;

export function validateSource(source: string): void {
  parseSource(source);
}

export function inspectSource(source: string): ExportField[] {
  return compileSource(source).modules.flatMap((m) => m.exports);
}

/** Mutable state belongs to one session; Programs are reusable immutable values. */
export class RuntimeSession {
  private readonly contexts = new Map<string, RuntimeContext>();
  private readonly buttons = new Map<
    string,
    {
      statement: Extract<Statement, { kind: 'button' }>;
      context: RuntimeContext;
    }
  >();
  private readonly queue: {
    context: RuntimeContext;
    event: string;
    args: Value[];
    payloadSize: number;
  }[] = [];
  private eventCount = 0;
  private queuedPayloadSize = 0;
  private readonly shared: RuntimeContext['shared'];
  readonly program: Program;

  constructor(program: Program, options: ProgramOptions = {}) {
    this.program = program;
    this.shared = {
      output: [],
      outputBytes: 0,
      truncated: false,
      steps: 0,
      depth: 0,
      deadline: Date.now() + 2000,
      cancelled: options.cancelled ?? (() => false),
      maxSteps: options.maxSteps ?? MAX_STEPS,
      lastSpan: pointSpan(program.entryId),
    };
    for (const module of program.modules) {
      const enums = collectEnums(module.statements);
      const moduleOptions =
        options.modules?.[module.id] ??
        (module.id === program.entryId ? options : {});
      const context: RuntimeContext = {
        definitions: {
          enums,
          records: new Map(
            module.statements
              .filter((s) => s.kind === 'record')
              .map((s) => [s.name, s.fields]),
          ),
        },
        resources: program.resources,
        enqueue: (context, event, args) => this.enqueue(context, event, args),
        shared: this.shared,
        module,
        imports: new Map(),
        globals: new Environment(),
        enums,
        enumValues: new Set(
          Array.from(enums.values()).flatMap((e) => e.values),
        ),
        functions: collectFunctions(module.statements),
        overrides: moduleOptions.exportOverrides ?? {},
        inputOverrides: moduleOptions.inputOverrides ?? {},
        inputs: new Map(),
      };
      this.contexts.set(module.id, context);
      for (const statement of module.statements)
        if (statement.kind === 'button') {
          const prefix = module.id === program.entryId ? '' : module.id + ':';
          this.buttons.set(
            prefix +
              'button-' +
              [...this.buttons.values()].filter((b) => b.context === context)
                .length,
            { statement, context },
          );
        }
    }
    for (const context of this.contexts.values())
      for (const [alias, id] of Object.entries(context.module.imports))
        context.imports.set(alias, this.contexts.get(id)!);
    this.action(() => {
      for (const context of this.contexts.values())
        executeStatements(
          context.module.statements,
          context.globals,
          context,
          true,
        );
      for (const context of this.contexts.values())
        this.enqueue(context, 'start', []);
    });
  }

  private action(work: () => void) {
    this.eventCount = 0;
    this.shared.steps = 0;
    this.shared.depth = 0;
    this.shared.deadline = Date.now() + 2000;
    try {
      work();
      this.drainEvents();
    } catch (error) {
      this.queue.length = 0;
      this.queuedPayloadSize = 0;
      if (
        error instanceof LanguageError &&
        error.span.start.offset === 0 &&
        error.span.end.offset === 0
      )
        error.span = this.shared.lastSpan;
      throw error;
    }
  }
  private enqueue(context: RuntimeContext, event: string, args: Value[]) {
    if (++this.eventCount > 1024)
      throw new LanguageError(
        'Event limit exceeded.',
        1,
        1,
        this.shared.lastSpan,
      );
    const payloadSize = JSON.stringify(args).length;
    if (this.queuedPayloadSize + payloadSize > 4_000_000)
      throw new LanguageError(
        'Event payload limit exceeded.',
        1,
        1,
        this.shared.lastSpan,
      );
    this.queuedPayloadSize += payloadSize;
    this.queue.push({
      context,
      event,
      args: structuredClone(args),
      payloadSize,
    });
  }
  private drainEvents() {
    while (this.queue.length) {
      const event = this.queue.shift()!;
      this.queuedPayloadSize -= event.payloadSize;
      for (const handler of event.context.module.statements) {
        if (handler.kind !== 'handler' || handler.event !== event.event)
          continue;
        const env = new Environment(event.context.globals);
        handler.parameters.forEach((p, i) => {
          assertType(
            p.typeName,
            event.args[i],
            p.name,
            p.line,
            p.column,
            event.context.definitions,
          );
          env.declare(p.name, p.typeName, event.args[i], p.line, p.column);
        });
        executeStatements(handler.body, env, event.context, true);
      }
    }
  }
  dispatchEvent(event: string, args: Value[]): void {
    if (!Object.hasOwn(HOST_EVENTS, event) || event === 'start')
      throw new LanguageError('Unknown host event: ' + event, 1, 1);
    const expected = HOST_EVENTS[event];
    if (args.length !== expected.length || !isLanguageValue(args))
      throw new LanguageError('Invalid event arguments.', 1, 1);
    args.forEach((arg, i) => {
      if (
        !matchesType(expected[i], arg, { enums: new Map(), records: new Map() })
      )
        throw new LanguageError('Invalid event argument type.', 1, 1);
    });
    if (event === 'update' && (Number(args[0]) < 0 || Number(args[0]) > 0.25))
      throw new LanguageError(
        'Update delta must be between 0 and 0.25 seconds.',
        1,
        1,
      );
    this.action(() => {
      for (const context of this.contexts.values())
        if (
          context.module.statements.some(
            (s) => s.kind === 'handler' && s.event === event,
          )
        )
          this.enqueue(context, event, args);
    });
  }
  private inputKey(context: RuntimeContext, name: string) {
    return context.module.id === this.program.entryId
      ? name
      : context.module.id + ':' + name;
  }
  snapshot(): ProgramSnapshot {
    const inputValues: ExportOverrides = Object.create(null);
    const inputs: ProgramField[] = [];
    for (const context of this.contexts.values())
      for (const [name, field] of context.inputs) {
        const key = this.inputKey(context, name);
        inputValues[key] = context.globals.get(name)!.value as ExportValue;
        inputs.push({
          ...field,
          name: key,
          variableName: name,
          fileId: context.module.id,
          path: context.module.path,
        });
      }
    return structuredClone({
      inputs,
      inputValues,
      buttons: Array.from(this.buttons, ([id, b]) => ({
        id,
        label: b.statement.label,
      })),
      output: this.shared.output,
      events: [
        ...new Set(
          this.program.modules.flatMap((m) =>
            m.statements
              .filter(
                (s) =>
                  s.kind === 'handler' &&
                  Object.hasOwn(HOST_EVENTS, s.event) &&
                  s.event !== 'start',
              )
              .map((s) => (s.kind === 'handler' ? s.event : '')),
          ),
        ),
      ],
    });
  }
  setInput(key: string, value: unknown): void {
    for (const context of this.contexts.values())
      for (const [name, field] of context.inputs) {
        if (this.inputKey(context, name) !== key) continue;
        if (!isLanguageValue(value))
          throw new LanguageError(
            'Inputs must contain finite, bounded language values.',
            field.line,
            field.column,
            field.span,
          );
        assertResourceValue(value, field);
        assertType(
          field.typeName,
          value,
          name,
          field.line,
          field.column,
          context.definitions,
        );
        context.globals.set(
          name,
          structuredClone(value),
          field.line,
          field.column,
        );
        return;
      }
    throw new LanguageError('Unknown input "' + key + '".', 1, 1);
  }
  pressButton(id: string): void {
    const button = this.buttons.get(id);
    if (!button) throw new LanguageError('Unknown button "' + id + '".', 1, 1);
    this.action(() =>
      executeStatements(
        button.statement.body,
        new Environment(button.context.globals),
        button.context,
        true,
      ),
    );
  }
  clearOutput(): void {
    this.shared.output = [];
    this.shared.outputBytes = 0;
    this.shared.truncated = false;
  }
}

/** Compatibility facade for single-source callers. The IDE uses compiled Programs. */
export class ProgramSession extends RuntimeSession {
  constructor(source: string, options: ProgramOptions = {}) {
    super(compileSource(source), options);
  }
}

export function runSource(
  source: string,
  overrides: ExportOverrides = {},
): RunResult {
  return {
    output: new ProgramSession(source, {
      exportOverrides: overrides,
    }).snapshot().output,
  };
}

function collectEnums(statements: Statement[]): Map<string, EnumDefinition> {
  const enums = new Map<string, EnumDefinition>();
  for (const statement of statements) {
    if (statement.kind !== 'enum') continue;
    if (
      PRIMITIVE_TYPES.has(statement.name.toLowerCase()) ||
      enums.has(statement.name)
    ) {
      throw new LanguageError(
        'Type "' + statement.name + '" is already defined.',
        statement.line,
        statement.column,
      );
    }
    enums.set(statement.name, {
      name: statement.name,
      values: statement.values,
    });
  }
  return enums;
}

function collectFunctions(
  statements: Statement[],
): Map<string, FunctionDefinition> {
  const functions = new Map<string, FunctionDefinition>();
  for (const statement of statements) {
    if (statement.kind !== 'function') continue;
    if (BUILTIN_FUNCTIONS.has(statement.name)) {
      throw new LanguageError(
        'Function "' +
          statement.name +
          '" is built in and cannot be redefined.',
        statement.line,
        statement.column,
      );
    }
    if (functions.has(statement.name)) {
      throw new LanguageError(
        'Function "' + statement.name + '" is already defined.',
        statement.line,
        statement.column,
      );
    }
    functions.set(statement.name, { statement });
  }
  return functions;
}

function executeStatements(
  statements: Statement[],
  env: Environment,
  context: RuntimeContext,
  topLevel = false,
): ReturnSignal | null {
  for (const statement of statements) {
    context.shared.lastSpan = statement.span;
    tick(context, statement.line, statement.column);

    if (
      statement.kind === 'record' ||
      statement.kind === 'signal' ||
      statement.kind === 'handler' ||
      statement.kind === 'import' ||
      statement.kind === 'enum' ||
      statement.kind === 'function' ||
      statement.kind === 'button'
    )
      continue;

    if (statement.kind === 'declare') {
      let value = evaluate(statement.value, env, context);
      if (statement.exposure === 'input') {
        assertType(
          statement.typeName,
          value,
          statement.name,
          statement.line,
          statement.column,
          context.definitions,
        );
        context.inputs.set(statement.name, {
          name: statement.name,
          typeName: statement.typeName,
          control: controlForType(statement.typeName, context.enums),
          ...declarationHints(statement),
          assetIds: Object.fromEntries(
            context.resources.map((r) => [r.path, r.id]),
          ),
          assets: matchingAssets(
            context.resources.map((r) => r.path),
            declarationHints(statement).hints.file ?? '*',
          ),
          defaultValue: cloneExportValue(
            value,
            statement.line,
            statement.column,
          ),
          options: context.enums.get(statement.typeName)?.values,
          line: statement.line,
          column: statement.column,
          span: statement.span,
        });
      }
      const overrides =
        statement.exposure === 'input'
          ? context.inputOverrides
          : context.overrides;
      if (
        statement.exposure &&
        Object.prototype.hasOwnProperty.call(overrides, statement.name)
      ) {
        value = overrides[statement.name];
      }
      if (!isLanguageValue(value))
        throw new LanguageError(
          'Invalid value for "' + statement.name + '".',
          statement.line,
          statement.column,
        );
      assertType(
        statement.typeName,
        value,
        statement.name,
        statement.line,
        statement.column,
        context.definitions,
      );
      env.declare(
        statement.name,
        statement.typeName,
        structuredClone(value),
        statement.line,
        statement.column,
        statement.constant,
      );
      continue;
    }

    if (statement.kind === 'emit') {
      const signal = context.module.statements.find(
        (s) => s.kind === 'signal' && s.name === statement.name,
      );
      if (
        !signal ||
        signal.kind !== 'signal' ||
        signal.parameters.length !== statement.args.length
      )
        throw new LanguageError(
          'Unknown signal or invalid arguments.',
          statement.line,
          statement.column,
        );
      const args = statement.args.map((a) => evaluate(a, env, context));
      signal.parameters.forEach((p, i) =>
        assertType(
          p.typeName,
          args[i],
          p.name,
          p.line,
          p.column,
          context.definitions,
        ),
      );
      context.enqueue(context, statement.name, args);
      continue;
    }
    if (statement.kind === 'set') {
      const path: (string | number)[] = [];
      function root(e: Expression): string {
        if (e.kind === 'identifier') return e.name;
        if (e.kind !== 'member' && e.kind !== 'index')
          throw new LanguageError(
            'Assignment needs a variable root.',
            e.line,
            e.column,
          );
        const name = root(e.target);
        const key =
          e.kind === 'member' ? e.name : evaluate(e.index, env, context);
        if (typeof key !== 'string' && typeof key !== 'number')
          throw new LanguageError(
            'Index must be text or integer.',
            e.line,
            e.column,
          );
        path.push(key);
        return name;
      }
      const name = root(statement.target);
      const variable = env.get(name);
      if (!variable)
        throw new LanguageError(
          'Unknown variable "' + name + '".',
          statement.line,
          statement.column,
        );
      const copy = structuredClone(variable.value);
      let target = copy;
      for (const key of path.slice(0, -1))
        target = readMember(target, key, statement);
      const key = path.at(-1)!;
      if (Array.isArray(target)) {
        readMember(target, key, statement);
        target[key as number] = structuredClone(
          evaluate(statement.value, env, context),
        );
      } else if (isObject(target) && typeof key === 'string') {
        Object.defineProperty(target, key, {
          value: structuredClone(evaluate(statement.value, env, context)),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      } else
        throw new LanguageError(
          'Cannot assign a member of this value.',
          statement.line,
          statement.column,
        );
      assertResourceValue(copy, statement);
      assertType(
        variable.typeName,
        copy,
        name,
        statement.line,
        statement.column,
        context.definitions,
      );
      env.set(name, copy, statement.line, statement.column);
      continue;
    }

    if (statement.kind === 'assign') {
      const current = env.get(statement.name);
      if (!current)
        throw new LanguageError(
          'Unknown variable "' + statement.name + '".',
          statement.line,
          statement.column,
        );
      const value = evaluate(statement.value, env, context);
      assertType(
        current.typeName,
        value,
        statement.name,
        statement.line,
        statement.column,
        context.definitions,
      );
      env.set(statement.name, value, statement.line, statement.column);
      continue;
    }

    if (statement.kind === 'print') {
      appendOutput(
        context,
        statement.values
          .map((value) => format(evaluate(value, env, context)))
          .join(' '),
      );
      continue;
    }

    if (statement.kind === 'expression') {
      evaluate(statement.expression, env, context);
      continue;
    }

    if (statement.kind === 'break' || statement.kind === 'continue')
      return { returned: false, control: statement.kind };

    if (statement.kind === 'return') {
      if (topLevel)
        throw new LanguageError(
          'return can only be used inside a function.',
          statement.line,
          statement.column,
        );
      return {
        returned: true,
        value: statement.value ? evaluate(statement.value, env, context) : null,
      };
    }

    if (statement.kind === 'if') {
      let branchRan = false;
      for (const branch of statement.branches) {
        if (
          asBoolean(
            evaluate(branch.condition, env, context),
            branch.condition.line,
            branch.condition.column,
          )
        ) {
          const result = executeStatements(
            branch.body,
            new Environment(env),
            context,
            topLevel,
          );
          if (result) return result;
          branchRan = true;
          break;
        }
      }
      if (!branchRan && statement.elseBody) {
        const result = executeStatements(
          statement.elseBody,
          new Environment(env),
          context,
          topLevel,
        );
        if (result) return result;
      }
      continue;
    }

    if (statement.kind === 'while') {
      while (
        asBoolean(
          evaluate(statement.condition, env, context),
          statement.condition.line,
          statement.condition.column,
        )
      ) {
        context.shared.lastSpan = statement.span;
        tick(context, statement.line, statement.column);
        const result = executeStatements(
          statement.body,
          new Environment(env),
          context,
          topLevel,
        );
        if (result?.returned) return result;
        if (result && result.control === 'break') break;
      }
      continue;
    }

    if (statement.kind === 'forEach') {
      const iterable = evaluate(statement.iterable, env, context);
      if (!Array.isArray(iterable)) {
        throw new LanguageError(
          'for each expects an array.',
          statement.line,
          statement.column,
        );
      }
      for (const value of iterable) {
        context.shared.lastSpan = statement.span;
        tick(context, statement.line, statement.column);
        const loopEnv = new Environment(env);
        loopEnv.declare(
          statement.itemName,
          inferType(value),
          value,
          statement.line,
          statement.column,
        );
        const result = executeStatements(
          statement.body,
          loopEnv,
          context,
          topLevel,
        );
        if (result?.returned) return result;
        if (result && result.control === 'break') break;
      }
      continue;
    }

    if (statement.kind === 'forRange') {
      const start = evaluate(statement.start, env, context);
      const end = evaluate(statement.end, env, context);
      const step = statement.step ? evaluate(statement.step, env, context) : 1;
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        typeof step !== 'number' ||
        step === 0
      ) {
        throw new LanguageError(
          'Range for loops require numeric start, end, and non-zero step values.',
          statement.line,
          statement.column,
        );
      }
      const condition =
        step > 0
          ? (value: number) => value <= end
          : (value: number) => value >= end;
      for (let value = start; condition(value); value += step) {
        context.shared.lastSpan = statement.span;
        tick(context, statement.line, statement.column);
        assertType(
          statement.typeName,
          value,
          statement.itemName,
          statement.line,
          statement.column,
          context.definitions,
        );
        const loopEnv = new Environment(env);
        loopEnv.declare(
          statement.itemName,
          statement.typeName,
          value,
          statement.line,
          statement.column,
        );
        const result = executeStatements(
          statement.body,
          loopEnv,
          context,
          topLevel,
        );
        if (result?.returned) return result;
        if (result && result.control === 'break') break;
      }
    }

    if (statement.kind === 'forPythonRange') {
      const args = statement.args.map((argument) =>
        evaluate(argument, env, context),
      );
      if (
        !args.every(
          (value) => typeof value === 'number' && Number.isSafeInteger(value),
        )
      ) {
        throw new LanguageError(
          'range expects integer start, stop, and step values.',
          statement.line,
          statement.column,
          statement.span,
        );
      }

      const start = args.length === 1 ? 0 : (args[0] as number);
      const stop =
        args.length === 1 ? (args[0] as number) : (args[1] as number);
      const step = args.length === 3 ? (args[2] as number) : 1;

      if (step === 0) {
        throw new LanguageError(
          'range step cannot be zero.',
          statement.line,
          statement.column,
          statement.span,
        );
      }

      const condition =
        step > 0
          ? (value: number) => value < stop
          : (value: number) => value > stop;

      for (let value = start; condition(value); value += step) {
        context.shared.lastSpan = statement.span;
        tick(context, statement.line, statement.column);
        const loopEnv = new Environment(env);
        loopEnv.declare(
          statement.itemName,
          'integer',
          value,
          statement.line,
          statement.column,
        );
        const result = executeStatements(
          statement.body,
          loopEnv,
          context,
          topLevel,
        );
        if (result?.returned) return result;
        if (result && result.control === 'break') break;
      }
      continue;
    }
  }

  return null;
}

function evaluate(
  expression: Expression,
  env: Environment,
  context: RuntimeContext,
): Value {
  context.shared.lastSpan = expression.span;
  try {
    const value = evaluateValue(expression, env, context);
    assertResourceValue(value, expression);
    return value;
  } catch (error) {
    if (
      error instanceof LanguageError &&
      error.span.start.offset === 0 &&
      error.span.end.offset === 0
    )
      error.span = expression.span;
    throw error;
  }
}

function evaluateValue(
  expression: Expression,
  env: Environment,
  context: RuntimeContext,
): Value {
  tick(context, expression.line, expression.column);

  if (expression.kind === 'literal') return expression.value;

  if (expression.kind === 'identifier') {
    const variable = env.get(expression.name);
    if (variable) return variable.value;
    if (context.enumValues.has(expression.name)) return expression.name;
    throw new LanguageError(
      'Unknown value "' + expression.name + '".',
      expression.line,
      expression.column,
    );
  }

  if (expression.kind === 'object')
    return Object.fromEntries(
      expression.entries.map((entry) => [
        entry.key,
        evaluate(entry.value, env, context),
      ]),
    );
  if (expression.kind === 'member')
    return readMember(
      evaluate(expression.target, env, context),
      expression.name,
      expression,
    );
  if (expression.kind === 'array')
    return expression.values.map((item) => evaluate(item, env, context));

  if (expression.kind === 'index') {
    const target = evaluate(expression.target, env, context);
    const index = evaluate(expression.index, env, context);
    return readMember(target, index, expression);
  }

  if (expression.kind === 'call') return callFunction(expression, env, context);

  if (expression.kind === 'unary') {
    const value = evaluate(expression.value, env, context);
    if (expression.operator === 'not')
      return !asBoolean(value, expression.line, expression.column);
    if (typeof value !== 'number')
      throw new LanguageError(
        'Unary minus expects a number.',
        expression.line,
        expression.column,
      );
    return -value;
  }

  if (expression.operator === 'and') {
    const left = asBoolean(
      evaluate(expression.left, env, context),
      expression.left.line,
      expression.left.column,
    );
    return (
      left &&
      asBoolean(
        evaluate(expression.right, env, context),
        expression.right.line,
        expression.right.column,
      )
    );
  }
  if (expression.operator === 'or') {
    const left = asBoolean(
      evaluate(expression.left, env, context),
      expression.left.line,
      expression.left.column,
    );
    return (
      left ||
      asBoolean(
        evaluate(expression.right, env, context),
        expression.right.line,
        expression.right.column,
      )
    );
  }

  const left = evaluate(expression.left, env, context);
  const right = evaluate(expression.right, env, context);

  try {
    const vector = vectorOperation(expression.operator, left, right);
    if (vector !== undefined) return vector;
  } catch (error) {
    throw new LanguageError(
      (error as Error).message,
      expression.line,
      expression.column,
      expression.span,
    );
  }
  if (expression.operator === 'plus') {
    if (typeof left === 'string' || typeof right === 'string')
      return format(left) + format(right);
    return numberOperation(left, right, (a, b) => a + b, 'plus', expression);
  }
  if (expression.operator === 'minus')
    return numberOperation(left, right, (a, b) => a - b, 'minus', expression);
  if (expression.operator === 'times')
    return numberOperation(left, right, (a, b) => a * b, 'times', expression);
  if (expression.operator === 'divided by') {
    if (right === 0)
      throw new LanguageError(
        'Cannot divide by zero.',
        expression.line,
        expression.column,
      );
    return numberOperation(
      left,
      right,
      (a, b) => a / b,
      'divided by',
      expression,
    );
  }
  if (expression.operator === 'remainder')
    return numberOperation(
      left,
      right,
      (a, b) => a % b,
      'remainder',
      expression,
    );

  if (expression.operator === 'is') return valuesEqual(left, right);
  if (expression.operator === 'is not') return !valuesEqual(left, right);
  if (expression.operator === 'less than')
    return compareNumbers(left, right, (a, b) => a < b, expression);
  if (expression.operator === 'less than or equal to')
    return compareNumbers(left, right, (a, b) => a <= b, expression);
  if (expression.operator === 'greater than')
    return compareNumbers(left, right, (a, b) => a > b, expression);
  if (expression.operator === 'greater than or equal to')
    return compareNumbers(left, right, (a, b) => a >= b, expression);

  throw new LanguageError(
    'Unknown operation "' + expression.operator + '".',
    expression.line,
    expression.column,
  );
}

function callFunction(
  expression: Extract<Expression, { kind: 'call' }>,
  env: Environment,
  context: RuntimeContext,
): Value {
  if (expression.name === 'randomInteger') {
    if (expression.args.length !== 2) {
      throw new LanguageError(
        'randomInteger expects exactly 2 arguments: minimum and maximum.',
        expression.line,
        expression.column,
      );
    }

    const minimum = evaluate(expression.args[0], env, context);
    const maximum = evaluate(expression.args[1], env, context);

    if (
      typeof minimum !== 'number' ||
      typeof maximum !== 'number' ||
      !Number.isSafeInteger(minimum) ||
      !Number.isSafeInteger(maximum)
    ) {
      throw new LanguageError(
        'randomInteger expects integer minimum and maximum values.',
        expression.line,
        expression.column,
      );
    }
    if (minimum > maximum) {
      throw new LanguageError(
        'randomInteger minimum cannot be greater than maximum.',
        expression.line,
        expression.column,
      );
    }

    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }

  if (Object.hasOwn(BUILTIN_SIGNATURES, expression.name)) {
    const signature = BUILTIN_SIGNATURES[expression.name];
    if (!signature.args.includes(expression.args.length))
      throw new LanguageError(
        'Invalid argument count for ' + expression.name,
        expression.line,
        expression.column,
      );
    const args = expression.args.map((a) => evaluate(a, env, context));
    try {
      if (
        expression.name === 'loadResource' ||
        expression.name === 'Resource'
      ) {
        const reference = args[0];
        if (
          typeof reference !== 'string' &&
          !(isObject(reference) && reference.$type === 'resource')
        )
          throw new Error('Expected a project path or resource reference.');
        const resource =
          typeof reference === 'string'
            ? context.resources.find(
                (r) => r.path === resourcePath(context.module.path, reference),
              )
            : context.resources.find(
                (r) => r.id === (reference as Record<string, Value>).id,
              );
        if (expression.name === 'Resource') {
          if (!resource) throw new Error('Project resource does not exist.');
          return { $type: 'resource', id: resource.id, path: resource.path };
        }
        const path =
          typeof reference === 'string'
            ? reference
            : String((reference as Record<string, Value>).path);
        if (
          !resource ||
          resource.binary ||
          !resource.path.toLowerCase().endsWith('.json')
        )
          throw new Error(
            'Resource must be an existing project JSON file: ' + path,
          );
        const value: unknown = JSON.parse(resource.content);
        if (!isLanguageValue(value))
          throw new Error('Resource exceeds supported JSON value limits.');
        return value;
      }
      const value = primitive(expression.name, args);
      if (!isLanguageValue(value))
        throw new Error('Invalid or oversized language value.');
      return value;
    } catch (error) {
      throw new LanguageError(
        (error as Error).message,
        expression.line,
        expression.column,
        expression.span,
      );
    }
  }

  let target = context;
  let name = expression.name;
  if (name.includes('.')) {
    const [alias, member] = name.split('.');
    target = context.imports.get(alias)!;
    name = member;
  }
  const definition = target?.functions.get(name);
  if (target !== context && !definition?.statement.public)
    throw new LanguageError(
      'Function is not public.',
      expression.line,
      expression.column,
      expression.span,
    );
  if (!definition)
    throw new LanguageError(
      'Unknown function "' + expression.name + '".',
      expression.line,
      expression.column,
    );

  const fn = definition.statement;
  if (fn.parameters.length !== expression.args.length) {
    throw new LanguageError(
      'Function "' +
        fn.name +
        '" expects ' +
        fn.parameters.length +
        ' argument(s), but received ' +
        expression.args.length +
        '.',
      expression.line,
      expression.column,
    );
  }

  const functionEnv = new Environment(target.globals);
  fn.parameters.forEach((parameter, index) => {
    const value = evaluate(expression.args[index], env, context);
    assertType(
      parameter.typeName,
      value,
      parameter.name,
      parameter.line,
      parameter.column,
      target.definitions,
    );
    functionEnv.declare(
      parameter.name,
      parameter.typeName,
      value,
      parameter.line,
      parameter.column,
    );
  });

  context.shared.depth++;
  if (context.shared.depth > 128)
    throw new LanguageError(
      'Call depth limit exceeded.',
      expression.line,
      expression.column,
      expression.span,
    );
  try {
    const value =
      executeStatements(fn.body, functionEnv, target)?.value ?? null;
    if (fn.returnType)
      assertType(
        fn.returnType,
        value,
        fn.name + ' return',
        expression.line,
        expression.column,
        target.definitions,
      );
    return value;
  } finally {
    context.shared.depth--;
  }
}

function numberOperation(
  left: Value,
  right: Value,
  operation: (a: number, b: number) => number,
  name: string,
  location: Located,
): number {
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new LanguageError(
      name + ' expects numbers.',
      location.line,
      location.column,
    );
  }
  return operation(left, right);
}

function compareNumbers(
  left: Value,
  right: Value,
  comparison: (a: number, b: number) => boolean,
  location: Located,
): boolean {
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new LanguageError(
      'Numeric comparison expects numbers.',
      location.line,
      location.column,
    );
  }
  return comparison(left, right);
}

function valuesEqual(left: Value, right: Value): boolean {
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((v, i) => valuesEqual(v, right[i]))
    );
  if (isObject(left) || isObject(right))
    return (
      isObject(left) &&
      isObject(right) &&
      Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every(
        (k) => Object.hasOwn(right, k) && valuesEqual(left[k], right[k]),
      )
    );
  return left === right;
}

function asBoolean(value: Value, line: number, column: number): boolean {
  if (typeof value !== 'boolean')
    throw new LanguageError(
      'Condition must evaluate to true or false.',
      line,
      column,
    );
  return value;
}

function assertType(
  typeName: TypeName,
  value: Value,
  name: string,
  line: number,
  column: number,
  definitions: TypeDefinitions,
) {
  if (!matchesType(typeName, value, definitions)) {
    const variants = definitions.enums.get(typeName)?.values;
    throw new LanguageError(
      variants
        ? '"' +
          name +
          '" must be one of ' +
          variants.join(', ') +
          ' for enum ' +
          typeName +
          '.'
        : '"' +
          name +
          '" is declared as ' +
          typeName +
          ', but the assigned value has a different type.',
      line,
      column,
    );
  }
}
function readMember(target: Value, key: Value, at: Located): Value {
  if (Array.isArray(target)) {
    if (typeof key !== 'number' || !Number.isInteger(key))
      throw new LanguageError(
        'Array indexes must be integers.',
        at.line,
        at.column,
      );
    if (key < 0 || key >= target.length)
      throw new LanguageError(
        'Array index is out of range.',
        at.line,
        at.column,
      );
    return target[key];
  }
  if (isObject(target) && typeof key === 'string' && Object.hasOwn(target, key))
    return target[key];
  throw new LanguageError(
    'Unknown member or invalid index.',
    at.line,
    at.column,
    at.span,
  );
}
function resourcePath(module: string, path: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    /[:\x00-\x1f]/.test(path)
  )
    throw new Error('Invalid resource path.');
  const result =
    path.startsWith('./') || path.startsWith('../')
      ? module.split('/').slice(0, -1)
      : [];
  for (const part of path.split('/')) {
    if (part === '.') continue;
    if (part === '..') {
      if (!result.length) throw new Error('Resource path escapes project.');
      result.pop();
    } else if (part) result.push(part);
  }
  return result.join('/');
}

function inferType(value: Value): TypeName {
  if (typeof value === 'number')
    return Number.isInteger(value) ? 'integer' : 'float';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  return isObject(value) ? 'dictionary' : 'value';
}

function cloneExportValue(
  value: Value,
  line: number,
  column: number,
): ExportValue {
  if (value === null)
    throw new LanguageError('Exported values cannot be empty.', line, column);
  return structuredClone(value);
}

function format(value: Value): string {
  if (Array.isArray(value)) return '[' + value.map(format).join(', ') + ']';
  if (value === null) return 'nothing';
  if (isObject(value)) return JSON.stringify(value);
  return String(value);
}

function tick(context: RuntimeContext, line: number, column: number) {
  context.shared.steps += 1;
  if (context.shared.cancelled())
    throw new LanguageError(
      'Program stopped.',
      line,
      column,
      context.shared.lastSpan,
    );
  if (Date.now() > context.shared.deadline)
    throw new LanguageError(
      'Execution time limit exceeded.',
      line,
      column,
      context.shared.lastSpan,
    );
  if (context.shared.steps > context.shared.maxSteps) {
    throw new LanguageError(
      'Program stopped after too many operations. Check for an endless loop.',
      line,
      column,
    );
  }
}

function appendOutput(context: RuntimeContext, text: string) {
  if (context.shared.truncated) return;
  const line = text.slice(0, 8192);
  if (
    context.shared.output.length >= 1000 ||
    context.shared.outputBytes + line.length > 256_000
  ) {
    context.shared.output.push(
      '[Output limit reached; clear output to resume logging.]',
    );
    context.shared.truncated = true;
    return;
  }
  context.shared.output.push(line);
  context.shared.outputBytes += line.length;
}
function assertResourceValue(value: Value, at: Located) {
  let count = 0;
  let size = 0;
  function visit(v: Value, depth: number) {
    if (typeof v === 'number' && !Number.isFinite(v))
      throw new LanguageError(
        'Numeric result must be finite.',
        at.line,
        at.column,
        at.span,
      );
    size += typeof v === 'string' ? v.length : 8;
    if (
      size > VALUE_LIMITS.aggregate ||
      ++count > VALUE_LIMITS.nodes ||
      depth > VALUE_LIMITS.depth ||
      (typeof v === 'string' && v.length > VALUE_LIMITS.text) ||
      (Array.isArray(v) && v.length > VALUE_LIMITS.collection)
    ) {
      throw new LanguageError(
        'Value exceeds runtime resource limits.',
        at.line,
        at.column,
        at.span,
      );
    }
    if (Array.isArray(v)) v.forEach((x) => visit(x, depth + 1));
    else if (isObject(v)) {
      if (Object.keys(v).length > VALUE_LIMITS.collection)
        throw new LanguageError(
          'Value exceeds runtime resource limits.',
          at.line,
          at.column,
          at.span,
        );
      for (const [key, child] of Object.entries(v)) {
        size += key.length;
        visit(child, depth + 1);
      }
    }
  }
  visit(value, 0);
}
