import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { KEYWORDS, LanguageError, tokenize } from './language/lexer';
import { runSource } from './language/runtime';

const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^"[^"\n]*"/)) return 'string';
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';

    const char = stream.peek();
    if (char && '=.,()[]'.includes(char)) {
      stream.next();
      return char === '=' ? 'operator' : 'punctuation';
    }

    if (stream.match(/^[A-Za-z][A-Za-z0-9]*/)) {
      const word = stream.current();
      return KEYWORDS.has(word.toLowerCase()) ? 'keyword' : 'variableName';
    }

    stream.next();
    return 'invalid';
  }
});

const completions = completeFromList([
  ...Array.from(KEYWORDS).map((label) => ({ label, type: 'keyword' })),
  { label: 'print()', type: 'function', apply: 'print().' },
  { label: 'integer score = 0.', type: 'text' },
  { label: 'text name = "Lyra".', type: 'text' },
  { label: 'array items = [].', type: 'text' }
]);

function positionFor(source: string, line: number, column: number) {
  const lines = source.split('\n');
  const safeLine = Math.max(1, Math.min(line, lines.length));
  let position = 0;
  for (let i = 0; i < safeLine - 1; i += 1) position += lines[i].length + 1;
  return Math.min(source.length, position + Math.max(0, column - 1));
}

const languageLinter = linter((view) => {
  const source = view.state.doc.toString();

  try {
    tokenize(source);
    if (source.trim()) runSource(source);
    return [];
  } catch (error) {
    if (!(error instanceof LanguageError)) return [];
    const from = positionFor(source, error.line, error.column);
    const diagnostic: Diagnostic = {
      from,
      to: Math.min(source.length, from + 1),
      severity: 'error',
      message: error.message
    };
    return [diagnostic];
  }
}, { delay: 450 });

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
}

export function Editor({ value, onChange, onRun }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);

  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        oneDark,
        language,
        language.data.of({ autocomplete: completions }),
        autocompletion(),
        languageLinter,
        lintGutter(),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          keydown(event) {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              onRunRef.current();
              return true;
            }
            return false;
          }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: '#0d1117', fontSize: '14px' },
          '.cm-scroller': {
            fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, Liberation Mono, monospace',
            lineHeight: '1.7',
            overflow: 'auto'
          },
          '.cm-content': { padding: '18px 0 28px' },
          '.cm-gutters': {
            backgroundColor: '#0d1117',
            borderRight: '1px solid #21262d',
            color: '#6e7681'
          },
          '.cm-activeLine': { backgroundColor: '#161b224d' },
          '.cm-activeLineGutter': { backgroundColor: '#161b22', color: '#c9d1d9' },
          '.cm-cursor': { borderLeftColor: '#58a6ff' }
        })
      ]
    });

    view.current = new EditorView({ state, parent: host.current });

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    if (!view.current) return;
    const current = view.current.state.doc.toString();
    if (current === value) return;
    view.current.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
