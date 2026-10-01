import { PRIMITIVE_TYPES, type Expression, type Statement, type Value, type Located } from './ast';
import { DiagnosticError, pointSpan, type Diagnostic } from './diagnostics';
import { LanguageError } from './lexer';
import { parseSource } from './parser';
import type { ProgramField } from './program';
import { deepFreeze, singleFileSnapshot, type ProjectSnapshot } from '../workspace/model';
import { resolveImport, VirtualFileSystem } from '../workspace/vfs';

export interface SymbolDefinition { id: string; name: string; kind: 'variable' | 'function' | 'enum' | 'namespace' | 'parameter'; typeName?: string; span: Located['span'] }
export interface ModuleDefinition {
  id: string; path: string; statements: Statement[]; imports: Record<string, string>;
  symbols: SymbolDefinition[]; references: { symbolId: string; span: Located['span'] }[]; exports: ProgramField[];
}
export interface Program { readonly version: 1; readonly projectId: string; readonly entryId: string; readonly modules: ModuleDefinition[] }
export interface Analysis { program: Program | null; diagnostics: Diagnostic[]; fields: ProgramField[] }

/** No runtime dependency: analysis cannot invoke user code. */
export function analyzeProject(snapshot: ProjectSnapshot): Analysis {
  const diagnostics: Diagnostic[] = [];
  const modules: ModuleDefinition[] = [];
  const report = (category: Diagnostic['category'], code: string, message: string, location?: Located) => {
    diagnostics.push({ category, code, severity: 'error', message, span: location?.span ?? pointSpan(snapshot.project.entry) });
  };
  try {
    const vfs = new VirtualFileSystem(snapshot);
    const visiting: string[] = []; const visited = new Map<string, ModuleDefinition>();
    const visit = (path: string, at?: Located): ModuleDefinition | undefined => {
      if (visiting.includes(path)) { report('module', 'IMPORT_CYCLE', 'Circular import: ' + [...visiting, path].join(' -> '), at); return; }
      if (visited.has(path)) return visited.get(path);
      let file;
      try { file = vfs.source(path); } catch (error) { report('module', 'MODULE_NOT_FOUND', (error as Error).message, at); return; }
      let statements: Statement[];
      try { statements = parseSource(file.content, file.id); } catch (error) {
        const e = error as LanguageError;
        diagnostics.push({ category: 'syntax', code: 'SYNTAX_ERROR', severity: 'error', message: e.message, span: e.span ?? pointSpan(file.id) }); return;
      }
      const module: ModuleDefinition = { id: file.id, path, statements, imports: Object.create(null), symbols: [], references: [], exports: [] };
      visiting.push(path);
      for (const statement of statements) {
        if (statement.kind !== 'import') continue;
        try {
          if (Object.hasOwn(module.imports, statement.alias)) report('binding', 'DUPLICATE_NAMESPACE', 'Namespace already exists: ' + statement.alias, statement);
          const target = visit(resolveImport(path, statement.path), statement);
          if (target) module.imports[statement.alias] = target.id;
        } catch (error) { report('module', 'INVALID_IMPORT', (error as Error).message, statement); }
      }
      visiting.pop(); visited.set(path, module); modules.push(module);
      return module;
    };
    const entry = visit(snapshot.project.entry);
    for (const module of modules) bindModule(module, modules, report);
    const fields = modules.flatMap(m => m.exports);
    if (!entry || diagnostics.length) return { program: null, diagnostics, fields };
    return { program: deepFreeze({ version: 1, projectId: snapshot.project.id, entryId: entry.id, modules }), diagnostics, fields };
  } catch (error) {
    report('module', 'INVALID_PROJECT', (error as Error).message);
    return { program: null, diagnostics, fields: [] };
  }
}
export function compileProject(snapshot: ProjectSnapshot): Program {
  const result = analyzeProject(snapshot);
  if (!result.program) throw new DiagnosticError(result.diagnostics);
  return result.program;
}
export function compileSource(source: string): Program {
  try { return compileProject(singleFileSnapshot(source)); } catch (error) {
    if (error instanceof DiagnosticError) { const d = error.diagnostics[0]; throw new LanguageError(d.message, d.span.start.line, d.span.start.column, d.span); }
    throw error;
  }
}

class Scope extends Map<string, string> {
  readonly identities: Map<string, string>;
  constructor(parent?: Scope) { super(parent); this.identities = new Map(parent?.identities); }
  bind(name: string, type: string, id: string) { this.set(name, type); this.identities.set(name, id); return this; }
}

type Report = (category: Diagnostic['category'], code: string, message: string, location?: Located) => void;
function bindModule(module: ModuleDefinition, modules: ModuleDefinition[], report: Report) {
  const globals = new Scope();
  const symbolIds = new Map<string, string>();
  const functions = new Map<string, Extract<Statement, {kind: 'function'}>>();
  const aliases = new Set<string>();
  const enums = new Map<string, string[]>(); const variants = new Set<string>();
  function symbol(name: string, kind: SymbolDefinition['kind'], at: Located, typeName?: string) {
    const id = module.id + ':' + at.span.start.offset + ':' + name;
    if (!symbolIds.has(id)) { module.symbols.push({ id, name, kind, typeName, span: at.span }); symbolIds.set(id, id); }
    return id;
  }
  for (const s of module.statements) {
    if (s.kind === 'enum') {
      if (enums.has(s.name) || PRIMITIVE_TYPES.has(s.name.toLowerCase())) report('binding', 'DUPLICATE_TYPE', 'Type "' + s.name + '" is already defined.', s);
      enums.set(s.name, s.values); s.values.forEach(v => variants.add(v)); symbol(s.name, 'enum', s);
    }
    if (s.kind === 'function') {
      if (functions.has(s.name)) report('binding', 'DUPLICATE_FUNCTION', 'Function "' + s.name + '" is already defined.', s);
      functions.set(s.name, s); symbol(s.name, 'function', s);
    }
    if (s.kind === 'declare') globals.bind(s.name, s.typeName, symbol(s.name, 'variable', s, s.typeName));
    if (s.kind === 'import') {
      if (aliases.has(s.alias) || module.statements.some(d => (d.kind === 'declare' || d.kind === 'function') && d.name === s.alias)) report('binding', 'NAMESPACE_COLLISION', 'Namespace conflicts with another declaration: ' + s.alias, s);
      aliases.add(s.alias); symbol(s.alias, 'namespace', s);
    }
  }
  const validType = (type: string, at: Located) => {
    if (!PRIMITIVE_TYPES.has(type.toLowerCase()) && !enums.has(type)) report('type', 'UNKNOWN_TYPE', 'Unknown type "' + type + '".', at);
  };
  function expression(e: Expression, scope: Scope): string | undefined {
    switch (e.kind) {
      case 'literal': return e.value === null ? undefined : Array.isArray(e.value) ? 'array' : typeof e.value === 'number' ? (Number.isInteger(e.value) ? 'integer' : 'number') : typeof e.value === 'string' ? 'text' : 'boolean';
      case 'identifier':
        if (scope.has(e.name)) { const id = scope.identities.get(e.name); if (id) module.references.push({ symbolId: id, span: e.span }); return scope.get(e.name); }
        if (variants.has(e.name)) return 'enum-value';
        report('binding', 'UNKNOWN_VALUE', 'Unknown value "' + e.name + '".', e); return;
      case 'array': e.values.forEach(v => expression(v, scope)); return 'array';
      case 'index': expression(e.target, scope); expression(e.index, scope); return;
      case 'unary': expression(e.value, scope); return e.operator === 'not' ? 'boolean' : undefined;
      case 'binary': expression(e.left, scope); expression(e.right, scope); return;
      case 'call': {
        let fn = functions.get(e.name);
        if (e.name.includes('.')) {
          const [alias, member, extra] = e.name.split('.');
          const target = modules.find(m => m.id === module.imports[alias]);
          fn = target?.statements.find((s): s is Extract<Statement, {kind:'function'}> => s.kind === 'function' && s.public === true && s.name === member);
          if (extra) fn = undefined;
        }
        if (fn) module.references.push({ symbolId: fn.span.fileId + ':' + fn.span.start.offset + ':' + fn.name, span: e.span });
        if (!fn) report('binding', 'UNKNOWN_FUNCTION', 'Unknown function "' + e.name + '" (module functions must be public).', e);
        if (fn && fn.parameters.length !== e.args.length) report('type', 'ARGUMENT_COUNT', `Function "${fn.name}" expects ${fn.parameters.length} argument(s), but received ${e.args.length}.`, e);
        e.args.forEach(a => expression(a, scope)); return;
      }
    }
  }
  function block(statements: Statement[], inherited: Scope, top = false) {
    const scope = new Scope(inherited); const local = new Set<string>();
    for (const s of statements) {
      switch (s.kind) {
        case 'declare': {
          validType(s.typeName, s);
          if (local.has(s.name)) report('binding', 'DUPLICATE_VARIABLE', 'Variable "' + s.name + '" already exists in this scope.', s);
          const type = expression(s.value, scope);
          if (type && type !== 'enum-value' && PRIMITIVE_TYPES.has(s.typeName.toLowerCase()) && type !== s.typeName.toLowerCase()) report('type', 'TYPE_MISMATCH', '"' + s.name + '" is declared as ' + s.typeName + ', but the assigned value has a different type.', s);
          local.add(s.name); scope.bind(s.name, s.typeName, symbol(s.name, 'variable', s, s.typeName)); break;
        }
        case 'assign': if (!scope.has(s.name)) report('binding', 'UNKNOWN_VARIABLE', 'Unknown variable "' + s.name + '".', s); expression(s.value, scope); break;
        case 'function': {
          if (!top) { report('binding', 'NESTED_DEFINITION', 'Functions must be declared at the top level.', s); break; }
          const params = new Scope(globals); const names = new Set<string>();
          for (const p of s.parameters) {
            validType(p.typeName, p); if (names.has(p.name)) report('binding', 'DUPLICATE_PARAMETER', 'Duplicate parameter: ' + p.name, p);
            names.add(p.name); params.bind(p.name, p.typeName, symbol(p.name, 'parameter', p, p.typeName));
          }
          block(s.body, params); break;
        }
        case 'button': block(s.body, globals); break;
        case 'if': for (const b of s.branches) { expression(b.condition, scope); block(b.body, scope); } if (s.elseBody) block(s.elseBody, scope); break;
        case 'while': expression(s.condition, scope); block(s.body, scope); break;
        case 'forEach': expression(s.iterable, scope); block(s.body, new Scope(scope).bind(s.itemName, 'value', symbol(s.itemName, 'variable', s))); break;
        case 'forRange': validType(s.typeName, s); expression(s.start, scope); expression(s.end, scope); if (s.step) expression(s.step, scope); block(s.body, new Scope(scope).bind(s.itemName, s.typeName, symbol(s.itemName, 'variable', s))); break;
        case 'print': s.values.forEach(v => expression(v, scope)); break;
        case 'return': if (s.value) expression(s.value, scope); break;
        case 'expression': expression(s.expression, scope); break;
        case 'enum': if (!top) report('binding', 'NESTED_DEFINITION', 'Enums must be declared at the top level.', s); break;
      }
    }
  }
  block(module.statements, new Scope(), true);
  const constants = new Map<string, Value>();
  for (const variant of variants) constants.set(variant, variant);
  for (const s of module.statements) {
    if (s.kind !== 'declare') continue;
    const value = constant(s.value, constants);
    if (value !== undefined) constants.set(s.name, value); else constants.delete(s.name);
    if (s.exposure !== 'export') continue;
    const options = enums.get(s.typeName);
    const control = options ? 'enum' : s.typeName.toLowerCase() === 'integer' ? 'number' : s.typeName.toLowerCase() === 'array' ? 'array' : s.typeName.toLowerCase() === 'boolean' ? 'boolean' : 'text';
    module.exports.push({ name: s.name, fileId: module.id, path: module.path, typeName: s.typeName, control, options,
      computedDefault: value === undefined, defaultValue: value ?? (options?.[0] ?? (control === 'number' ? 0 : control === 'array' ? [] : control === 'boolean' ? false : '')) });
  }
}
/** Intentionally excludes calls and operators: computed defaults are resolved only on Run. */
function constant(e: Expression, values: Map<string, Value>): Value | undefined {
  if (e.kind === 'literal') return e.value;
  if (e.kind === 'identifier') return values.get(e.name);
  if (e.kind === 'unary') { const v = constant(e.value, values); if (e.operator === 'negative' && typeof v === 'number') return -v; if (e.operator === 'not' && typeof v === 'boolean') return !v; }
  if (e.kind === 'array') { const vs = e.values.map(v => constant(v, values)); if (vs.every(v => v !== undefined)) return vs as Value[]; }
  return undefined;
}
