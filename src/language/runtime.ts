import { LanguageError, Token, TokenType, tokenize } from './lexer';

export type Value = number | string | boolean | Value[] | null;
export type ExportValue = number | string | boolean | Value[];
export type ExportOverrides = Record<string, ExportValue>;

type TypeName = string;
type Located = { line: number; column: number };

type Expression = Located & (
  | { kind: 'literal'; value: Value }
  | { kind: 'identifier'; name: string }
  | { kind: 'array'; values: Expression[] }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'call'; name: string; args: Expression[] }
  | { kind: 'unary'; operator: 'not' | 'negative'; value: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
);

interface Parameter {
  typeName: TypeName;
  name: string;
  line: number;
  column: number;
}

interface IfBranch {
  condition: Expression;
  body: Statement[];
}

type Statement = Located & (
  | { kind: 'enum'; name: string; values: string[] }
  | { kind: 'declare'; typeName: TypeName; name: string; value: Expression; exported: boolean }
  | { kind: 'assign'; name: string; value: Expression }
  | { kind: 'print'; values: Expression[] }
  | { kind: 'if'; branches: IfBranch[]; elseBody: Statement[] | null }
  | { kind: 'while'; condition: Expression; body: Statement[] }
  | { kind: 'forEach'; itemName: string; iterable: Expression; body: Statement[] }
  | { kind: 'forRange'; typeName: TypeName; itemName: string; start: Expression; end: Expression; step: Expression | null; body: Statement[] }
  | { kind: 'function'; name: string; parameters: Parameter[]; body: Statement[] }
  | { kind: 'return'; value: Expression | null }
  | { kind: 'expression'; expression: Expression }
);

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

export interface ExportField {
  name: string;
  typeName: string;
  control: 'number' | 'text' | 'boolean' | 'enum' | 'array';
  defaultValue: ExportValue;
  options?: string[];
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
  output: string[];
  globals: Environment;
  enums: Map<string, EnumDefinition>;
  enumValues: Set<string>;
  functions: Map<string, FunctionDefinition>;
  overrides: ExportOverrides;
  steps: number;
}

interface ReturnSignal {
  returned: true;
  value: Value;
}

const MAX_STEPS = 100_000;
const PRIMITIVE_TYPES = new Set(['integer', 'text', 'boolean', 'array']);

export function validateSource(source: string): void {
  parseSource(source);
}

export function inspectSource(source: string): ExportField[] {
  const statements = parseSource(source);
  const enums = collectEnums(statements);
  const enumValues = new Set(Array.from(enums.values()).flatMap((item) => item.values));
  const globals = new Environment();
  const context: RuntimeContext = {
    output: [], globals, enums, enumValues, functions: collectFunctions(statements), overrides: {}, steps: 0
  };

  const fields: ExportField[] = [];

  for (const statement of statements) {
    if (statement.kind === 'enum' || statement.kind === 'function') continue;
    if (statement.kind !== 'declare') continue;

    const value = evaluate(statement.value, globals, context);
    assertType(statement.typeName, value, statement.name, statement.line, statement.column, enums);
    globals.declare(statement.name, statement.typeName, value, statement.line, statement.column);

    if (!statement.exported) continue;
    fields.push({
      name: statement.name,
      typeName: statement.typeName,
      control: controlForType(statement.typeName, enums),
      defaultValue: cloneExportValue(value, statement.line, statement.column),
      options: enums.get(statement.typeName)?.values
    });
  }

  return fields;
}

export function runSource(source: string, overrides: ExportOverrides = {}): RunResult {
  const statements = parseSource(source);
  const enums = collectEnums(statements);
  const context: RuntimeContext = {
    output: [],
    globals: new Environment(),
    enums,
    enumValues: new Set(Array.from(enums.values()).flatMap((item) => item.values)),
    functions: collectFunctions(statements),
    overrides,
    steps: 0
  };

  executeStatements(statements, context.globals, context, true);
  return { output: context.output };
}

function parseSource(source: string): Statement[] {
  return new Parser(tokenize(source)).parseProgram();
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
    if (functions.has(statement.name)) {
      throw new LanguageError('Function "' + statement.name + '" is already defined.', statement.line, statement.column);
    }
    functions.set(statement.name, { statement });
  }
  return functions;
}

function executeStatements(statements: Statement[], env: Environment, context: RuntimeContext, topLevel = false): ReturnSignal | null {
  for (const statement of statements) {
    tick(context, statement.line, statement.column);

    if (statement.kind === 'enum' || statement.kind === 'function') continue;

    if (statement.kind === 'declare') {
      let value = evaluate(statement.value, env, context);
      if (statement.exported && Object.prototype.hasOwnProperty.call(context.overrides, statement.name)) {
        value = context.overrides[statement.name];
      }
      assertType(statement.typeName, value, statement.name, statement.line, statement.column, context.enums);
      env.declare(statement.name, statement.typeName, value, statement.line, statement.column);
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
      context.output.push(statement.values.map((value) => format(evaluate(value, env, context))).join(' '));
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
        tick(context, statement.line, statement.column);
        assertType(statement.typeName, value, statement.itemName, statement.line, statement.column, context.enums);
        const loopEnv = new Environment(env);
        loopEnv.declare(statement.itemName, statement.typeName, value, statement.line, statement.column);
        const result = executeStatements(statement.body, loopEnv, context, topLevel);
        if (result) return result;
      }
    }
  }

  return null;
}

function evaluate(expression: Expression, env: Environment, context: RuntimeContext): Value {
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
  const definition = context.functions.get(expression.name);
  if (!definition) throw new LanguageError('Unknown function "' + expression.name + '".', expression.line, expression.column);

  const fn = definition.statement;
  if (fn.parameters.length !== expression.args.length) {
    throw new LanguageError(
      'Function "' + fn.name + '" expects ' + fn.parameters.length + ' argument(s), but received ' + expression.args.length + '.',
      expression.line,
      expression.column
    );
  }

  const functionEnv = new Environment(context.globals);
  fn.parameters.forEach((parameter, index) => {
    const value = evaluate(expression.args[index], env, context);
    assertType(parameter.typeName, value, parameter.name, parameter.line, parameter.column, context.enums);
    functionEnv.declare(parameter.name, parameter.typeName, value, parameter.line, parameter.column);
  });

  const result = executeStatements(fn.body, functionEnv, context);
  return result?.value ?? null;
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
  return Array.isArray(value) ? value.map((item) => item) : value;
}

function format(value: Value): string {
  if (Array.isArray(value)) return '[' + value.map(format).join(', ') + ']';
  if (value === null) return 'nothing';
  return String(value);
}

function tick(context: RuntimeContext, line: number, column: number) {
  context.steps += 1;
  if (context.steps > MAX_STEPS) {
    throw new LanguageError('Program stopped after too many operations. Check for an endless loop.', line, column);
  }
}

class Parser {
  private current = 0;

  constructor(private tokens: Token[]) {}

  parseProgram(): Statement[] {
    const statements: Statement[] = [];
    while (!this.check(TokenType.EndOfFile)) statements.push(this.statement());
    return statements;
  }

  private statement(): Statement {
    if (this.matchKeyword('enum')) return this.enumStatement();
    if (this.matchKeyword('function')) return this.functionStatement();
    if (this.matchKeyword('if')) return this.ifStatement();
    if (this.matchKeyword('while')) return this.whileStatement();
    if (this.matchKeyword('for')) return this.forStatement();
    if (this.matchKeyword('return')) return this.returnStatement();
    if (this.matchKeyword('export')) return this.declaration(true);
    if (this.isDeclarationStart()) return this.declaration(false);

    if (this.matchKeyword('print')) {
      const start = this.previous();
      this.consume(TokenType.OpenParen, 'Expected ( after print.');
      const values = this.argumentList(TokenType.CloseParen);
      this.consume(TokenType.CloseParen, 'Expected ) after print values.');
      this.consume(TokenType.Period, 'Expected a period after print(...).');
      return { kind: 'print', values, line: start.line, column: start.column };
    }

    if (this.check(TokenType.Identifier) && this.peekNext().type === TokenType.Equals) {
      const name = this.advance();
      this.advance();
      const value = this.expression();
      this.consume(TokenType.Period, 'Expected a period at the end of the assignment.');
      return { kind: 'assign', name: name.value, value, line: name.line, column: name.column };
    }

    if (this.check(TokenType.Identifier) && this.peekNext().type === TokenType.OpenParen) {
      const expression = this.expression();
      this.consume(TokenType.Period, 'Expected a period after the function call.');
      return { kind: 'expression', expression, line: expression.line, column: expression.column };
    }

    const token = this.peek();
    throw new LanguageError('I do not understand the statement starting with "' + (token.value || 'end of file') + '".', token.line, token.column);
  }

  private enumStatement(): Statement {
    const start = this.previous();
    const name = this.consume(TokenType.Identifier, 'Expected an enum name after enum.');
    this.consume(TokenType.OpenBracket, 'Expected [ after the enum name.');
    const values: string[] = [];
    if (!this.check(TokenType.CloseBracket)) {
      do {
        const value = this.consume(TokenType.Identifier, 'Enum entries must be simple names.');
        if (values.includes(value.value)) throw new LanguageError('Enum value "' + value.value + '" is duplicated.', value.line, value.column);
        values.push(value.value);
      } while (this.match(TokenType.Comma));
    }
    this.consume(TokenType.CloseBracket, 'Expected ] after enum entries.');
    this.consume(TokenType.Period, 'Expected a period after the enum declaration.');
    if (!values.length) throw new LanguageError('An enum needs at least one value.', name.line, name.column);
    return { kind: 'enum', name: name.value, values, line: start.line, column: start.column };
  }

  private declaration(exported: boolean): Statement {
    const start = exported ? this.previous() : this.peek();
    const type = this.consumeTypeName('Expected a type name.');
    this.consume(TokenType.Colon, 'Typed declarations require a colon after the type, for example integer: health = 100.');
    const name = this.consume(TokenType.Identifier, 'Expected a variable name after the colon.');
    this.consume(TokenType.Equals, 'Expected = after the variable name.');
    const value = this.expression();
    this.consume(TokenType.Period, 'Expected a period at the end of the declaration.');
    return { kind: 'declare', typeName: type.value, name: name.value, value, exported, line: start.line, column: start.column };
  }

  private functionStatement(): Statement {
    const start = this.previous();
    const name = this.consume(TokenType.Identifier, 'Expected a function name.');
    this.consume(TokenType.OpenParen, 'Expected ( after the function name.');
    const parameters: Parameter[] = [];
    if (!this.check(TokenType.CloseParen)) {
      do {
        const type = this.consumeTypeName('Expected a parameter type.');
        this.consume(TokenType.Colon, 'Function parameters require a colon between type and name.');
        const parameterName = this.consume(TokenType.Identifier, 'Expected a parameter name.');
        parameters.push({ typeName: type.value, name: parameterName.value, line: parameterName.line, column: parameterName.column });
      } while (this.match(TokenType.Comma));
    }
    this.consume(TokenType.CloseParen, 'Expected ) after the parameters.');
    this.consume(TokenType.Period, 'Expected a period after the function signature.');
    const body = this.blockUntil(() => this.isEndSequence('function'));
    this.consumeEndSequence('function');
    return { kind: 'function', name: name.value, parameters, body, line: start.line, column: start.column };
  }

  private ifStatement(): Statement {
    const start = this.previous();
    const branches: IfBranch[] = [];
    const firstCondition = this.expression();
    this.consumeDoHeader('if condition');
    branches.push({ condition: firstCondition, body: this.blockUntil(() => this.checkKeyword('elif') || this.checkKeyword('else') || this.isEndSequence('if')) });

    while (this.matchKeyword('elif')) {
      const condition = this.expression();
      this.consumeDoHeader('elif condition');
      branches.push({ condition, body: this.blockUntil(() => this.checkKeyword('elif') || this.checkKeyword('else') || this.isEndSequence('if')) });
    }

    let elseBody: Statement[] | null = null;
    if (this.matchKeyword('else')) {
      this.consume(TokenType.Comma, 'Expected a comma after else.');
      this.consumeKeyword('do', 'Expected do after else,.');
      this.consume(TokenType.Period, 'Expected a period after else, do.');
      elseBody = this.blockUntil(() => this.isEndSequence('if'));
    }

    this.consumeEndSequence('if');
    return { kind: 'if', branches, elseBody, line: start.line, column: start.column };
  }

  private whileStatement(): Statement {
    const start = this.previous();
    const condition = this.expression();
    this.consumeDoHeader('while condition');
    const body = this.blockUntil(() => this.isEndSequence('while'));
    this.consumeEndSequence('while');
    return { kind: 'while', condition, body, line: start.line, column: start.column };
  }

  private forStatement(): Statement {
    const start = this.previous();

    if (this.matchKeyword('each')) {
      const item = this.consume(TokenType.Identifier, 'Expected a loop variable after for each.');
      this.consumeKeyword('in', 'Expected in after the loop variable.');
      const iterable = this.expression();
      this.consumeDoHeader('for each loop');
      const body = this.blockUntil(() => this.isEndSequence('for'));
      this.consumeEndSequence('for');
      return { kind: 'forEach', itemName: item.value, iterable, body, line: start.line, column: start.column };
    }

    const type = this.consumeTypeName('Expected each or a typed range variable after for.');
    this.consume(TokenType.Colon, 'Range for loops require a colon after the variable type.');
    const item = this.consume(TokenType.Identifier, 'Expected a range loop variable.');
    this.consumeKeyword('from', 'Expected from in the range loop.');
    const from = this.expression();
    this.consumeKeyword('to', 'Expected to in the range loop.');
    const to = this.expression();
    let step: Expression | null = null;
    if (this.matchKeyword('step')) step = this.expression();
    this.consumeDoHeader('for loop');
    const body = this.blockUntil(() => this.isEndSequence('for'));
    this.consumeEndSequence('for');
    return { kind: 'forRange', typeName: type.value, itemName: item.value, start: from, end: to, step, body, line: start.line, column: start.column };
  }

  private returnStatement(): Statement {
    const start = this.previous();
    const value = this.check(TokenType.Period) ? null : this.expression();
    this.consume(TokenType.Period, 'Expected a period after return.');
    return { kind: 'return', value, line: start.line, column: start.column };
  }

  private blockUntil(stop: () => boolean): Statement[] {
    const statements: Statement[] = [];
    while (!stop()) {
      if (this.check(TokenType.EndOfFile)) {
        const token = this.peek();
        throw new LanguageError('Reached the end of the file before this block was closed.', token.line, token.column);
      }
      statements.push(this.statement());
    }
    return statements;
  }

  private expression(): Expression {
    return this.orExpression();
  }

  private orExpression(): Expression {
    let expression = this.andExpression();
    while (this.matchKeyword('or')) {
      const operator = this.previous();
      expression = { kind: 'binary', operator: 'or', left: expression, right: this.andExpression(), line: operator.line, column: operator.column };
    }
    return expression;
  }

  private andExpression(): Expression {
    let expression = this.comparison();
    while (this.matchKeyword('and')) {
      const operator = this.previous();
      expression = { kind: 'binary', operator: 'and', left: expression, right: this.comparison(), line: operator.line, column: operator.column };
    }
    return expression;
  }

  private comparison(): Expression {
    let expression = this.additive();
    if (!this.matchKeyword('is')) return expression;

    const operatorToken = this.previous();
    let operator = 'is';

    if (this.matchKeyword('not')) {
      operator = 'is not';
      if (this.matchKeyword('equal')) this.consumeKeyword('to', 'Expected to after is not equal.');
    } else if (this.matchKeyword('equal')) {
      this.consumeKeyword('to', 'Expected to after is equal.');
      operator = 'is';
    } else if (this.matchKeyword('less')) {
      this.consumeKeyword('than', 'Expected than after is less.');
      operator = 'less than';
      if (this.matchKeyword('or')) {
        this.consumeKeyword('equal', 'Expected equal after less than or.');
        this.consumeKeyword('to', 'Expected to after less than or equal.');
        operator = 'less than or equal to';
      }
    } else if (this.matchKeyword('greater')) {
      this.consumeKeyword('than', 'Expected than after is greater.');
      operator = 'greater than';
      if (this.matchKeyword('or')) {
        this.consumeKeyword('equal', 'Expected equal after greater than or.');
        this.consumeKeyword('to', 'Expected to after greater than or equal.');
        operator = 'greater than or equal to';
      }
    }

    return { kind: 'binary', operator, left: expression, right: this.additive(), line: operatorToken.line, column: operatorToken.column };
  }

  private additive(): Expression {
    let expression = this.multiplicative();
    while (this.checkKeyword('plus') || this.checkKeyword('minus') || this.check(TokenType.Plus) || this.check(TokenType.Minus)) {
      const token = this.advance();
      const operator = token.type === TokenType.Plus || token.value.toLowerCase() === 'plus' ? 'plus' : 'minus';
      expression = { kind: 'binary', operator, left: expression, right: this.multiplicative(), line: token.line, column: token.column };
    }
    return expression;
  }

  private multiplicative(): Expression {
    let expression = this.unary();
    while (
      this.checkKeyword('times') || this.checkKeyword('divided') || this.checkKeyword('remainder') ||
      this.check(TokenType.Star) || this.check(TokenType.Slash)
    ) {
      const token = this.advance();
      let operator: string;
      if (token.type === TokenType.Star || token.value.toLowerCase() === 'times') operator = 'times';
      else if (token.type === TokenType.Slash) operator = 'divided by';
      else if (token.value.toLowerCase() === 'divided') {
        this.consumeKeyword('by', 'Expected by after divided.');
        operator = 'divided by';
      } else operator = 'remainder';
      expression = { kind: 'binary', operator, left: expression, right: this.unary(), line: token.line, column: token.column };
    }
    return expression;
  }

  private unary(): Expression {
    if (this.matchKeyword('not')) {
      const token = this.previous();
      return { kind: 'unary', operator: 'not', value: this.unary(), line: token.line, column: token.column };
    }
    if (this.match(TokenType.Minus)) {
      const token = this.previous();
      return { kind: 'unary', operator: 'negative', value: this.unary(), line: token.line, column: token.column };
    }
    return this.postfix();
  }

  private postfix(): Expression {
    let expression = this.primary();

    while (true) {
      if (this.match(TokenType.OpenParen)) {
        if (expression.kind !== 'identifier') {
          const token = this.previous();
          throw new LanguageError('Only named functions can be called.', token.line, token.column);
        }
        const args = this.argumentList(TokenType.CloseParen);
        this.consume(TokenType.CloseParen, 'Expected ) after function arguments.');
        expression = { kind: 'call', name: expression.name, args, line: expression.line, column: expression.column };
        continue;
      }

      if (this.match(TokenType.OpenBracket)) {
        const open = this.previous();
        const index = this.expression();
        this.consume(TokenType.CloseBracket, 'Expected ] after array index.');
        expression = { kind: 'index', target: expression, index, line: open.line, column: open.column };
        continue;
      }

      return expression;
    }
  }

  private primary(): Expression {
    if (this.match(TokenType.Number)) {
      const token = this.previous();
      return { kind: 'literal', value: Number(token.value), line: token.line, column: token.column };
    }
    if (this.match(TokenType.String)) {
      const token = this.previous();
      return { kind: 'literal', value: token.value, line: token.line, column: token.column };
    }
    if (this.matchKeyword('true')) {
      const token = this.previous();
      return { kind: 'literal', value: true, line: token.line, column: token.column };
    }
    if (this.matchKeyword('false')) {
      const token = this.previous();
      return { kind: 'literal', value: false, line: token.line, column: token.column };
    }
    if (this.match(TokenType.Identifier)) {
      const token = this.previous();
      return { kind: 'identifier', name: token.value, line: token.line, column: token.column };
    }

    if (this.match(TokenType.OpenParen)) {
      const expression = this.expression();
      this.consume(TokenType.CloseParen, 'Expected ) after expression.');
      return expression;
    }

    if (this.match(TokenType.OpenBracket)) {
      const open = this.previous();
      const values = this.argumentList(TokenType.CloseBracket);
      this.consume(TokenType.CloseBracket, 'Expected ] after array.');
      return { kind: 'array', values, line: open.line, column: open.column };
    }

    const token = this.peek();
    throw new LanguageError('Expected a value but found "' + (token.value || 'end of file') + '".', token.line, token.column);
  }

  private argumentList(endType: TokenType): Expression[] {
    const values: Expression[] = [];
    if (!this.check(endType)) {
      do values.push(this.expression()); while (this.match(TokenType.Comma));
    }
    return values;
  }

  private consumeDoHeader(label: string) {
    this.consume(TokenType.Comma, 'Expected a comma after the ' + label + '.');
    this.consumeKeyword('do', 'Expected do after the comma.');
    this.consume(TokenType.Period, 'Expected a period after do.');
  }

  private isDeclarationStart(): boolean {
    const token = this.peek();
    const validType =
      (token.type === TokenType.Keyword && PRIMITIVE_TYPES.has(token.value.toLowerCase())) ||
      token.type === TokenType.Identifier;
    return validType && this.peekNext().type === TokenType.Colon;
  }

  private consumeTypeName(message: string): Token {
    const token = this.peek();
    if ((token.type === TokenType.Keyword && PRIMITIVE_TYPES.has(token.value.toLowerCase())) || token.type === TokenType.Identifier) {
      return this.advance();
    }
    throw new LanguageError(message, token.line, token.column);
  }

  private isEndSequence(keyword: string): boolean {
    return this.checkKeyword('end') && this.peekNext().type === TokenType.Keyword && this.peekNext().value.toLowerCase() === keyword;
  }

  private consumeEndSequence(keyword: string) {
    this.consumeKeyword('end', 'Expected end ' + keyword + '.');
    this.consumeKeyword(keyword, 'Expected ' + keyword + ' after end.');
    this.consume(TokenType.Period, 'Expected a period after end ' + keyword + '.');
  }

  private match(type: TokenType): boolean {
    if (!this.check(type)) return false;
    this.advance();
    return true;
  }

  private matchKeyword(keyword: string): boolean {
    if (!this.checkKeyword(keyword)) return false;
    this.advance();
    return true;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    const token = this.peek();
    throw new LanguageError(message, token.line, token.column);
  }

  private consumeKeyword(keyword: string, message: string): Token {
    if (this.checkKeyword(keyword)) return this.advance();
    const token = this.peek();
    throw new LanguageError(message, token.line, token.column);
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private checkKeyword(keyword: string): boolean {
    const token = this.peek();
    return token.type === TokenType.Keyword && token.value.toLowerCase() === keyword;
  }

  private advance(): Token {
    if (!this.check(TokenType.EndOfFile)) this.current += 1;
    return this.previous();
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekNext(): Token {
    return this.tokens[Math.min(this.current + 1, this.tokens.length - 1)];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}
