import {
  validType as checkType,
  controlForType,
  matchesType,
  type TypeDefinitions,
} from './types';
import { declarationHints, matchingAssets } from './annotations';
import { BUILTIN_FUNCTIONS, BUILTIN_SIGNATURES, HOST_EVENTS } from './builtins';
import {
  PRIMITIVE_TYPES,
  type Expression,
  type Statement,
  type Value,
  type Located,
} from './ast';
import { DiagnosticError, pointSpan, type Diagnostic } from './diagnostics';
import { LanguageError } from './lexer';
import { parseSource } from './parser';
import type { ProgramField } from './program';
import {
  deepFreeze,
  singleFileSnapshot,
  type ProjectSnapshot,
} from '../workspace/model';
import { resolveImport, VirtualFileSystem } from '../workspace/vfs';

export interface SymbolDefinition {
  id: string;
  name: string;
  kind:
    | 'variable'
    | 'function'
    | 'enum'
    | 'namespace'
    | 'parameter'
    | 'record'
    | 'signal';
  typeName?: string;
  span: Located['span'];
}
export interface ModuleDefinition {
  id: string;
  path: string;
  statements: Statement[];
  imports: Record<string, string>;
  symbols: SymbolDefinition[];
  references: { symbolId: string; span: Located['span'] }[];
  exports: ProgramField[];
}
export interface Program {
  readonly version: 1;
  readonly projectId: string;
  readonly entryId: string;
  readonly modules: ModuleDefinition[];
  readonly resources: {
    id: string;
    path: string;
    content: string;
    binary: boolean;
  }[];
}
export interface Analysis {
  program: Program | null;
  diagnostics: Diagnostic[];
  fields: ProgramField[];
}

/** No runtime dependency: analysis cannot invoke user code. */
export function analyzeProject(snapshot: ProjectSnapshot): Analysis {
  const diagnostics: Diagnostic[] = [];
  const modules: ModuleDefinition[] = [];
  const report = (
    category: Diagnostic['category'],
    code: string,
    message: string,
    location?: Located,
  ) => {
    diagnostics.push({
      category,
      code,
      severity: 'error',
      message,
      span: location?.span ?? pointSpan(snapshot.project.entry),
    });
  };
  try {
    const vfs = new VirtualFileSystem(snapshot);
    const visiting: string[] = [];
    const visited = new Map<string, ModuleDefinition>();
    const visit = (
      path: string,
      at?: Located,
    ): ModuleDefinition | undefined => {
      if (visiting.includes(path)) {
        report(
          'module',
          'IMPORT_CYCLE',
          'Circular import: ' + [...visiting, path].join(' -> '),
          at,
        );
        return;
      }
      if (visited.has(path)) return visited.get(path);
      let file;
      try {
        file = vfs.source(path);
      } catch (error) {
        report('module', 'MODULE_NOT_FOUND', (error as Error).message, at);
        return;
      }
      let statements: Statement[];
      try {
        statements = parseSource(file.content, file.id);
      } catch (error) {
        const e = error as LanguageError;
        diagnostics.push({
          category: 'syntax',
          code: 'SYNTAX_ERROR',
          severity: 'error',
          message: e.message,
          span: e.span ?? pointSpan(file.id),
        });
        return;
      }
      const module: ModuleDefinition = {
        id: file.id,
        path,
        statements,
        imports: Object.create(null),
        symbols: [],
        references: [],
        exports: [],
      };
      visiting.push(path);
      for (const statement of statements) {
        if (statement.kind !== 'import') continue;
        try {
          if (Object.hasOwn(module.imports, statement.alias))
            report(
              'binding',
              'DUPLICATE_NAMESPACE',
              'Namespace already exists: ' + statement.alias,
              statement,
            );
          const target = visit(resolveImport(path, statement.path), statement);
          if (target) module.imports[statement.alias] = target.id;
        } catch (error) {
          report(
            'module',
            'INVALID_IMPORT',
            (error as Error).message,
            statement,
          );
        }
      }
      visiting.pop();
      visited.set(path, module);
      modules.push(module);
      return module;
    };
    const entry = visit(snapshot.project.entry);
    for (const module of modules) bindModule(module, modules, report);
    const resources = snapshot.files
      .filter((f) => f.kind === 'file')
      .map((f) => ({
        id: f.id,
        path: f.path,
        content: f.bytes ? '' : f.content,
        binary: !!f.bytes,
      }));
    for (const field of modules.flatMap((m) => m.exports))
      if (field.hints?.file !== undefined) {
        field.assets = matchingAssets(
          resources.map((r) => r.path),
          field.hints.file,
        );
        field.assetIds = Object.fromEntries(
          resources.map((r) => [r.path, r.id]),
        );
      }
    const fields = modules.flatMap((m) => m.exports);
    if (!entry || diagnostics.length)
      return { program: null, diagnostics, fields };
    return {
      program: deepFreeze({
        version: 1,
        projectId: snapshot.project.id,
        entryId: entry.id,
        modules,
        resources,
      }),
      diagnostics,
      fields,
    };
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
  try {
    return compileProject(singleFileSnapshot(source));
  } catch (error) {
    if (error instanceof DiagnosticError) {
      const d = error.diagnostics[0];
      throw new LanguageError(
        d.message,
        d.span.start.line,
        d.span.start.column,
        d.span,
      );
    }
    throw error;
  }
}

class Scope extends Map<string, string> {
  readonly identities: Map<string, string>;
  constructor(parent?: Scope) {
    super(parent);
    this.identities = new Map(parent?.identities);
  }
  bind(name: string, type: string, id: string) {
    this.set(name, type);
    this.identities.set(name, id);
    return this;
  }
}

type Report = (
  category: Diagnostic['category'],
  code: string,
  message: string,
  location?: Located,
) => void;
function bindModule(
  module: ModuleDefinition,
  modules: ModuleDefinition[],
  report: Report,
) {
  const globals = new Scope();
  const symbolIds = new Map<string, string>();
  const functions = new Map<string, Extract<Statement, { kind: 'function' }>>();
  const aliases = new Set<string>();
  const enums = new Map<string, string[]>();
  const variants = new Set<string>();
  const records = new Map<string, import('./ast').Parameter[]>();
  const signals = new Map<string, import('./ast').Parameter[]>();
  const definitions: TypeDefinitions = { enums: new Map(), records };
  const constantIds = new Set<string>();
  function symbol(
    name: string,
    kind: SymbolDefinition['kind'],
    at: Located,
    typeName?: string,
  ) {
    const id = module.id + ':' + at.span.start.offset + ':' + name;
    if (!symbolIds.has(id)) {
      module.symbols.push({ id, name, kind, typeName, span: at.span });
      symbolIds.set(id, id);
    }
    return id;
  }
  for (const s of module.statements) {
    if (s.kind === 'record') {
      if (
        module.statements.filter(
          (d) =>
            (d.kind === 'record' || d.kind === 'enum') && d.name === s.name,
        ).length > 1 ||
        PRIMITIVE_TYPES.has(s.name.toLowerCase())
      )
        report(
          'binding',
          'DUPLICATE_TYPE',
          'Type already defined: ' + s.name,
          s,
        );
      records.set(s.name, s.fields);
      symbol(s.name, 'record', s);
    }
    if (s.kind === 'signal') {
      if (signals.has(s.name) || Object.hasOwn(HOST_EVENTS, s.name))
        report(
          'binding',
          'DUPLICATE_SIGNAL',
          'Signal is already defined or reserved: ' + s.name,
          s,
        );
      signals.set(s.name, s.parameters);
      symbol(s.name, 'signal', s);
    }
    if (s.kind === 'enum') {
      if (enums.has(s.name) || PRIMITIVE_TYPES.has(s.name.toLowerCase()))
        report(
          'binding',
          'DUPLICATE_TYPE',
          'Type "' + s.name + '" is already defined.',
          s,
        );
      enums.set(s.name, s.values);
      definitions.enums.set(s.name, { values: s.values });
      s.values.forEach((v) => variants.add(v));
      symbol(s.name, 'enum', s);
    }
    if (s.kind === 'function') {
      if (BUILTIN_FUNCTIONS.has(s.name))
        report(
          'binding',
          'RESERVED_FUNCTION',
          'Function "' + s.name + '" is built in and cannot be redefined.',
          s,
        );
      if (functions.has(s.name))
        report(
          'binding',
          'DUPLICATE_FUNCTION',
          'Function "' + s.name + '" is already defined.',
          s,
        );
      functions.set(s.name, s);
      symbol(s.name, 'function', s);
    }
    if (s.kind === 'declare')
      globals.bind(
        s.name,
        s.typeName,
        symbol(s.name, 'variable', s, s.typeName),
      );
    if (s.kind === 'import') {
      if (
        aliases.has(s.alias) ||
        module.statements.some(
          (d) =>
            (d.kind === 'declare' || d.kind === 'function') &&
            d.name === s.alias,
        )
      )
        report(
          'binding',
          'NAMESPACE_COLLISION',
          'Namespace conflicts with another declaration: ' + s.alias,
          s,
        );
      aliases.add(s.alias);
      symbol(s.alias, 'namespace', s);
    }
  }
  const validType = (type: string, at: Located) => {
    if (!checkType(type, definitions))
      report('type', 'UNKNOWN_TYPE', 'Unknown type "' + type + '".', at);
  };
  function expression(e: Expression, scope: Scope): string | undefined {
    switch (e.kind) {
      case 'literal':
        return e.value === null
          ? undefined
          : Array.isArray(e.value)
            ? 'array'
            : typeof e.value === 'number'
              ? Number.isInteger(e.value)
                ? 'integer'
                : 'float'
              : typeof e.value === 'string'
                ? 'text'
                : 'boolean';
      case 'identifier':
        if (scope.has(e.name)) {
          const id = scope.identities.get(e.name);
          if (id) module.references.push({ symbolId: id, span: e.span });
          return scope.get(e.name);
        }
        if (variants.has(e.name)) return 'enum-value';
        report(
          'binding',
          'UNKNOWN_VALUE',
          'Unknown value "' + e.name + '".',
          e,
        );
        return;
      case 'array':
        e.values.forEach((v) => expression(v, scope));
        return 'array';
      case 'object':
        e.entries.forEach((entry) => expression(entry.value, scope));
        return 'dictionary';
      case 'member': {
        const target = expression(e.target, scope);
        return records.get(target ?? '')?.find((f) => f.name === e.name)
          ?.typeName;
      }
      case 'index':
        expression(e.target, scope);
        expression(e.index, scope);
        return;
      case 'unary':
        expression(e.value, scope);
        return e.operator === 'not' ? 'boolean' : undefined;
      case 'binary':
        expression(e.left, scope);
        expression(e.right, scope);
        return;
      case 'call': {
        if (Object.hasOwn(BUILTIN_SIGNATURES, e.name)) {
          const signature = BUILTIN_SIGNATURES[e.name];
          if (!signature.args.includes(e.args.length))
            report(
              'type',
              'ARGUMENT_COUNT',
              e.name +
                ' expects ' +
                (signature.args.length === 1 ? 'exactly ' : '') +
                signature.args.join(' or ') +
                ' arguments.',
              e,
            );
          e.args.forEach((a) => expression(a, scope));
          return signature.returns || undefined;
        }
        let fn = functions.get(e.name);
        if (e.name.includes('.')) {
          const [alias, member, extra] = e.name.split('.');
          const target = modules.find((m) => m.id === module.imports[alias]);
          fn = target?.statements.find(
            (s): s is Extract<Statement, { kind: 'function' }> =>
              s.kind === 'function' && s.public === true && s.name === member,
          );
          if (extra) fn = undefined;
        }
        if (fn)
          module.references.push({
            symbolId:
              fn.span.fileId + ':' + fn.span.start.offset + ':' + fn.name,
            span: e.span,
          });
        if (!fn)
          report(
            'binding',
            'UNKNOWN_FUNCTION',
            'Unknown function "' +
              e.name +
              '" (module functions must be public).',
            e,
          );
        if (fn && fn.parameters.length !== e.args.length)
          report(
            'type',
            'ARGUMENT_COUNT',
            `Function "${fn.name}" expects ${fn.parameters.length} argument(s), but received ${e.args.length}.`,
            e,
          );
        e.args.forEach((a) => expression(a, scope));
        return fn?.returnType;
      }
    }
  }
  function block(
    statements: Statement[],
    inherited: Scope,
    top = false,
    returnType?: string,
  ) {
    const scope = new Scope(inherited);
    const local = new Set<string>();
    for (const s of statements) {
      switch (s.kind) {
        case 'declare': {
          validType(s.typeName, s);
          if (local.has(s.name))
            report(
              'binding',
              'DUPLICATE_VARIABLE',
              'Variable "' + s.name + '" already exists in this scope.',
              s,
            );
          try {
            declarationHints(s);
          } catch (error) {
            const e = error as LanguageError;
            report('type', 'INVALID_ANNOTATION', e.message, {
              ...s,
              span: e.span,
            });
          }
          const type = expression(s.value, scope);
          const staticValue = constant(
            s.value,
            new Map(
              [...variants].filter((v) => !scope.has(v)).map((v) => [v, v]),
            ),
          );
          if (
            staticValue !== undefined &&
            checkType(s.typeName, definitions) &&
            !matchesType(s.typeName, staticValue, definitions)
          )
            report(
              'type',
              'TYPE_MISMATCH',
              'Value is declared as ' +
                s.typeName +
                ', but the assigned value has a different type.',
              s,
            );
          if (
            staticValue === undefined &&
            type &&
            PRIMITIVE_TYPES.has(type) &&
            PRIMITIVE_TYPES.has(s.typeName.toLowerCase()) &&
            type !== s.typeName.toLowerCase() &&
            !(s.typeName === 'float' && type === 'integer') &&
            !(s.typeName === 'color' && type === 'text') &&
            !(
              s.typeName === 'dictionary' &&
              ['vector2', 'vector3', 'resource'].includes(type)
            )
          )
            report(
              'type',
              'TYPE_MISMATCH',
              '"' +
                s.name +
                '" is declared as ' +
                s.typeName +
                ', but the assigned value has a different type.',
              s,
            );
          if (s.constant)
            constantIds.add(symbol(s.name, 'variable', s, s.typeName));
          local.add(s.name);
          scope.bind(
            s.name,
            s.typeName,
            symbol(s.name, 'variable', s, s.typeName),
          );
          break;
        }
        case 'set': {
          expression(s.target, scope);
          expression(s.value, scope);
          let root = s.target;
          while (root.kind === 'member' || root.kind === 'index')
            root = root.target;
          if (root.kind !== 'identifier')
            report(
              'binding',
              'INVALID_ASSIGNMENT',
              'Assignment needs a variable root.',
              s,
            );
          else if (constantIds.has(scope.identities.get(root.name) ?? ''))
            report(
              'binding',
              'CONSTANT_ASSIGNMENT',
              'Cannot change constant ' + root.name + '.',
              s,
            );
          break;
        }
        case 'assign':
          if (constantIds.has(scope.identities.get(s.name) ?? ''))
            report(
              'binding',
              'CONSTANT_ASSIGNMENT',
              'Cannot change constant ' + s.name + '.',
              s,
            );
          if (!scope.has(s.name))
            report(
              'binding',
              'UNKNOWN_VARIABLE',
              'Unknown variable "' + s.name + '".',
              s,
            );
          expression(s.value, scope);
          break;
        case 'function': {
          if (!top) {
            report(
              'binding',
              'NESTED_DEFINITION',
              'Functions must be declared at the top level.',
              s,
            );
            break;
          }
          if (s.returnType) validType(s.returnType, s);
          const params = new Scope(globals);
          const names = new Set<string>();
          for (const p of s.parameters) {
            validType(p.typeName, p);
            if (names.has(p.name))
              report(
                'binding',
                'DUPLICATE_PARAMETER',
                'Duplicate parameter: ' + p.name,
                p,
              );
            names.add(p.name);
            params.bind(
              p.name,
              p.typeName,
              symbol(p.name, 'parameter', p, p.typeName),
            );
          }
          block(s.body, params, false, s.returnType);
          break;
        }
        case 'button':
          block(s.body, globals);
          break;
        case 'if':
          for (const b of s.branches) {
            expression(b.condition, scope);
            block(b.body, scope, false, returnType);
          }
          if (s.elseBody) block(s.elseBody, scope, false, returnType);
          break;
        case 'while':
          expression(s.condition, scope);
          block(s.body, scope, false, returnType);
          break;
        case 'forEach':
          expression(s.iterable, scope);
          block(
            s.body,
            new Scope(scope).bind(
              s.itemName,
              'value',
              symbol(s.itemName, 'variable', s),
            ),
          );
          break;
        case 'forRange':
          validType(s.typeName, s);
          expression(s.start, scope);
          expression(s.end, scope);
          if (s.step) expression(s.step, scope);
          block(
            s.body,
            new Scope(scope).bind(
              s.itemName,
              s.typeName,
              symbol(s.itemName, 'variable', s),
            ),
          );
          break;
        case 'forPythonRange':
          for (const argument of s.args) {
            const type = expression(argument, scope);
            if (type && type !== 'integer')
              report(
                'type',
                'RANGE_INTEGER',
                'range expects integer start, stop, and step values.',
                argument,
              );
          }
          block(
            s.body,
            new Scope(scope).bind(
              s.itemName,
              'integer',
              symbol(s.itemName, 'variable', s, 'integer'),
            ),
          );
          break;
        case 'print':
          s.values.forEach((v) => expression(v, scope));
          break;
        case 'return':
          if (s.value) expression(s.value, scope);
          if (returnType) {
            const value = s.value
              ? constant(
                  s.value,
                  new Map(
                    [...variants]
                      .filter((v) => !scope.has(v))
                      .map((v) => [v, v]),
                  ),
                )
              : null;
            if (
              value !== undefined &&
              !matchesType(returnType, value, definitions)
            )
              report(
                'type',
                'RETURN_TYPE',
                'Return value does not match ' + returnType + '.',
                s,
              );
          }
          break;
        case 'expression':
          expression(s.expression, scope);
          break;
        case 'record':
        case 'signal': {
          const fields = s.kind === 'record' ? s.fields : s.parameters;
          const names = new Set<string>();
          for (const field of fields) {
            validType(field.typeName, field);
            if (names.has(field.name))
              report(
                'binding',
                'DUPLICATE_FIELD',
                'Duplicate name: ' + field.name,
                field,
              );
            names.add(field.name);
          }
          break;
        }
        case 'emit': {
          const signal = signals.get(s.name);
          if (!signal)
            report('binding', 'UNKNOWN_SIGNAL', 'Unknown signal: ' + s.name, s);
          else if (signal.length !== s.args.length)
            report(
              'type',
              'ARGUMENT_COUNT',
              'Signal argument count does not match.',
              s,
            );
          s.args.forEach((a) => expression(a, scope));
          break;
        }
        case 'handler': {
          const expected = Object.hasOwn(HOST_EVENTS, s.event)
            ? HOST_EVENTS[s.event]
            : signals.get(s.event)?.map((p) => p.typeName);
          if (!expected)
            report('binding', 'UNKNOWN_EVENT', 'Unknown event: ' + s.event, s);
          else if (
            expected.join(',') !== s.parameters.map((p) => p.typeName).join(',')
          )
            report(
              'type',
              'EVENT_PARAMETERS',
              'Event parameter types must be: ' + expected.join(', '),
              s,
            );
          const params = new Scope(globals);
          const names = new Set<string>();
          s.parameters.forEach((p) => {
            validType(p.typeName, p);
            if (names.has(p.name))
              report(
                'binding',
                'DUPLICATE_PARAMETER',
                'Duplicate parameter: ' + p.name,
                p,
              );
            names.add(p.name);
            params.bind(
              p.name,
              p.typeName,
              symbol(p.name, 'parameter', p, p.typeName),
            );
          });
          block(s.body, params);
          break;
        }
        case 'enum':
          if (!top)
            report(
              'binding',
              'NESTED_DEFINITION',
              'Enums must be declared at the top level.',
              s,
            );
          break;
      }
    }
  }
  for (const s of module.statements)
    if (s.kind === 'declare' && s.constant)
      constantIds.add(symbol(s.name, 'variable', s, s.typeName));
  block(module.statements, new Scope(), true);
  const constants = new Map<string, Value>();
  for (const variant of variants) constants.set(variant, variant);
  for (const s of module.statements) {
    if (s.kind !== 'declare') continue;
    const value = constant(s.value, constants);
    if (value !== undefined) constants.set(s.name, value);
    else constants.delete(s.name);
    if (s.exposure !== 'export') continue;
    const options = enums.get(s.typeName);
    const control = controlForType(s.typeName, definitions.enums);
    let metadata = {};
    try {
      metadata = declarationHints(s);
    } catch {
      /* diagnostic already reported */
    }
    module.exports.push({
      name: s.name,
      variableName: s.name,
      ...metadata,
      fileId: module.id,
      path: module.path,
      typeName: s.typeName,
      control,
      options,
      computedDefault: value === undefined,
      defaultValue:
        value ??
        options?.[0] ??
        (control === 'number'
          ? 0
          : control === 'object'
            ? {}
            : control === 'array'
              ? []
              : control === 'boolean'
                ? false
                : ''),
    });
  }
}
/** Intentionally excludes calls and operators: computed defaults are resolved only on Run. */
function constant(
  e: Expression,
  values: Map<string, Value>,
): Value | undefined {
  if (e.kind === 'literal') return e.value;
  if (e.kind === 'identifier') return values.get(e.name);
  if (e.kind === 'unary') {
    const v = constant(e.value, values);
    if (e.operator === 'negative' && typeof v === 'number') return -v;
    if (e.operator === 'not' && typeof v === 'boolean') return !v;
  }
  if (e.kind === 'object') {
    const entries = e.entries.map(
      (entry) => [entry.key, constant(entry.value, values)] as const,
    );
    if (entries.every(([, v]) => v !== undefined))
      return Object.fromEntries(entries) as Value;
  }
  if (e.kind === 'array') {
    const vs = e.values.map((v) => constant(v, values));
    if (vs.every((v) => v !== undefined)) return vs as Value[];
  }
  return undefined;
}
