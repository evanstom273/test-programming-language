import { BUILTIN_SIGNATURES } from './language/builtins';
import { KEYWORDS } from './language/lexer';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  isolateHistory,
  undo,
  redo,
  indentMore,
  indentLess,
  cursorCharLeft,
  cursorCharRight,
} from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic } from './language/diagnostics';
import { oneDark } from '@codemirror/theme-one-dark';

const language = StreamLanguage.define({
  startState: () => ({ blockComment: false }),
  token(stream, state) {
    if (state.blockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.blockComment = false;
      } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.blockComment = true;
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.blockComment = false;
      } else stream.skipToEnd();
      return 'comment';
    }
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
    apply:
      'scene CharacterCreator.\n    heading "Create Character".\n    \nend scene.',
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

export interface EditorHandle {
  command(name: string): void;
  insert(text: string): void;
  reveal(offset: number): void;
}
interface EditorProps {
  documentId: string;
  fontSize: number;
  wrap: boolean;
  value: string;
  diagnostics: Diagnostic[];
  onChange: (value: string) => void;
  onRun: () => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { documentId, fontSize, wrap, value, onChange, onRun, diagnostics },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const documents = useRef(new Map<string, EditorState>());
  const currentId = useRef(documentId);
  const settings = useRef(new Compartment());
  const makeState = useRef<(text: string) => EditorState>();
  const appearance = () => [
    EditorView.theme({ '&': { fontSize: fontSize + 'px' } }),
    ...(wrap ? [EditorView.lineWrapping] : []),
  ];
  useImperativeHandle(ref, () => ({
    command(name) {
      const v = view.current;
      if (!v) return;
      const commands: Record<string, (v: EditorView) => boolean> = {
        undo,
        redo,
        indent: indentMore,
        outdent: indentLess,
        left: cursorCharLeft,
        right: cursorCharRight,
        find: openSearchPanel,
      };
      commands[name]?.(v);
      v.focus();
    },
    insert(text) {
      const v = view.current;
      if (!v || !text) return;
      v.dispatch({
        ...v.state.replaceSelection(text),
        annotations: isolateHistory.of('full'),
        userEvent: 'input',
      });
      v.focus();
    },
    reveal(offset) {
      const v = view.current;
      if (!v) return;
      const at = Math.max(0, Math.min(offset, v.state.doc.length));
      v.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: 'center' }),
      });
      v.focus();
    },
  }));
  const onRunRef = useRef(onRun);

  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    if (!host.current) return;

    makeState.current = (text) =>
      EditorState.create({
        doc: text,
        extensions: [
          basicSetup,
          oneDark,
          language,
          language.data.of({ autocomplete: completions }),
          autocompletion(),
          lintGutter(),
          settings.current.of(appearance()),
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
            '&': {
              height: '100%',
              backgroundColor: '#0d1117',
            },
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

    view.current = new EditorView({
      state: makeState.current(value),
      parent: host.current,
    });

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    if (!view.current) return;
    if (currentId.current !== documentId) {
      documents.current.set(currentId.current, view.current.state);
      // Bound retained undo history when a workspace contains many files.
      if (documents.current.size > 30)
        documents.current.delete(documents.current.keys().next().value!);
      const cached = documents.current.get(documentId);
      view.current.setState(
        cached?.doc.toString() === value ? cached : makeState.current!(value),
      );
      currentId.current = documentId;
      view.current.dispatch({
        effects: settings.current.reconfigure(appearance()),
      });
    }
    const current = view.current.state.doc.toString();
    if (current === value) return;
    view.current.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value, documentId]);

  useEffect(() => {
    view.current?.dispatch({
      effects: settings.current.reconfigure(appearance()),
    });
  }, [fontSize, wrap]);

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
  }, [diagnostics, documentId]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
});
