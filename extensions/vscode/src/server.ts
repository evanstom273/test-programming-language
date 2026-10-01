import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  CompletionItemKind,
  SymbolKind,
  DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadProject } from './project';
import { analyze } from './analyze';
import { LanguageTools } from '../../../src/tooling/service';
import type { SourceSpan } from '../../../src/language/diagnostics';
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const identity = (uri: string) => pathToFileURL(fileURLToPath(uri)).href;
const range = (s: SourceSpan) => ({
  start: { line: s.start.line - 1, character: s.start.column - 1 },
  end: { line: s.end.line - 1, character: s.end.column - 1 },
});
let roots: string[] = [];
let epoch = 0;
let controller = new AbortController();
let timer: ReturnType<typeof setTimeout>;
const cache = new Map<string, Promise<LanguageTools>>();
const published = new Set<string>();
connection.onInitialize((params) => {
  roots = (
    params.workspaceFolders?.map((f) => f.uri) ??
    (params.rootUri ? [params.rootUri] : [])
  )
    .filter((u) => u.startsWith('file:'))
    .map((uri) => fileURLToPath(uri));
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['.'] },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
    },
  };
});
async function tools(uri: string) {
  const signal = controller.signal;
  if (!cache.has(uri))
    cache.set(
      uri,
      (async () => {
        const buffers = new Map(
          documents
            .all()
            .filter((d) => d.uri.startsWith('file:'))
            .map((d) => [fileURLToPath(d.uri), d.getText()]),
        );
        const project = await loadProject(fileURLToPath(uri), roots, buffers);
        return new LanguageTools(project, await analyze(project, signal));
      })(),
    );
  return cache.get(uri)!;
}
function changed() {
  const version = ++epoch;
  controller.abort();
  controller = new AbortController();
  cache.clear();
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const result = new Map<
      string,
      import('vscode-languageserver/node').Diagnostic[]
    >();
    for (const doc of documents
      .all()
      .filter((d) => d.languageId === 'langlab' && d.uri.startsWith('file:'))) {
      try {
        const t = await tools(doc.uri);
        for (const f of t.project.files)
          if (f.path.endsWith('.lang'))
            result.set(f.id, result.get(f.id) ?? []);
        for (const d of t.analysis.diagnostics) {
          const uri = d.span.fileId.startsWith('file:')
            ? d.span.fileId
            : doc.uri;
          const list = result.get(uri) ?? [];
          if (
            !list.some(
              (x) =>
                x.code === d.code &&
                x.range.start.line === d.span.start.line - 1 &&
                x.range.start.character === d.span.start.column - 1,
            )
          )
            list.push({
              range: range(d.span),
              message: d.message,
              code: d.code,
              severity: DiagnosticSeverity.Error,
              source: 'Language Lab',
            });
          result.set(uri, list);
        }
      } catch (error) {
        result.set(doc.uri, [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
            severity: DiagnosticSeverity.Error,
            message: String(error),
            source: 'Language Lab',
          },
        ]);
      }
    }
    if (version !== epoch) return;
    for (const uri of published)
      if (!result.has(uri))
        connection.sendDiagnostics({ uri, diagnostics: [] });
    published.clear();
    for (const [uri, diagnostics] of result) {
      connection.sendDiagnostics({ uri, diagnostics });
      published.add(uri);
    }
  }, 180);
}
documents.onDidChangeContent(changed);
documents.onDidClose(changed);
connection.onDidChangeWatchedFiles(changed);
async function query<T>(
  uri: string,
  fallback: T,
  fn: (t: LanguageTools) => T,
): Promise<T> {
  try {
    return fn(await tools(uri));
  } catch {
    return fallback;
  }
}
connection.onCompletion((p) =>
  query(p.textDocument.uri, [], (t) =>
    t
      .completions(
        identity(p.textDocument.uri),
        documents.get(p.textDocument.uri)?.offsetAt(p.position) ?? 0,
      )
      .map((c) => ({
        label: c.label,
        detail: c.detail,
        kind:
          c.kind === 'function'
            ? CompletionItemKind.Function
            : c.kind === 'keyword'
              ? CompletionItemKind.Keyword
              : CompletionItemKind.Variable,
      })),
  ),
);
connection.onHover((p) =>
  query(
    p.textDocument.uri,
    null as import('vscode-languageserver/node').Hover | null,
    (t) => {
      const text = t.hover(
        identity(p.textDocument.uri),
        documents.get(p.textDocument.uri)?.offsetAt(p.position) ?? 0,
      );
      return text ? { contents: { kind: 'plaintext', value: text } } : null;
    },
  ),
);
connection.onDefinition((p) =>
  query(
    p.textDocument.uri,
    null as import('vscode-languageserver/node').Location | null,
    (t) => {
      const s = t.symbolAt(
        identity(p.textDocument.uri),
        documents.get(p.textDocument.uri)?.offsetAt(p.position) ?? 0,
      );
      return s ? { uri: s.span.fileId, range: range(t.selection(s)) } : null;
    },
  ),
);
connection.onReferences((p) =>
  query(p.textDocument.uri, [], (t) => {
    const s = t.symbolAt(
      identity(p.textDocument.uri),
      documents.get(p.textDocument.uri)?.offsetAt(p.position) ?? 0,
    );
    return s
      ? t
          .references(s)
          .slice(p.context.includeDeclaration ? 0 : 1)
          .map((s) => ({ uri: s.fileId, range: range(s) }))
      : [];
  }),
);
connection.onDocumentSymbol((p) =>
  query(p.textDocument.uri, [], (t) =>
    (
      t.analysis.modules.find((m) => m.id === identity(p.textDocument.uri))
        ?.symbols ?? []
    ).map((s) => ({
      name: s.name,
      kind: s.kind === 'function' ? SymbolKind.Function : SymbolKind.Variable,
      location: { uri: s.span.fileId, range: range(t.selection(s)) },
    })),
  ),
);
documents.listen(connection);
connection.listen();
