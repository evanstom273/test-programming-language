import { describe, expect, it } from 'vitest';
import { analyzeProject, compileProject, compileSource } from '../src/language/analysis';
import { parseSource } from '../src/language/parser';
import { tokenize } from '../src/language/lexer';
import { RuntimeSession, inspectSource, ProgramSession } from '../src/language/runtime';
import { singleFileSnapshot, type ProjectSnapshot } from '../src/workspace/model';

export function project(sources: Record<string, string>): ProjectSnapshot {
  const snapshot = singleFileSnapshot(sources['main.lang'] ?? '');
  snapshot.files = Object.entries(sources).map(([path, content]) => ({ ...snapshot.files[0], id: path, path, name: path, content }));
  return snapshot;
}
describe('source model and static compilation', () => {
  it('locates tokens and complete nested AST nodes with file identity and exclusive offsets', () => {
    const source = 'input integer: number = 12.\nbutton "Go", do. print((number + 2) * 3). end button.';
    const tokens = tokenize(source, 'file-uuid');
    const number = tokens.find(t => t.value === '12')!;
    expect(source.slice(number.span.start.offset, number.span.end.offset)).toBe('12');
    expect(tokens.at(-1)?.span.start.offset).toBe(source.length);
    const ast = parseSource(source, 'file-uuid');
    expect(source.slice(ast[0].span.start.offset, ast[0].span.end.offset)).toBe('input integer: number = 12.');
    expect(ast[1].span).toMatchObject({ fileId: 'file-uuid', start: { line: 2, column: 1 }, end: { offset: source.length } });
    if (ast[1].kind !== 'button' || ast[1].body[0].kind !== 'print') throw new Error('Unexpected AST');
    const e = ast[1].body[0].values[0];
    expect(source.slice(e.span.start.offset, e.span.end.offset)).toBe('(number + 2) * 3');
  });
  it('reports syntax, binding, type, and module diagnostics with codes and file spans', () => {
    for (const [source, category] of [['integer x = 1.', 'syntax'], ['print(missing).', 'binding'], ['integer: x = "a".', 'type'], ['import "./missing.lang" as missing.', 'module']]) {
      const result = analyzeProject(project({ 'main.lang': source }));
      expect(result.program).toBeNull();
      expect(result.diagnostics[0]).toMatchObject({ category, severity: 'error', span: { fileId: 'main.lang' } });
      expect(result.diagnostics[0].code).toBeTruthy();
    }
  });
  it('never executes initializer calls or top-level loops to discover Inspector exports', () => {
    const fields = inspectSource('function forever(). while true, do. end while. return 1. end function. export integer: computed = forever(). while true, do. end while. export text: title = "Safe".');
    expect(fields).toMatchObject([{ name: 'computed', computedDefault: true }, { name: 'title', computedDefault: false, defaultValue: 'Safe' }]);
  });
  it('freezes Programs recursively and reuses them across isolated sessions', () => {
    const p = compileSource('integer: count = 0. button "Add", do. count = count + 1. print(count). end button.');
    expect(Object.isFrozen(p.modules[0].statements[0])).toBe(true);
    expect(() => { p.modules[0].path = 'bad'; }).toThrow();
    const a = new RuntimeSession(p), b = new RuntimeSession(p);
    a.pressButton('button-0'); a.pressButton('button-0'); b.pressButton('button-0');
    expect(a.snapshot().output).toEqual(['1','2']); expect(b.snapshot().output).toEqual(['1']);
  });
  it('binds block locals, function parameters and module globals without leaking locals', () => {
    expect(() => compileSource('if true, do. integer: inside = 1. end if. print(inside).')).toThrow(/Unknown value/);
    const p = compileSource('integer: global = 2. function twice(integer: value). return value * global. end function. print(twice(3)).');
    expect(p.modules[0].symbols.map(s => s.name)).toEqual(expect.arrayContaining(['global','twice','value']));
    expect(new RuntimeSession(p).snapshot().output).toEqual(['6']);
  });
});
describe('module resolution and execution', () => {
  const main = 'import "./lib/maths.lang" as maths. input integer: number = 4. button "Double", do. print(maths.double(number)). end button.';
  const lib = 'export integer: factor = 2. integer: count = 0. public function double(integer: value). count = count + 1. print(count). return value * factor. end function.';
  it('calls public functions using module-local globals and persistent state plus overrides', () => {
    const p = compileProject(project({ 'main.lang': main, 'lib/maths.lang': lib }));
    const session = new RuntimeSession(p, { modules: { 'lib/maths.lang': { exportOverrides: { factor: 3 } } } });
    session.pressButton('button-0'); session.setInput('number', 5); session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['1','12','2','15']);
    expect(p.modules.flatMap(m => m.exports)).toMatchObject([{ name: 'factor', fileId: 'lib/maths.lang' }]);
  });
  it('initializes diamond dependencies once in deterministic import order and ignores unrelated invalid files', () => {
    const p = compileProject(project({
      'main.lang': 'import "./a.lang" as a. import "./b.lang" as b. print("main").',
      'a.lang': 'import "./shared.lang" as shared. print("a").',
      'b.lang': 'import "./shared.lang" as shared. print("b").',
      'shared.lang': 'print("shared").', 'unused.lang': 'not valid code'
    }));
    expect(new RuntimeSession(p).snapshot().output).toEqual(['shared','a','b','main']);
  });
  it.each([
    ['import "./missing.lang" as x.', 'Missing source module'],
    ['import "https://example.com/lib.lang" as x.', 'relative .lang'],
    ['import "../escape.lang" as x.', 'escapes'],
    ['import "./lib/maths.lang" as m. print(m.privateCall()).', 'Unknown function'],
    ['import "./lib/maths.lang" as m. print(m.factor).', 'Unknown value'],
    ['import "./lib/maths.lang" as m. print(m.double()).', 'expects 1']
  ])('rejects invalid imports/namespace access: %s', (source, expected) => {
    expect(() => compileProject(project({ 'main.lang': source, 'lib/maths.lang': lib }))).toThrow(expected);
  });
  it('rejects cycles with the import chain and source location', () => {
    const result = analyzeProject(project({ 'main.lang': 'import "./a.lang" as a.', 'a.lang': 'import "./main.lang" as root.' }));
    expect(result.diagnostics[0]).toMatchObject({ code:'IMPORT_CYCLE', span: { fileId:'a.lang' } });
    expect(result.diagnostics[0].message).toContain('main.lang -> a.lang -> main.lang');
  });
  it('resolves relative parents without escaping and permits same local names across modules', () => {
    const p = compileProject(project({ 'main.lang': 'import "./lib/a.lang" as a. integer: count = 99. print(a.read(), count).', 'lib/a.lang': 'import "../base.lang" as base. integer: count = 7. public function read(). return count. end function.', 'base.lang': 'integer: count = 1.' }));
    expect(new RuntimeSession(p).snapshot().output).toEqual(['7 99']);
  });
  it('disambiguates adjacent namespace dots, terminators, and pre-existing fractional literals', () => {
    const p = compileProject(project({ 'main.lang': 'import "./lib/maths.lang" as m. integer: x = 2.\nx = 3. m.double(x). print(1.5).', 'lib/maths.lang': lib }));
    expect(new RuntimeSession(p).snapshot().output).toEqual(['1','1.5']);
    expect(() => parseSource('print(m . double(1)).')).toThrow();
    expect(() => parseSource('decimal: x = 1.5.')).not.toThrow(); // parsed as a named type, rejected by analysis
    expect(() => compileSource('decimal: x = 1.5.')).toThrow(/Unknown type/);
  });
});
describe('runtime resource limits', () => {
  it('bounds output and permits clearing it without losing program state', () => {
    const s = new ProgramSession('integer: count = 0. button "Spam", do. for integer: i from 1 to 1500, do. print(i). end for. count = count + 1. end button. button "Read", do. print(count). end button.');
    s.pressButton('button-0'); expect(s.snapshot().output).toHaveLength(1001); expect(s.snapshot().output.at(-1)).toMatch(/Output limit/);
    s.clearOutput(); s.pressButton('button-1'); expect(s.snapshot().output).toEqual(['1']);
  });
  it('supports cooperative cancellation at operation boundaries and bounds recursion/values', () => {
    expect(() => new ProgramSession('while true, do. end while.', { cancelled: () => true })).toThrow(/stopped/);
    expect(() => new ProgramSession('function recurse(). return recurse(). end function. recurse().')).toThrow(/depth limit/);
    expect(() => new ProgramSession('text: value = "x". while true, do. value = value + value. end while.')).toThrow(/resource limits/);
  });
});
