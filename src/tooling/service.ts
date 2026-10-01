import type {
  Analysis,
  ModuleDefinition,
  SymbolDefinition,
} from '../language/analysis';
import { BUILTIN_SIGNATURES } from '../language/builtins';
import { KEYWORDS, tokenize, TokenType } from '../language/lexer';
import type { SourceSpan } from '../language/diagnostics';
import type { ProjectSnapshot } from '../workspace/model';

const contains = (s: SourceSpan, offset: number) =>
  s.start.offset <= offset && offset < s.end.offset;
/** Host-neutral editor queries over parser/binder results. No evaluator dependency. */
export class LanguageTools {
  private tokenCache = new Map<string, ReturnType<typeof tokenize>>();
  constructor(
    readonly project: ProjectSnapshot,
    readonly analysis: Analysis,
  ) {}
  private module(id: string) {
    return this.analysis.modules.find((m) => m.id === id);
  }
  private tokens(id: string) {
    if (!this.tokenCache.has(id)) {
      try {
        this.tokenCache.set(
          id,
          tokenize(
            this.project.files.find((f) => f.id === id)?.content ?? '',
            id,
          ),
        );
      } catch {
        this.tokenCache.set(id, []);
      }
    }
    return this.tokenCache.get(id)!;
  }

  selection(symbol: SymbolDefinition): SourceSpan {
    return (
      this.tokens(symbol.span.fileId).find(
        (t) =>
          t.type === TokenType.Identifier &&
          t.value === symbol.name &&
          contains(symbol.span, t.span.start.offset),
      )?.span ?? symbol.span
    );
  }
  symbolAt(id: string, offset: number): SymbolDefinition | undefined {
    const module = this.module(id);
    const own = module?.symbols.find((s) =>
      contains(this.selection(s), offset),
    );
    if (own) return own;
    const reference = module?.references
      .filter((r) => contains(r.span, offset))
      .sort(
        (a, b) =>
          a.span.end.offset -
          a.span.start.offset -
          (b.span.end.offset - b.span.start.offset),
      )[0];
    return this.analysis.modules
      .flatMap((m) => m.symbols)
      .find((s) => s.id === reference?.symbolId);
  }
  references(symbol: SymbolDefinition): SourceSpan[] {
    return [
      this.selection(symbol),
      ...this.analysis.modules.flatMap((m) =>
        m.references.filter((r) => r.symbolId === symbol.id).map((r) => r.span),
      ),
    ];
  }
  signature(symbol: SymbolDefinition): string {
    const module = this.module(symbol.span.fileId);
    const fn = module?.statements.find(
      (s) => s.kind === 'function' && s.name === symbol.name,
    );
    if (symbol.kind === 'function' && fn?.kind === 'function')
      return `${fn.public ? 'public ' : ''}function ${fn.name}(${fn.parameters.map((p) => p.typeName + ': ' + p.name).join(', ')})${fn.returnType ? ' returns ' + fn.returnType : ''}`;
    return `${symbol.typeName ?? symbol.kind}: ${symbol.name}`;
  }
  hover(id: string, offset: number): string | undefined {
    const symbol = this.symbolAt(id, offset);
    if (symbol) return this.signature(symbol);
    const token = this.tokens(id).find((t) => contains(t.span, offset));
    const builtin =
      token && Object.hasOwn(BUILTIN_SIGNATURES, token.value)
        ? BUILTIN_SIGNATURES[token.value]
        : undefined;
    if (builtin && token)
      return `${token.value}(${builtin.parameters?.join(', ') || builtin.args.join(' or ') + ' arguments'}) → ${builtin.returns || 'value'}\n${builtin.description ?? 'Language Lab built-in function.'}`;
  }
  completions(
    id: string,
    offset: number,
  ): {
    label: string;
    detail: string;
    kind: 'function' | 'variable' | 'keyword';
  }[] {
    const source = this.project.files.find((f) => f.id === id)?.content ?? '';
    const prefix = source.slice(0, offset);
    const namespace = prefix.match(
      /([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z0-9_]*$/,
    )?.[1];
    const module = this.module(id);
    if (namespace) {
      const target = this.module(module?.imports[namespace] ?? '');
      return (target?.statements ?? []).flatMap((s) =>
        s.kind === 'function' && s.public
          ? [
              {
                label: s.name,
                detail: `${namespace}.${s.name}(${s.parameters.map((p) => p.typeName + ': ' + p.name).join(', ')})`,
                kind: 'function' as const,
              },
            ]
          : [],
      );
    }
    const symbols = (module?.symbols ?? []).filter((s) =>
      this.visible(module!, s, offset),
    );
    return [
      ...symbols.map((s) => ({
        label: s.name,
        detail: this.signature(s),
        kind:
          s.kind === 'function' ? ('function' as const) : ('variable' as const),
      })),
      ...Object.entries(BUILTIN_SIGNATURES).map(([label, s]) => ({
        label,
        detail: s.description ?? `${label} → ${s.returns || 'value'}`,
        kind: 'function' as const,
      })),
      ...[...KEYWORDS].map((label) => ({
        label,
        detail: 'Language Lab keyword',
        kind: 'keyword' as const,
      })),
    ].filter(
      (item, index, all) =>
        all.findIndex((x) => x.label === item.label) === index,
    );
  }
  private visible(
    module: ModuleDefinition,
    symbol: SymbolDefinition,
    offset: number,
  ) {
    // Parameters/local variables are confined to their owning function/event.
    const owner = module.statements.find(
      (s) =>
        ['function', 'handler', 'button'].includes(s.kind) &&
        contains(s.span, symbol.span.start.offset) &&
        s.span.start.offset !== symbol.span.start.offset,
    );
    return !owner || contains(owner.span, offset);
  }
}
