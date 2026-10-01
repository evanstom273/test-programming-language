import { BUILTIN_FUNCTIONS } from './builtins';
import { LanguageError, Token, TokenType, tokenize } from './lexer';
import {
  PRIMITIVE_TYPES,
  type Annotation,
  type Value,
  type Expression,
  type Parameter,
  type Statement,
} from './ast';

interface IfBranch {
  condition: Expression;
  body: Statement[];
}

export function parseSource(source: string, fileId = 'main.lang'): Statement[] {
  const ast = new Parser(tokenize(source, fileId)).parseProgram();
  function spans(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(node))
      if (key !== 'span') spans(child);
    if (node.kind === 'binary') {
      const binary = node as unknown as Extract<Expression, { kind: 'binary' }>;
      binary.span = {
        fileId,
        start:
          binary.span.start.offset < binary.left.span.start.offset
            ? binary.span.start
            : binary.left.span.start,
        end:
          binary.span.end.offset > binary.right.span.end.offset
            ? binary.span.end
            : binary.right.span.end,
      };
    }
  }
  spans(ast);
  return ast;
}

/** Completed top-level declarations remain useful while an editor buffer is incomplete. */
export function parseSourcePrefix(source: string, fileId: string): Statement[] {
  try {
    return new Parser(tokenize(source, fileId)).parsePrefix();
  } catch {
    return [];
  }
}

class Parser {
  private current = 0;
  private blockDepth = 0;
  private sceneDepth = 0;

  constructor(private tokens: Token[]) {}

  parseProgram(): Statement[] {
    const statements: Statement[] = [];
    while (!this.check(TokenType.EndOfFile)) statements.push(this.statement());
    return statements;
  }

  parsePrefix(): Statement[] {
    const result: Statement[] = [];
    while (!this.check(TokenType.EndOfFile)) {
      try {
        result.push(this.statement());
      } catch {
        break;
      }
    }
    return result;
  }

  private span(start: Token) {
    return {
      fileId: start.span.fileId,
      start: start.span.start,
      end: this.previous().span.end,
    };
  }
  private statement(): Statement {
    const start = this.peek();
    const result = this.statementBody();
    result.span = this.span(start);
    return result;
  }
  private statementBody(): Statement {
    if (this.check(TokenType.At)) {
      const annotations: Annotation[] = [];
      while (this.match(TokenType.At)) {
        const start = this.previous();
        const name = this.advance();
        if (![TokenType.Identifier, TokenType.Keyword].includes(name.type))
          throw new LanguageError(
            'Expected annotation name.',
            name.line,
            name.column,
            name.span,
          );
        const args: Value[] = [];
        if (this.match(TokenType.OpenParen)) {
          if (!this.check(TokenType.CloseParen))
            do {
              const negative = this.match(TokenType.Minus);
              const token = this.advance();
              if (token.type === TokenType.Number)
                args.push(Number(token.value) * (negative ? -1 : 1));
              else if (token.type === TokenType.String && !negative)
                args.push(token.value);
              else
                throw new LanguageError(
                  'Annotation arguments must be numeric or text literals; calls are not evaluated.',
                  token.line,
                  token.column,
                  token.span,
                );
            } while (this.match(TokenType.Comma));
          this.consume(
            TokenType.CloseParen,
            'Expected ) after annotation arguments.',
          );
        }
        annotations.push({
          name: name.value,
          args,
          line: start.line,
          column: start.column,
          span: this.span(start),
        });
      }
      const declaration = this.statement();
      if (declaration.kind !== 'declare' || !declaration.exposure)
        throw new LanguageError(
          'Control annotations require an export or input declaration.',
          declaration.line,
          declaration.column,
          declaration.span,
        );
      declaration.annotations = annotations;
      return declaration;
    }
    if (this.matchKeyword('constant')) {
      const declaration = this.declaration(null);
      if (declaration.kind === 'declare') declaration.constant = true;
      return declaration;
    }
    if (this.matchKeyword('scene')) {
      this.requireTopLevel('scene');
      const start = this.previous();
      const name = this.consume(TokenType.Identifier, 'Expected scene name.');
      this.consume(TokenType.Period, 'Expected period after scene name.');
      this.sceneDepth += 1;
      const body = this.blockUntil(() => this.isEndSequence('scene'));
      for (const child of body) {
        if (
          ![
            'declare',
            'button',
            'handler',
            'heading',
            'paragraph',
            'stat',
            'progress',
          ].includes(child.kind)
        )
          throw new LanguageError(
            'Scene bodies contain controls, display statements and handlers only. Put executable statements inside on enter or a button.',
            child.line,
            child.column,
            child.span,
          );
      }
      this.sceneDepth -= 1;
      this.consumeEndSequence('scene');
      return {
        kind: 'scene',
        name: name.value,
        body,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('record')) {
      this.requireTopLevel('record');
      const start = this.previous();
      const name = this.consume(TokenType.Identifier, 'Expected record name.');
      this.consume(TokenType.OpenBracket, 'Expected [ before record fields.');
      const fields = this.parameters(TokenType.CloseBracket);
      this.consume(TokenType.CloseBracket, 'Expected ] after record fields.');
      this.consume(TokenType.Period, 'Expected period after record.');
      return {
        kind: 'record',
        name: name.value,
        fields,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('signal')) {
      this.requireTopLevel('signal');
      const start = this.previous();
      const name = this.consume(TokenType.Identifier, 'Expected signal name.');
      this.consume(TokenType.OpenParen, 'Expected ( after signal name.');
      const parameters = this.parameters(TokenType.CloseParen);
      this.consume(TokenType.CloseParen, 'Expected ) after signal parameters.');
      this.consume(TokenType.Period, 'Expected period after signal.');
      return {
        kind: 'signal',
        name: name.value,
        parameters,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('on')) {
      this.requireTopLevelOrScene('on');
      const start = this.previous();
      const event = this.consume(
        TokenType.Identifier,
        'Expected event or signal name.',
      );
      let parameters: Parameter[] = [];
      if (this.match(TokenType.OpenParen)) {
        parameters = this.parameters(TokenType.CloseParen);
        this.consume(TokenType.CloseParen, 'Expected ).');
      }
      this.consumeDoHeader('event');
      const body = this.blockUntil(() => this.isEndSequence('on'));
      this.consumeEndSequence('on');
      return {
        kind: 'handler',
        event: event.value,
        parameters,
        body,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('emit')) {
      const start = this.previous();
      const name = this.consume(TokenType.Identifier, 'Expected signal name.');
      this.consume(TokenType.OpenParen, 'Expected ( after signal.');
      const args = this.argumentList(TokenType.CloseParen);
      this.consume(TokenType.CloseParen, 'Expected ).');
      this.consume(TokenType.Period, 'Expected period after emit.');
      return {
        kind: 'emit',
        name: name.value,
        args,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('import')) {
      this.requireTopLevel('import');
      const start = this.previous();
      const path = this.consume(
        TokenType.String,
        'Expected quoted relative module path.',
      );
      this.consumeKeyword('as', 'Expected as before the module namespace.');
      const alias = this.consume(
        TokenType.Identifier,
        'Expected module namespace.',
      );
      this.consume(TokenType.Period, 'Expected period after import.');
      return {
        kind: 'import',
        path: path.value,
        alias: alias.value,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('public')) {
      this.requireTopLevel('public');
      this.consumeKeyword(
        'function',
        'public currently exposes functions only.',
      );
      const fn = this.functionStatement();
      if (fn.kind === 'function') fn.public = true;
      return fn;
    }
    if (this.matchKeyword('go')) {
      const start = this.previous();
      this.consumeKeyword('to', 'Expected to after go.');
      const name = this.consume(
        TokenType.Identifier,
        'Expected scene name after go to.',
      );
      this.consume(TokenType.Period, 'Expected period after scene transition.');
      return {
        kind: 'goScene',
        name: name.value,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('heading')) {
      this.requireSceneRoot('heading');
      const start = this.previous();
      const text = this.consume(
        TokenType.String,
        'Expected quoted heading text.',
      );
      this.consume(TokenType.Period, 'Expected period after heading.');
      return {
        kind: 'heading',
        text: text.value,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('paragraph')) {
      this.requireSceneRoot('paragraph');
      const start = this.previous();
      const text = this.consume(
        TokenType.String,
        'Expected quoted paragraph text.',
      );
      this.consume(TokenType.Period, 'Expected period after paragraph.');
      return {
        kind: 'paragraph',
        text: text.value,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('stat')) {
      this.requireSceneRoot('stat');
      const start = this.previous();
      const label = this.consume(
        TokenType.String,
        'Expected quoted stat label.',
      );
      this.consume(TokenType.Comma, 'Expected comma after stat label.');
      const value = this.expression();
      this.consume(TokenType.Period, 'Expected period after stat.');
      return {
        kind: 'stat',
        label: label.value,
        value,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('progress')) {
      this.requireSceneRoot('progress');
      const start = this.previous();
      const label = this.consume(
        TokenType.String,
        'Expected quoted progress label.',
      );
      this.consume(TokenType.Comma, 'Expected comma after progress label.');
      const value = this.expression();
      this.consume(TokenType.Comma, 'Expected comma before progress maximum.');
      const maximum = this.expression();
      this.consume(TokenType.Period, 'Expected period after progress.');
      return {
        kind: 'progress',
        label: label.value,
        value,
        maximum,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.matchKeyword('enum')) return this.enumStatement();
    if (this.matchKeyword('function')) return this.functionStatement();
    if (this.matchKeyword('if')) return this.ifStatement();
    if (this.matchKeyword('while')) return this.whileStatement();
    if (this.matchKeyword('for')) return this.forStatement();
    if (this.matchKeyword('return')) return this.returnStatement();
    if (this.matchKeyword('break') || this.matchKeyword('continue')) {
      const token = this.previous();
      this.consume(TokenType.Period, 'Expected . after ' + token.value + '.');
      return {
        kind: token.value.toLowerCase() as 'break' | 'continue',
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    if (this.matchKeyword('button')) {
      this.requireTopLevelOrScene('button');
      return this.buttonStatement();
    }
    if (this.matchKeyword('input')) {
      this.requireTopLevelOrScene('input');
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
      return {
        kind: 'print',
        values,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }

    if (
      this.check(TokenType.Identifier) &&
      this.peekNext().type === TokenType.Equals
    ) {
      const name = this.advance();
      this.advance();
      const value = this.expression();
      this.consume(
        TokenType.Period,
        'Expected a period at the end of the assignment.',
      );
      return {
        kind: 'assign',
        name: name.value,
        value,
        line: name.line,
        column: name.column,
        span: this.span(name),
      };
    }

    if (this.check(TokenType.Identifier)) {
      const expression = this.expression();
      if (this.match(TokenType.Equals)) {
        if (!['identifier', 'member', 'index'].includes(expression.kind))
          throw new LanguageError(
            'Invalid assignment target.',
            expression.line,
            expression.column,
            expression.span,
          );
        const value = this.expression();
        this.consume(TokenType.Period, 'Expected period after assignment.');
        return {
          kind: 'set',
          target: expression,
          value,
          line: expression.line,
          column: expression.column,
          span: expression.span,
        };
      }
      this.consume(
        TokenType.Period,
        'Expected a period after the function call.',
      );
      return {
        kind: 'expression',
        expression,
        line: expression.line,
        column: expression.column,
        span: expression.span,
      };
    }

    const token = this.peek();
    throw new LanguageError(
      'I do not understand the statement starting with "' +
        (token.value || 'end of file') +
        '".',
      token.line,
      token.column,
      token.span,
    );
  }

  private requireTopLevel(keyword: string) {
    if (this.blockDepth > 0) {
      const token = this.previous();
      throw new LanguageError(
        keyword + ' declarations must be at the top level.',
        token.line,
        token.column,
        token.span,
      );
    }
  }

  private inSceneRoot() {
    return this.sceneDepth > 0 && this.blockDepth === this.sceneDepth;
  }

  private requireTopLevelOrScene(keyword: string) {
    if (this.blockDepth > 0 && !this.inSceneRoot()) {
      const token = this.previous();
      throw new LanguageError(
        keyword +
          ' declarations must be at the top level or directly inside a scene.',
        token.line,
        token.column,
        token.span,
      );
    }
  }

  private requireSceneRoot(keyword: string) {
    if (!this.inSceneRoot()) {
      const token = this.previous();
      throw new LanguageError(
        keyword + ' is only valid directly inside a scene.',
        token.line,
        token.column,
        token.span,
      );
    }
  }

  private buttonStatement(): Statement {
    const start = this.previous();
    const label = this.consume(
      TokenType.String,
      'Expected a quoted label after button.',
    );
    if (!label.value.trim())
      throw new LanguageError(
        'A button needs a non-empty label.',
        label.line,
        label.column,
        label.span,
      );
    this.consumeDoHeader('button label');
    const body = this.blockUntil(() => this.isEndSequence('button'));
    this.consumeEndSequence('button');
    return {
      kind: 'button',
      label: label.value,
      body,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private enumStatement(): Statement {
    const start = this.previous();
    const name = this.consume(
      TokenType.Identifier,
      'Expected an enum name after enum.',
    );
    this.consume(TokenType.OpenBracket, 'Expected [ after the enum name.');
    const values: string[] = [];
    if (!this.check(TokenType.CloseBracket)) {
      do {
        const value = this.consume(
          TokenType.Identifier,
          'Enum entries must be simple names.',
        );
        if (values.includes(value.value))
          throw new LanguageError(
            'Enum value "' + value.value + '" is duplicated.',
            value.line,
            value.column,
            value.span,
          );
        values.push(value.value);
      } while (this.match(TokenType.Comma));
    }
    this.consume(TokenType.CloseBracket, 'Expected ] after enum entries.');
    this.consume(
      TokenType.Period,
      'Expected a period after the enum declaration.',
    );
    if (!values.length)
      throw new LanguageError(
        'An enum needs at least one value.',
        name.line,
        name.column,
        name.span,
      );
    return {
      kind: 'enum',
      name: name.value,
      values,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private declaration(exposure: 'export' | 'input' | null): Statement {
    const start = exposure ? this.previous() : this.peek();
    if (this.inSceneRoot() && exposure !== 'input') {
      throw new LanguageError(
        'Scenes may declare input controls only. Keep persistent state at module top level.',
        start.line,
        start.column,
        start.span,
      );
    }
    const type = this.typeName('Expected a type name.');
    this.consume(
      TokenType.Colon,
      'Typed declarations require a colon after the type, for example integer: health = 100.',
    );
    const name = this.consume(
      TokenType.Identifier,
      'Expected a variable name after the colon.',
    );
    this.consume(TokenType.Equals, 'Expected = after the variable name.');
    const value = this.expression();
    this.consume(
      TokenType.Period,
      'Expected a period at the end of the declaration.',
    );
    return {
      kind: 'declare',
      typeName: type.value,
      name: name.value,
      value,
      exposure,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private functionStatement(): Statement {
    const start = this.previous();
    const name = this.consume(
      TokenType.Identifier,
      'Expected a function name.',
    );
    this.consume(TokenType.OpenParen, 'Expected ( after the function name.');
    const parameters = this.parameters(TokenType.CloseParen);
    this.consume(TokenType.CloseParen, 'Expected ) after the parameters.');
    const returnType = this.matchKeyword('returns')
      ? this.typeName('Expected return type.').value
      : undefined;
    this.consume(
      TokenType.Period,
      'Expected a period after the function signature.',
    );
    const body = this.blockUntil(() => this.isEndSequence('function'));
    this.consumeEndSequence('function');
    return {
      kind: 'function',
      name: name.value,
      parameters,
      returnType,
      body,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private ifStatement(): Statement {
    const start = this.previous();
    const branches: IfBranch[] = [];
    const firstCondition = this.expression();
    this.consumeDoHeader('if condition');
    branches.push({
      condition: firstCondition,
      body: this.blockUntil(
        () =>
          this.checkKeyword('elif') ||
          this.checkKeyword('else') ||
          this.isEndSequence('if'),
      ),
    });

    while (this.matchKeyword('elif')) {
      const condition = this.expression();
      this.consumeDoHeader('elif condition');
      branches.push({
        condition,
        body: this.blockUntil(
          () =>
            this.checkKeyword('elif') ||
            this.checkKeyword('else') ||
            this.isEndSequence('if'),
        ),
      });
    }

    let elseBody: Statement[] | null = null;
    if (this.matchKeyword('else')) {
      this.consume(TokenType.Comma, 'Expected a comma after else.');
      this.consumeKeyword('do', 'Expected do after else,.');
      this.consume(TokenType.Period, 'Expected a period after else, do.');
      elseBody = this.blockUntil(() => this.isEndSequence('if'));
    }

    this.consumeEndSequence('if');
    return {
      kind: 'if',
      branches,
      elseBody,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private whileStatement(): Statement {
    const start = this.previous();
    const condition = this.expression();
    this.consumeDoHeader('while condition');
    const body = this.blockUntil(() => this.isEndSequence('while'));
    this.consumeEndSequence('while');
    return {
      kind: 'while',
      condition,
      body,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private forStatement(): Statement {
    const start = this.previous();

    if (this.matchKeyword('each')) {
      const item = this.consume(
        TokenType.Identifier,
        'Expected a loop variable after for each.',
      );
      this.consumeKeyword('in', 'Expected in after the loop variable.');
      const iterable = this.expression();
      this.consumeDoHeader('for each loop');
      const body = this.blockUntil(() => this.isEndSequence('for'));
      this.consumeEndSequence('for');
      return {
        kind: 'forEach',
        itemName: item.value,
        iterable,
        body,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }

    if (
      this.check(TokenType.Identifier) &&
      this.peekNext().type === TokenType.Keyword &&
      this.peekNext().value.toLowerCase() === 'in'
    ) {
      const item = this.advance();
      this.consumeKeyword('in', 'Expected in after the loop variable.');
      const range = this.consumeKeyword(
        'range',
        'Expected range(...) after in.',
      );
      this.consume(TokenType.OpenParen, 'Expected ( after range.');
      const args = this.argumentList(TokenType.CloseParen);
      this.consume(TokenType.CloseParen, 'Expected ) after range arguments.');
      if (args.length < 1 || args.length > 3) {
        throw new LanguageError(
          'range expects 1 to 3 arguments: range(stop), range(start, stop), or range(start, stop, step).',
          range.line,
          range.column,
          range.span,
        );
      }
      this.consumeDoHeader('range loop');
      const body = this.blockUntil(() => this.isEndSequence('for'));
      this.consumeEndSequence('for');
      return {
        kind: 'forPythonRange',
        itemName: item.value,
        args,
        body,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }

    const type = this.typeName(
      'Expected each, an inferred range loop, or a typed range variable after for.',
    );
    this.consume(
      TokenType.Colon,
      'Range for loops require a colon after the variable type.',
    );
    const item = this.consume(
      TokenType.Identifier,
      'Expected a range loop variable.',
    );
    this.consumeKeyword('from', 'Expected from in the range loop.');
    const from = this.expression();
    this.consumeKeyword('to', 'Expected to in the range loop.');
    const to = this.expression();
    let step: Expression | null = null;
    if (this.matchKeyword('step')) step = this.expression();
    this.consumeDoHeader('for loop');
    const body = this.blockUntil(() => this.isEndSequence('for'));
    this.consumeEndSequence('for');
    return {
      kind: 'forRange',
      typeName: type.value,
      itemName: item.value,
      start: from,
      end: to,
      step,
      body,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private returnStatement(): Statement {
    const start = this.previous();
    const value = this.check(TokenType.Period) ? null : this.expression();
    this.consume(TokenType.Period, 'Expected a period after return.');
    return {
      kind: 'return',
      value,
      line: start.line,
      column: start.column,
      span: this.span(start),
    };
  }

  private blockUntil(stop: () => boolean): Statement[] {
    this.blockDepth += 1;
    const statements: Statement[] = [];
    while (!stop()) {
      if (this.check(TokenType.EndOfFile)) {
        const token = this.peek();
        throw new LanguageError(
          'Reached the end of the file before this block was closed.',
          token.line,
          token.column,
          token.span,
        );
      }
      statements.push(this.statement());
    }
    this.blockDepth -= 1;
    return statements;
  }

  private expression(): Expression {
    const start = this.peek();
    const value = this.orExpression();
    value.span = this.span(start);
    return value;
  }

  private orExpression(): Expression {
    let expression = this.andExpression();
    while (this.matchKeyword('or')) {
      const operator = this.previous();
      expression = {
        kind: 'binary',
        operator: 'or',
        left: expression,
        right: this.andExpression(),
        line: operator.line,
        column: operator.column,
        span: this.span(operator),
      };
    }
    return expression;
  }

  private andExpression(): Expression {
    let expression = this.comparison();
    while (this.matchKeyword('and')) {
      const operator = this.previous();
      expression = {
        kind: 'binary',
        operator: 'and',
        left: expression,
        right: this.comparison(),
        line: operator.line,
        column: operator.column,
        span: this.span(operator),
      };
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
      if (this.matchKeyword('equal'))
        this.consumeKeyword('to', 'Expected to after is not equal.');
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

    return {
      kind: 'binary',
      operator,
      left: expression,
      right: this.additive(),
      line: operatorToken.line,
      column: operatorToken.column,
      span: this.span(operatorToken),
    };
  }

  private additive(): Expression {
    let expression = this.multiplicative();
    while (
      this.checkKeyword('plus') ||
      this.checkKeyword('minus') ||
      this.check(TokenType.Plus) ||
      this.check(TokenType.Minus)
    ) {
      const token = this.advance();
      const operator =
        token.type === TokenType.Plus || token.value.toLowerCase() === 'plus'
          ? 'plus'
          : 'minus';
      expression = {
        kind: 'binary',
        operator,
        left: expression,
        right: this.multiplicative(),
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    return expression;
  }

  private multiplicative(): Expression {
    let expression = this.unary();
    while (
      this.checkKeyword('times') ||
      this.checkKeyword('divided') ||
      this.checkKeyword('remainder') ||
      this.check(TokenType.Star) ||
      this.check(TokenType.Slash)
    ) {
      const token = this.advance();
      let operator: string;
      if (
        token.type === TokenType.Star ||
        token.value.toLowerCase() === 'times'
      )
        operator = 'times';
      else if (token.type === TokenType.Slash) operator = 'divided by';
      else if (token.value.toLowerCase() === 'divided') {
        this.consumeKeyword('by', 'Expected by after divided.');
        operator = 'divided by';
      } else operator = 'remainder';
      expression = {
        kind: 'binary',
        operator,
        left: expression,
        right: this.unary(),
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    return expression;
  }

  private unary(): Expression {
    if (this.matchKeyword('not')) {
      const token = this.previous();
      return {
        kind: 'unary',
        operator: 'not',
        value: this.unary(),
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    if (this.match(TokenType.Minus)) {
      const token = this.previous();
      return {
        kind: 'unary',
        operator: 'negative',
        value: this.unary(),
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    return this.postfix();
  }

  private postfix(): Expression {
    let expression = this.primary();

    while (true) {
      // Member dots must be adjacent to both identifiers. A spaced/newline dot is a terminator.
      if (
        this.check(TokenType.Period) &&
        this.peekNext().type === TokenType.Identifier &&
        expression.span.end.offset === this.peek().span.start.offset &&
        this.peek().span.end.offset === this.peekNext().span.start.offset
      ) {
        this.advance();
        const member = this.advance();
        expression = {
          kind: 'member',
          target: expression,
          name: member.value,
          line: expression.line,
          column: expression.column,
          span: { ...expression.span, end: member.span.end },
        };
        continue;
      }
      if (this.match(TokenType.OpenParen)) {
        const callableName = (e: Expression): string | null =>
          e.kind === 'identifier'
            ? e.name
            : e.kind === 'member' && callableName(e.target)
              ? callableName(e.target) + '.' + e.name
              : null;
        const name = callableName(expression);
        if (!name) {
          const token = this.previous();
          throw new LanguageError(
            'Only named functions can be called.',
            token.line,
            token.column,
            token.span,
          );
        }
        const args = this.argumentList(TokenType.CloseParen);
        this.consume(
          TokenType.CloseParen,
          'Expected ) after function arguments.',
        );
        expression = {
          kind: 'call',
          name: name!,
          args,
          line: expression.line,
          column: expression.column,
          span: { ...expression.span, end: this.previous().span.end },
        };
        continue;
      }

      if (this.match(TokenType.OpenBracket)) {
        const open = this.previous();
        const index = this.expression();
        this.consume(TokenType.CloseBracket, 'Expected ] after array index.');
        expression = {
          kind: 'index',
          target: expression,
          index,
          line: open.line,
          column: open.column,
          span: { ...expression.span, end: this.previous().span.end },
        };
        continue;
      }

      return expression;
    }
  }

  private primary(): Expression {
    if (this.match(TokenType.Number)) {
      const token = this.previous();
      return {
        kind: 'literal',
        value: Number(token.value),
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    if (this.match(TokenType.String)) {
      const token = this.previous();
      return {
        kind: 'literal',
        value: token.value,
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    if (this.matchKeyword('true')) {
      const token = this.previous();
      return {
        kind: 'literal',
        value: true,
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    if (this.matchKeyword('false')) {
      const token = this.previous();
      return {
        kind: 'literal',
        value: false,
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }
    if (
      this.match(TokenType.Identifier) ||
      (BUILTIN_FUNCTIONS.has(this.peek().value) && !!this.advance())
    ) {
      const token = this.previous();
      return {
        kind: 'identifier',
        name: token.value,
        line: token.line,
        column: token.column,
        span: this.span(token),
      };
    }

    if (this.match(TokenType.OpenParen)) {
      const expression = this.expression();
      this.consume(TokenType.CloseParen, 'Expected ) after expression.');
      return expression;
    }

    if (this.match(TokenType.OpenBrace)) {
      const start = this.previous();
      const entries: { key: string; value: Expression }[] = [];
      if (!this.check(TokenType.CloseBrace))
        do {
          const key = this.consume(
            TokenType.String,
            'Dictionary keys must be quoted text.',
          );
          if (entries.some((e) => e.key === key.value))
            throw new LanguageError(
              'Duplicate dictionary key.',
              key.line,
              key.column,
              key.span,
            );
          this.consume(TokenType.Colon, 'Expected : after key.');
          entries.push({ key: key.value, value: this.expression() });
        } while (this.match(TokenType.Comma));
      this.consume(TokenType.CloseBrace, 'Expected } after dictionary.');
      return {
        kind: 'object',
        entries,
        line: start.line,
        column: start.column,
        span: this.span(start),
      };
    }
    if (this.match(TokenType.OpenBracket)) {
      const open = this.previous();
      const values = this.argumentList(TokenType.CloseBracket);
      this.consume(TokenType.CloseBracket, 'Expected ] after array.');
      return {
        kind: 'array',
        values,
        line: open.line,
        column: open.column,
        span: this.span(open),
      };
    }

    const token = this.peek();
    throw new LanguageError(
      'Expected a value but found "' + (token.value || 'end of file') + '".',
      token.line,
      token.column,
      token.span,
    );
  }

  private argumentList(endType: TokenType): Expression[] {
    const values: Expression[] = [];
    if (!this.check(endType)) {
      do values.push(this.expression());
      while (this.match(TokenType.Comma));
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
      (token.type === TokenType.Keyword &&
        PRIMITIVE_TYPES.has(token.value.toLowerCase())) ||
      token.type === TokenType.Identifier;
    return (
      validType &&
      (this.peekNext().type === TokenType.Colon ||
        this.peekNext().type === TokenType.Less)
    );
  }

  private parameters(end: TokenType): Parameter[] {
    const parameters: Parameter[] = [];
    if (!this.check(end))
      do {
        const type = this.typeName('Expected parameter type.');
        this.consume(TokenType.Colon, 'Typed parameters require a colon.');
        const name = this.consume(
          TokenType.Identifier,
          'Expected parameter name.',
        );
        parameters.push({
          typeName: type.value,
          name: name.value,
          line: type.line,
          column: type.column,
          span: this.span(type),
        });
      } while (this.match(TokenType.Comma));
    return parameters;
  }
  private typeName(message: string): Token {
    const token = this.consumeTypeName(message);
    let value = PRIMITIVE_TYPES.has(token.value.toLowerCase())
      ? token.value.toLowerCase()
      : token.value;
    if (this.match(TokenType.Less)) {
      const types = [this.typeName('Expected collection element type.').value];
      while (this.match(TokenType.Comma))
        types.push(this.typeName('Expected type.').value);
      this.consume(TokenType.Greater, 'Expected > after collection type.');
      value += '<' + types.join(',') + '>';
    }
    return { ...token, value, span: this.span(token) };
  }
  private consumeTypeName(message: string): Token {
    const token = this.peek();
    if (
      (token.type === TokenType.Keyword &&
        PRIMITIVE_TYPES.has(token.value.toLowerCase())) ||
      token.type === TokenType.Identifier
    ) {
      return this.advance();
    }
    throw new LanguageError(message, token.line, token.column, token.span);
  }

  private isEndSequence(keyword: string): boolean {
    return (
      this.checkKeyword('end') &&
      this.peekNext().type === TokenType.Keyword &&
      this.peekNext().value.toLowerCase() === keyword
    );
  }

  private consumeEndSequence(keyword: string) {
    this.consumeKeyword('end', 'Expected end ' + keyword + '.');
    this.consumeKeyword(keyword, 'Expected ' + keyword + ' after end.');
    this.consume(
      TokenType.Period,
      'Expected a period after end ' + keyword + '.',
    );
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
    throw new LanguageError(message, token.line, token.column, token.span);
  }

  private consumeKeyword(keyword: string, message: string): Token {
    if (this.checkKeyword(keyword)) return this.advance();
    const token = this.peek();
    throw new LanguageError(message, token.line, token.column, token.span);
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private checkKeyword(keyword: string): boolean {
    const token = this.peek();
    return (
      token.type === TokenType.Keyword && token.value.toLowerCase() === keyword
    );
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
