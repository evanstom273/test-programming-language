import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../src/language/analysis';
import { tokenize } from '../src/language/lexer';
import { runSource, ProgramSession } from '../src/language/runtime';
import { singleFileSnapshot } from '../src/workspace/model';
import { primitive } from '../src/language/primitives';
import { LanguageTools } from '../src/tooling/service';

describe('general coding features', () => {
  it('supports line/block comments, precise following spans and unchanged division/strings', () => {
    const source =
      '# hello\n/* multi\nline */ integer: n = 8 / 2. print(n, "# /* not comments */").';
    expect(runSource(source).output).toEqual(['4 # /* not comments */']);
    const n = tokenize(source, 'file').find((t) => t.value === 'n')!;
    expect(n.span.start.line).toBe(3);
    expect(source.slice(n.span.start.offset, n.span.end.offset)).toBe('n');
    expect(() => tokenize('/* unterminated', 'file')).toThrow(
      /Unterminated block comment/,
    );
  });
  it.each([
    'for i in range(5), do.',
    'for integer: i from 0 to 4, do.',
    'for each i in [0,1,2,3,4], do.',
  ])('breaks/continues each loop kind: %s', (loop) => {
    expect(
      runSource(
        `${loop} if i is 1, do. continue. end if. if i is 3, do. break. end if. print(i). end for. print("done").`,
      ).output,
    ).toEqual(['0', '2', 'done']);
  });
  it('handles while, nested loops, return propagation and persistent button state', () => {
    const session = new ProgramSession(
      'integer: count = 0. function find() returns integer. for i in range(3), do. if i is 1, do. return i. end if. end for. return 9. end function. button "Go", do. integer: i = 0. while i is less than 4, do. i = i + 1. if i is 2, do. continue. end if. for j in range(3), do. count = count + 1. break. end for. end while. print(count, find()). end button.',
    );
    session.pressButton('button-0');
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['3 1', '6 1']);
  });
  it.each([
    'break.',
    'continue.',
    'function f(). break. end function.',
    'button "Bad", do. continue. end button.',
    'on start, do. break. end on.',
  ])('rejects invalid loop control statically: %s', (source) => {
    expect(
      analyzeProject(singleFileSnapshot(source)).diagnostics.some(
        (d) => d.code === 'LOOP_CONTROL_OUTSIDE_LOOP',
      ),
    ).toBe(true);
  });
  it('checks return paths and types inside all loops', () => {
    for (const source of [
      'function f() returns integer. if true, do. return 1. end if. end function.',
      'function f() returns integer. for i in range(2), do. return "bad". end for. return 0. end function.',
      'function f() returns integer. text: value = "bad". return value. end function.',
    ])
      expect(
        analyzeProject(singleFileSnapshot(source)).diagnostics.some(
          (d) => d.category === 'type',
        ),
      ).toBe(true);
    expect(
      runSource(
        'function f(boolean: b) returns integer. if b, do. return 1. else, do. return 2. end if. end function. print(f(false)).',
      ).output,
    ).toEqual(['2']);
    expect(() => runSource('while true, do. continue. end while.')).toThrow(
      /too many operations/,
    );
  });
  it('bounds text helper allocations before constructing oversized output', () => {
    expect(() => primitive('join', [['x', 'y'], 'z'.repeat(65_536)])).toThrow(
      /resource limits/,
    );
    expect(() => primitive('split', ['x'.repeat(10_001), ''])).toThrow(
      /resource limits/,
    );
    expect(() => primitive('split', ['x,'.repeat(10_001), ','])).toThrow(
      /resource limits/,
    );
  });
  it('provides bounded math and Unicode-aware text/collection helpers', () => {
    expect(
      runSource(
        'print(abs(-2), floor(-1.2), ceil(-1.2), round(2.5), min(3,1), max(3,1), clamp(20,0,10), lerp(0,10,0.25)). print(trim(" hi "), lower("Hi"), upper("hi"), contains("hello","ell"), join(split("a,b",","),"-"), size("🐉x"), size([1,2]), size({"x":1})).',
      ).output,
    ).toEqual(['2 -2 -1 3 1 3 10 2.5', 'hi hi HI true a-b 2 2 1']);
    expect(
      runSource('array<text>: letters = split("🐉x", ""). print(letters[0]).')
        .output,
    ).toEqual(['🐉']);
    for (const s of [
      'print(trim(2)).',
      'print(clamp(2,10,0)).',
      'print(join([1],",")).',
      'print(size(5)).',
    ])
      expect(() => runSource(s)).toThrow();
    expect(() => runSource('integer n = 1.')).toThrow();
  });
});

describe('shared language tooling', () => {
  function project(source: string) {
    const p = singleFileSnapshot(source);
    p.files.push({
      ...p.files[0],
      id: 'lib',
      path: 'lib.lang',
      content:
        'public function double(integer: value) returns integer. return value * 2. end function. function privateFn(). end function.',
    });
    return p;
  }
  it('resolves namespaced functions, precise definition names and references', () => {
    const p = project(
      'import "./lib.lang" as maths. integer: n = 3. print(maths.double(n)). n = 4.',
    );
    const tools = new LanguageTools(p, analyzeProject(p));
    const s = tools.symbolAt(
      'main.lang',
      p.files[0].content.indexOf('double') + 1,
    )!;
    expect(s.span.fileId).toBe('lib');
    expect(
      p.files[1].content.slice(
        tools.selection(s).start.offset,
        tools.selection(s).end.offset,
      ),
    ).toBe('double');
    expect(tools.references(s)).toHaveLength(2);
    expect(
      tools.hover('main.lang', p.files[0].content.indexOf('double')),
    ).toContain('returns integer');
    const n = tools.symbolAt(
      'main.lang',
      p.files[0].content.lastIndexOf('n ='),
    )!;
    expect(tools.references(n)).toHaveLength(3);
  });
  it('keeps namespace completions while the trailing expression is incomplete', () => {
    const p = project('import "./lib.lang" as maths.\nmaths.');
    const analysis = analyzeProject(p);
    expect(analysis.program).toBeNull();
    const tools = new LanguageTools(p, analysis);
    expect(
      tools
        .completions('main.lang', p.files[0].content.length)
        .map((c) => c.label),
    ).toEqual(['double']);
  });
  it('keeps function-local completions out of unrelated top-level code', () => {
    const p = project(
      'function f(integer: local). print(local). end function. print(1).',
    );
    const tools = new LanguageTools(p, analyzeProject(p));
    expect(
      tools
        .completions('main.lang', p.files[0].content.length)
        .some((c) => c.label === 'local'),
    ).toBe(false);
    expect(
      tools
        .completions('main.lang', p.files[0].content.indexOf('print(local)'))
        .some((c) => c.label === 'local'),
    ).toBe(true);
  });
});
