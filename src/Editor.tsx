import { BUILTIN_SIGNATURES } from './language/builtins';
import { KEYWORDS } from './language/lexer';
import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic } from './language/diagnostics';
import { oneDark } from '@codemirror/theme-one-dark';

const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^@[A-Za-z_][A-Za-z0-9_]*/)) return 'meta';
    if (stream.match(/^"(?:\\.|[^"\n])*"/)) return 'string';
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';

    const char = stream.peek();
    if (char && '=+-*/'.includes(char)) {
      stream.next();
      return 'operator';
    }
    if (char && ':.,()[]{}<>'.includes(char)) {
      stream.next();
      return 'punctuation';
    }

    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();
      return KEYWORDS.has(word.toLowerCase()) ? 'keyword' : 'variableName';
    }

    stream.next();
    return 'invalid';
  },
});

const completions = completeFromList([
  ...Object.keys(BUILTIN_SIGNATURES).map((label) => ({
    label,
    type: 'function',
  })),
  ...[
    'range',
    'label',
    'help',
    'group',
    'multiline',
    'placeholder',
    'file',
    'color',
  ].map((name) => ({ label: '@' + name, type: 'keyword' })),
  { label: 'on start', type: 'keyword', apply: 'on start, do.\n    \nend on.' },
  {
    label: 'on update',
    type: 'keyword',
    apply: 'on update(float: deltaTime), do.\n    \nend on.',
  },
  {
    label: 'record',
    type: 'keyword',
    apply: 'record Stats [integer: health].',
  },
  ...Array.from(KEYWORDS).map((label) => ({ label, type: 'keyword' })),
  { label: 'print()', type: 'function', apply: 'print().' },
  { label: 'randomInteger()', type: 'function', apply: 'randomInteger(1, 6)' },
  { label: 'integer:', type: 'type', apply: 'integer: ' },
  { label: 'text:', type: 'type', apply: 'text: ' },
  { label: 'boolean:', type: 'type', apply: 'boolean: ' },
  { label: 'array:', type: 'type', apply: 'array: ' },
  { label: 'export integer:', type: 'keyword', apply: 'export integer: ' },
  { label: 'input integer:', type: 'keyword', apply: 'input integer: ' },
  { label: 'input text:', type: 'keyword', apply: 'input text: ' },
  { label: 'input boolean:', type: 'keyword', apply: 'input boolean: ' },
  { label: 'input array:', type: 'keyword', apply: 'input array: ' },
  {
    label: 'button',
    type: 'keyword',
    apply: 'button "Calculate", do.\n    \nend button.',
  },
  { label: 'enum', type: 'keyword', apply: 'enum Name [first, second].' },
  {
    label: 'if',
    type: 'keyword',
    apply: 'if condition is true, do.\n    \nend if.',
  },
  {
    label: 'while',
    type: 'keyword',
    apply: 'while condition is true, do.\n    \nend while.',
  },
  {
    label: 'for each',
    type: 'keyword',
    apply: 'for each item in items, do.\n    \nend for.',
  },
  {
    label: 'for range',
    type: 'keyword',
    apply: 'for x in range(10), do.\n    \nend for.',
  },
  {
    label: 'scene',
    type: 'keyword',
    apply: 'scene CharacterCreator.\n    heading "Create Character".\n    \nend scene.',
  },
  { label: 'go to', type: 'keyword', apply: 'go to Arena.' },
  { label: 'stat', type: 'keyword', apply: 'stat "Health", health.' },
  {
    label: 'progress',
    type: 'keyword',
    apply: 'progress "Health", health, maxHealth.',
  },
  {
    label: 'function',
    type: 'keyword',
    apply: 'function name().\n    \nend function.',
  },
]);

interface EditorProps {
  value: string;
  diagnostics: Diagnostic[];
  onChange: (value: string) => void;
  onRun: () => void;
}

export function Editor({ value, onChange, onRun, diagnostics }: EditorProps) {
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
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged)
            onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: '#0d1117', fontSize: '14px' },
          '.cm-scroller': {
            fontFamily:
              'JetBrains Mono, SFMono-Regular, Consolas, Liberation Mono, monospace',
            lineHeight: '1.7',
            overflow: 'auto',
          },
          '.cm-content': { padding: '18px 0 28px' },
          '.cm-gutters': {
            backgroundColor: '#0d1117',
            borderRight: '1px solid #21262d',
            color: '#6e7681',
          },
          '.cm-activeLine': { backgroundColor: '#161b224d' },
          '.cm-activeLineGutter': {
            backgroundColor: '#161b22',
            color: '#c9d1d9',
          },
          '.cm-cursor': { borderLeftColor: '#58a6ff' },
        }),
      ],
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
    view.current.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    if (!view.current) return;
    const length = view.current.state.doc.length;
    view.current.dispatch(
      setDiagnostics(
        view.current.state,
        diagnostics.map((d) => ({
          from: Math.min(length, d.span.start.offset),
          to: Math.min(
            length,
            Math.max(d.span.start.offset, d.span.end.offset),
          ),
          severity: d.severity,
          message: d.message,
        })),
      ),
    );
  }, [diagnostics]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
