import { KEYWORDS } from '../../../src/language/lexer';
import { BUILTIN_SIGNATURES } from '../../../src/language/builtins';
export default {
  name: 'Language Lab',
  scopeName: 'source.langlab',
  patterns: [
    { name: 'comment.line.number-sign.langlab', begin: '#', end: '$' },
    { name: 'comment.block.langlab', begin: '/\\*', end: '\\*/' },
    {
      name: 'string.quoted.double.langlab',
      begin: '"',
      end: '"',
      patterns: [{ name: 'constant.character.escape.langlab', match: '\\\\.' }],
    },
    { name: 'meta.annotation.langlab', match: '@[A-Za-z_][A-Za-z0-9_]*' },
    { name: 'constant.numeric.langlab', match: '\\b[0-9]+(?:\\.[0-9]+)?\\b' },
    {
      name: 'support.function.langlab',
      match: '\\b(?:' + Object.keys(BUILTIN_SIGNATURES).join('|') + ')\\b',
    },
    {
      name: 'keyword.control.langlab',
      match: '(?i)\\b(?:' + [...KEYWORDS].join('|') + ')\\b',
    },
    { name: 'keyword.operator.langlab', match: '[=+*/<>-]' },
    { name: 'punctuation.langlab', match: '[.,:()\\[\\]{}]' },
  ],
};
