import { LanguageError, Token, TokenType, tokenize } from './lexer';

type Value = number | string | boolean | Value[];
type ValueType = 'integer' | 'text' | 'boolean' | 'array';

type Expression =
  | { kind: 'literal'; value: Value }
  | { kind: 'identifier'; name: string }
  | { kind: 'array'; values: Expression[] }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression };

type Statement =
  | { kind: 'declare'; valueType: ValueType; name: string; value: Expression }
  | { kind: 'assign'; name: string; value: Expression }
  | { kind: 'print'; values: Expression[] };

interface VariableRecord {
  type: ValueType;
  value: Value;
}

export interface RunResult {
  output: string[];
}

export function runSource(source: string): RunResult {
  const parser = new Parser(tokenize(source));
  const statements = parser.parseProgram();
  const variables = new Map<string, VariableRecord>();
  const output: string[] = [];

  const evaluate = (expression: Expression): Value => {
    if (expression.kind === 'literal') return expression.value;

    if (expression.kind === 'identifier') {
      const variable = variables.get(expression.name);
      if (!variable) throw new LanguageError('Unknown variable "' + expression.name + '".', 1, 1);
      return variable.value;
    }

    if (expression.kind === 'array') return expression.values.map(evaluate);

    if (expression.kind === 'index') {
      const target = evaluate(expression.target);
      const index = evaluate(expression.index);
      if (!Array.isArray(target)) throw new LanguageError('Only arrays can be indexed with [ ].', 1, 1);
      if (typeof index !== 'number' || !Number.isInteger(index)) throw new LanguageError('Array indexes must be integers.', 1, 1);
      if (index < 0 || index >= target.length) throw new LanguageError('Array index is out of range.', 1, 1);
      return target[index];
    }

    const left = evaluate(expression.left);
    const right = evaluate(expression.right);

    if (expression.operator === 'plus') {
      if (typeof left === 'string' || typeof right === 'string') return format(left) + format(right);
      return numberOperation(left, right, (a, b) => a + b, 'plus');
    }
    if (expression.operator === 'minus') return numberOperation(left, right, (a, b) => a - b, 'minus');
    if (expression.operator === 'times') return numberOperation(left, right, (a, b) => a * b, 'times');
    if (expression.operator === 'divided by') {
      if (right === 0) throw new LanguageError('Cannot divide by zero.', 1, 1);
      return numberOperation(left, right, (a, b) => a / b, 'divided by');
    }
    if (expression.operator === 'remainder') return numberOperation(left, right, (a, b) => a % b, 'remainder');

    throw new LanguageError('Unknown operation "' + expression.operator + '".', 1, 1);
  };

  for (const statement of statements) {
    if (statement.kind === 'declare') {
      if (variables.has(statement.name)) throw new LanguageError('Variable "' + statement.name + '" already exists.', 1, 1);
      const value = evaluate(statement.value);
      assertType(statement.valueType, value, statement.name);
      variables.set(statement.name, { type: statement.valueType, value });
    } else if (statement.kind === 'assign') {
      const current = variables.get(statement.name);
      if (!current) throw new LanguageError('Unknown variable "' + statement.name + '".', 1, 1);
      const value = evaluate(statement.value);
      assertType(current.type, value, statement.name);
      current.value = value;
    } else {
      output.push(statement.values.map(evaluate).map(format).join(' '));
    }
  }

  return { output };
}

function numberOperation(left: Value, right: Value, operation: (a: number, b: number) => number, name: string): number {
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new LanguageError(name + ' expects numbers.', 1, 1);
  }
  return operation(left, right);
}

function assertType(type: ValueType, value: Value, name: string) {
  const valid =
    (type === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
    (type === 'text' && typeof value === 'string') ||
    (type === 'boolean' && typeof value === 'boolean') ||
    (type === 'array' && Array.isArray(value));

  if (!valid) throw new LanguageError('"' + name + '" is declared as ' + type + ', but the assigned value has a different type.', 1, 1);
}

function format(value: Value): string {
  if (Array.isArray(value)) return '[' + value.map(format).join(', ') + ']';
  return String(value);
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
    if (this.checkKeyword('integer') || this.checkKeyword('text') || this.checkKeyword('boolean') || this.checkKeyword('array')) {
      const valueType = this.advance().value.toLowerCase() as ValueType;
      const name = this.consume(TokenType.Identifier, 'Expected a variable name.');
      this.consume(TokenType.Equals, 'Expected = after the variable name.');
      const value = this.expression();
      this.consume(TokenType.Period, 'Expected a period at the end of the declaration.');
      return { kind: 'declare', valueType, name: name.value, value };
    }

    if (this.matchKeyword('print')) {
      this.consume(TokenType.OpenParen, 'Expected ( after print.');
      const values: Expression[] = [];
      if (!this.check(TokenType.CloseParen)) {
        do values.push(this.expression()); while (this.match(TokenType.Comma));
      }
      this.consume(TokenType.CloseParen, 'Expected ) after print values.');
      this.consume(TokenType.Period, 'Expected a period after print(...).');
      return { kind: 'print', values };
    }

    if (this.check(TokenType.Identifier) && this.peekNext().type === TokenType.Equals) {
      const name = this.advance().value;
      this.advance();
      const value = this.expression();
      this.consume(TokenType.Period, 'Expected a period at the end of the assignment.');
      return { kind: 'assign', name, value };
    }

    const token = this.peek();
    throw new LanguageError('I do not understand the statement starting with "' + (token.value || 'end of file') + '".', token.line, token.column);
  }

  private expression(): Expression {
    return this.additive();
  }

  private additive(): Expression {
    let expression = this.multiplicative();
    while (this.checkKeyword('plus') || this.checkKeyword('minus')) {
      const operator = this.advance().value.toLowerCase();
      expression = { kind: 'binary', operator, left: expression, right: this.multiplicative() };
    }
    return expression;
  }

  private multiplicative(): Expression {
    let expression = this.postfix();
    while (this.checkKeyword('times') || this.checkKeyword('divided') || this.checkKeyword('remainder')) {
      const raw = this.advance().value.toLowerCase();
      let operator = raw;
      if (raw === 'divided') {
        this.consumeKeyword('by', 'Expected by after divided.');
        operator = 'divided by';
      }
      expression = { kind: 'binary', operator, left: expression, right: this.postfix() };
    }
    return expression;
  }

  private postfix(): Expression {
    let expression = this.primary();
    while (this.match(TokenType.OpenBracket)) {
      const index = this.expression();
      this.consume(TokenType.CloseBracket, 'Expected ] after array index.');
      expression = { kind: 'index', target: expression, index };
    }
    return expression;
  }

  private primary(): Expression {
    if (this.match(TokenType.Number)) return { kind: 'literal', value: Number(this.previous().value) };
    if (this.match(TokenType.String)) return { kind: 'literal', value: this.previous().value };
    if (this.matchKeyword('true')) return { kind: 'literal', value: true };
    if (this.matchKeyword('false')) return { kind: 'literal', value: false };
    if (this.match(TokenType.Identifier)) return { kind: 'identifier', name: this.previous().value };

    if (this.match(TokenType.OpenParen)) {
      const expression = this.expression();
      this.consume(TokenType.CloseParen, 'Expected ) after expression.');
      return expression;
    }

    if (this.match(TokenType.OpenBracket)) {
      const values: Expression[] = [];
      if (!this.check(TokenType.CloseBracket)) {
        do values.push(this.expression()); while (this.match(TokenType.Comma));
      }
      this.consume(TokenType.CloseBracket, 'Expected ] after array.');
      return { kind: 'array', values };
    }

    const token = this.peek();
    throw new LanguageError('Expected a value but found "' + (token.value || 'end of file') + '".', token.line, token.column);
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
