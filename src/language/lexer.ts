export enum TokenType {
  Number = 'Number',
  String = 'String',
  Identifier = 'Identifier',
  Keyword = 'Keyword',
  Equals = 'Equals',
  OpenParen = 'OpenParen',
  CloseParen = 'CloseParen',
  OpenBracket = 'OpenBracket',
  CloseBracket = 'CloseBracket',
  Comma = 'Comma',
  Period = 'Period',
  EndOfFile = 'EndOfFile'
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class LanguageError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(message);
    this.name = 'LanguageError';
  }
}

export const KEYWORDS = new Set([
  'integer', 'text', 'array', 'boolean', 'print',
  'plus', 'minus', 'times', 'divided', 'by', 'remainder',
  'true', 'false'
]);

const punctuation: Record<string, TokenType> = {
  '=': TokenType.Equals,
  '(': TokenType.OpenParen,
  ')': TokenType.CloseParen,
  '[': TokenType.OpenBracket,
  ']': TokenType.CloseBracket,
  ',': TokenType.Comma,
  '.': TokenType.Period
};

export function tokenize(sourceCode: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const push = (type: TokenType, value: string, tokenLine = line, tokenColumn = column) => {
    tokens.push({ type, value, line: tokenLine, column: tokenColumn });
  };

  while (index < sourceCode.length) {
    const char = sourceCode[index];

    if (char === '\n') {
      index += 1;
      line += 1;
      column = 1;
      continue;
    }

    if (/\s/.test(char)) {
      index += 1;
      column += 1;
      continue;
    }

    if (char === '"') {
      const startLine = line;
      const startColumn = column;
      index += 1;
      column += 1;
      let value = '';

      while (index < sourceCode.length && sourceCode[index] !== '"') {
        if (sourceCode[index] === '\n') {
          throw new LanguageError('Strings cannot span multiple lines yet.', line, column);
        }
        value += sourceCode[index];
        index += 1;
        column += 1;
      }

      if (index >= sourceCode.length) {
        throw new LanguageError('Unterminated string. Add a closing quote.', startLine, startColumn);
      }

      index += 1;
      column += 1;
      push(TokenType.String, value, startLine, startColumn);
      continue;
    }

    if (/\d/.test(char)) {
      const startLine = line;
      const startColumn = column;
      let value = '';
      let hasDecimal = false;

      while (index < sourceCode.length) {
        const current = sourceCode[index];
        if (/\d/.test(current)) {
          value += current;
        } else if (current === '.' && !hasDecimal && /\d/.test(sourceCode[index + 1] || '')) {
          hasDecimal = true;
          value += current;
        } else {
          break;
        }
        index += 1;
        column += 1;
      }

      push(TokenType.Number, value, startLine, startColumn);
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      const startLine = line;
      const startColumn = column;
      let value = '';

      while (index < sourceCode.length && /[A-Za-z0-9]/.test(sourceCode[index])) {
        value += sourceCode[index];
        index += 1;
        column += 1;
      }

      push(KEYWORDS.has(value.toLowerCase()) ? TokenType.Keyword : TokenType.Identifier, value, startLine, startColumn);
      continue;
    }

    const type = punctuation[char];
    if (type) {
      push(type, char);
      index += 1;
      column += 1;
      continue;
    }

    throw new LanguageError(
      'Unexpected symbol "' + char + '". Allowed symbols are . , ( ) [ ] " =.',
      line,
      column
    );
  }

  tokens.push({ type: TokenType.EndOfFile, value: '', line, column });
  return tokens;
}
