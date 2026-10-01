import { LanguageError, Token, TokenType, tokenize } from './lexer';
import { PRIMITIVE_TYPES, type Expression, type Parameter, type Statement } from './ast';

interface IfBranch { condition: Expression; body: Statement[] }

export function parseSource(source: string): Statement[] {
  return new Parser(tokenize(source)).parseProgram();
}

class Parser {
  private current = 0;
  private blockDepth = 0;

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
    if (this.matchKeyword('button')) {
      this.requireTopLevel('button');
      return this.buttonStatement();
    }
    if (this.matchKeyword('input')) {
      this.requireTopLevel('input');
      return this.declaration('input');
    }
    if (this.matchKeyword('export')) return this.declaration('export');
    if (this.isDeclarationStart()) return this.declaration(null);

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

  private requireTopLevel(keyword: string) {
    if (this.blockDepth > 0) {
      const token = this.previous();
      throw new LanguageError(keyword + ' declarations must be at the top level.', token.line, token.column);
    }
  }

  private buttonStatement(): Statement {
    const start = this.previous();
    const label = this.consume(TokenType.String, 'Expected a quoted label after button.');
    if (!label.value.trim()) throw new LanguageError('A button needs a non-empty label.', label.line, label.column);
    this.consumeDoHeader('button label');
    const body = this.blockUntil(() => this.isEndSequence('button'));
    this.consumeEndSequence('button');
    return { kind: 'button', label: label.value, body, line: start.line, column: start.column };
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

  private declaration(exposure: 'export' | 'input' | null): Statement {
    const start = exposure ? this.previous() : this.peek();
    const type = this.consumeTypeName('Expected a type name.');
    this.consume(TokenType.Colon, 'Typed declarations require a colon after the type, for example integer: health = 100.');
    const name = this.consume(TokenType.Identifier, 'Expected a variable name after the colon.');
    this.consume(TokenType.Equals, 'Expected = after the variable name.');
    const value = this.expression();
    this.consume(TokenType.Period, 'Expected a period at the end of the declaration.');
    return { kind: 'declare', typeName: type.value, name: name.value, value, exposure, line: start.line, column: start.column };
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
    this.blockDepth += 1;
    const statements: Statement[] = [];
    while (!stop()) {
      if (this.check(TokenType.EndOfFile)) {
        const token = this.peek();
        throw new LanguageError('Reached the end of the file before this block was closed.', token.line, token.column);
      }
      statements.push(this.statement());
    }
    this.blockDepth -= 1;
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
