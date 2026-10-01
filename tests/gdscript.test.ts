import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeProject,
  compileProject,
  compileSource,
} from '../src/language/analysis';
import {
  ProgramSession,
  RuntimeSession,
  inspectSource,
  runSource,
} from '../src/language/runtime';
import { parseSource } from '../src/language/parser';
import { singleFileSnapshot } from '../src/workspace/model';
import { matchingAssets } from '../src/language/annotations';

describe('declaration hints', () => {
  it('analyzes annotations without evaluating code, preserving source spans', () => {
    const source =
      '@range(1, 10, 1) @label("HP") @help("Maximum health") @group("Player") export integer: health = compute(). function compute(). while true, do. end while. end function.';
    const field = inspectSource(source)[0];
    expect(field).toMatchObject({
      label: 'HP',
      name: 'health',
      computedDefault: true,
      hints: {
        range: { minimum: 1, maximum: 10, step: 1 },
        group: 'Player',
        help: 'Maximum health',
      },
    });
    expect(parseSource(source, 'stable-id')[0].span).toMatchObject({
      fileId: 'stable-id',
      start: { offset: 0 },
    });
  });
  it('uses the same hints for export and input without clamping program values', () => {
    const session = new ProgramSession(
      '@range(1, 10) export integer: maximum = 20. @range(0, 1, 0.1) @label("Rate") input float: rate = 0.5. button "Go", do. rate = 2.5. print(maximum, rate). end button.',
    );
    expect(session.snapshot().inputs[0]).toMatchObject({
      label: 'Rate',
      variableName: 'rate',
      hints: { range: { step: 0.1 } },
    });
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['20 2.5']);
  });
  it.each([
    '@range(0, 1) input text: x = "a".',
    '@range(2, 1) input integer: x = 1.',
    '@range(0, 1, 0) input float: x = 0.',
    '@range(0, 1, 0.1) input integer: x = 0.',
    '@range(randomInteger(1, 2), 4) input integer: x = 1.',
    '@unknown input integer: x = 1.',
    '@label(2) input integer: x = 1.',
    '@multiline input boolean: x = true.',
    '@file("*.json") @multiline input text: x = "".',
    '@label("a") @label("b") export integer: x = 1.',
    '@range(0, 1) integer: x = 0.',
  ])('rejects invalid annotation %s', (source) =>
    expect(() => compileSource(source)).toThrow(),
  );
  it('matches project asset filters without treating regex punctuation as regex', () => {
    expect(
      matchingAssets(['a.png', 'assets/b.jpg', 'x.json'], '*.png,*.jpg'),
    ).toEqual(['a.png', 'assets/b.jpg']);
    expect(matchingAssets(['a[1].json', 'a1.json'], 'a[1].json')).toEqual([
      'a[1].json',
    ]);
  });
});

describe('typed data', () => {
  it('supports decimals, nested typed collections, records, member writes and return types', () => {
    expect(
      runSource(`record Stats [integer: health, array<float>: speeds].
      Stats: stats = {"health": 100, "speeds": [1, 2.5]}.
      dictionary<text,array<integer>>: scores = {"rounds": [1, 2]}.
      stats.health = 90. stats.speeds[1] = 3.5. scores["rounds"][0] = 9.
      function speed(Stats: data) returns float. return data.speeds[1]. end function.
      print(stats.health, speed(stats), scores["rounds"][0]).`).output,
    ).toEqual(['90 3.5 9']);
  });
  it('copies value data across assignments and function parameters', () => {
    expect(
      runSource(`dictionary: original = {"hp": 1}. dictionary: copy = original.
      copy.hp = 2. function change(dictionary: data). data.hp = 9. end function.
      change(original). print(original.hp, copy.hp).`).output,
    ).toEqual(['1 2']);
  });
  it.each([
    'constant integer: max = 1. max = 2.',
    'constant dictionary: data = {"x": 1}. data.x = 2.',
    'constant array: xs = [1]. function change(). xs[0] = 2. end function. change().',
    'array<integer>: xs = [1, "x"].',
    'dictionary<integer,text>: xs = {}.',
    'record Stats [integer: hp]. Stats: stats = {"hp": 1, "extra": 2}.',
    'record Stats [integer: hp]. Stats: stats = {"hp": 1}. stats.hp = "bad".',
    'function bad() returns integer. return "bad". end function.',
    'function bad() returns integer. end function. print(bad()).',
    'record Stats [integer: hp, text: hp].',
    'float x = 1.5.',
    'array<integer> xs = [1].',
  ])('rejects invalid typed data %s', (source) =>
    expect(() => runSource(source)).toThrow(),
  );
  it('validates input overrides against typed records and arrays', () => {
    const session = new ProgramSession(
      'record Stats [integer: hp]. input Stats: stats = {"hp": 5}. input array<integer>: xs = [1].',
    );
    session.setInput('stats', { hp: 9 });
    session.setInput('xs', [2, 3]);
    expect(() => session.setInput('stats', { hp: 'bad' })).toThrow(
      /different type/,
    );
    expect(() => session.setInput('xs', [2, 'bad'])).toThrow(/different type/);
    expect(session.snapshot().inputValues).toEqual({
      stats: { hp: 9 },
      xs: [2, 3],
    });
  });
  it('treats prototype-like dictionary keys as ordinary own data', () => {
    expect(
      runSource(
        'dictionary: d = {"__proto__": {"x": 1}, "constructor": 2}. d["__proto__"].x = 3. print(d["__proto__"].x, d["constructor"]).',
      ).output,
    ).toEqual(['3 2']);
    expect(() => runSource('dictionary: d = {}. print(d.toString).')).toThrow(
      /Unknown member/,
    );
  });
  it('keeps terminator, member-access and decimal dots distinct', () => {
    expect(
      runSource('dictionary: d = {"x": 1.25}. float: n = d.x. print(n).')
        .output,
    ).toEqual(['1.25']);
    expect(() =>
      parseSource('dictionary: d = {"x": 1}. print(d . x).'),
    ).toThrow();
    expect(runSource('float: x = 2.5.\nprint(x).').output).toEqual(['2.5']);
  });
});

describe('resources and graphics primitives', () => {
  it('loads typed JSON from the immutable project snapshot', () => {
    const snapshot = singleFileSnapshot(
      '@file("*.json") export text: dataPath = "assets/player.json". record Player [text: name, integer: hp]. Player: player = loadResource(dataPath). print(player.name, player.hp).',
    );
    snapshot.files.push({
      ...snapshot.files[0],
      id: 'resource-id',
      path: 'assets/player.json',
      content: '{"name":"Lyra","hp":100}',
    });
    const program = compileProject(snapshot);
    snapshot.files[1].content = '{}';
    expect(program.modules[0].exports[0].assets).toEqual([
      'assets/player.json',
    ]);
    expect(new RuntimeSession(program).snapshot().output).toEqual(['Lyra 100']);
    expect(program.resources[1].id).toBe('resource-id');
  });
  it.each(['../../secret.json', 'https://example.com/a.json', 'missing.json'])(
    'rejects unavailable/escaping resources %s',
    (path) => {
      expect(() =>
        runSource('dictionary: data = loadResource("' + path + '").'),
      ).toThrow();
    },
  );
  it('provides finite vectors and colours with JSON round trips', () => {
    expect(
      runSource(`vector2: direction = Vector2(3, 4). vector2: moved = direction + Vector2(1, 2).
      vector3: point = Vector3(1, 2, 3) * 2. color: tint = Color(1, 0.5, 0).
      dictionary: data = parseJSON(toJSON({"hp": 5})).
      print(length(direction), moved.x, point.z, dot(direction, Vector2(1, 0)), tint, data.hp).`)
        .output,
    ).toEqual(['5 4 6 3 #ff8000 5']);
    expect(
      runSource(
        'vector2: zero = normalized(Vector2(0, 0)). print(zero.x, zero.y).',
      ).output,
    ).toEqual(['0 0']);
    expect(() => runSource('vector2: v = Vector2(1, 2) / 0.')).toThrow();
    expect(() => runSource('color: c = Color(2, 0, 0).')).toThrow();
  });
});

describe('signals and lifecycle', () => {
  it('initializes once, drains queued signals in order, and shares button state', () => {
    const session =
      new ProgramSession(`input integer: health = 10. signal damaged(integer: amount).
      on damaged(integer: amount), do. health = health - amount. print("damage", health). end on.
      on start, do. print("start"). emit damaged(1). print("queued"). end on.
      button "Hit", do. emit damaged(2). print("button", health). end button.`);
    expect(session.snapshot().output).toEqual(['start', 'queued', 'damage 9']);
    session.pressButton('button-0');
    session.pressButton('button-0');
    expect(session.snapshot().output.slice(3)).toEqual([
      'button 9',
      'damage 7',
      'button 7',
      'damage 5',
    ]);
    expect(session.snapshot().inputValues.health).toBe(5);
  });
  it('runs explicit host events with typed delta and input parameters', () => {
    const session =
      new ProgramSession(`input float: elapsed = 0. on update(float: deltaTime), do. elapsed = elapsed + deltaTime. end on.
      on keyDown(text: key), do. print(key). end on. on pointerDown(float: x, float: y), do. print(x, y). end on.`);
    session.dispatchEvent('update', [0.1]);
    session.dispatchEvent('update', [0.2]);
    expect(session.snapshot().inputValues.elapsed).toBeCloseTo(0.3);
    session.dispatchEvent('keyDown', ['a']);
    session.dispatchEvent('pointerDown', [1.5, 2]);
    expect(session.snapshot().output).toEqual(['a', '1.5 2']);
    expect(() => session.dispatchEvent('start', [])).toThrow();
    expect(() => session.dispatchEvent('update', [10])).toThrow();
    expect(() => session.dispatchEvent('update', ['bad'])).toThrow();
  });
  it('limits recursive signal chains and recovers on the next button', () => {
    const session = new ProgramSession(
      'signal again(). on again, do. emit again(). end on. button "Loop", do. emit again(). end button. button "Safe", do. print("ok"). end button.',
    );
    expect(() => session.pressButton('button-0')).toThrow(/Event limit/);
    session.pressButton('button-1');
    expect(session.snapshot().output).toEqual(['ok']);
  });
  it.each([
    'signal update().',
    'on missing, do. end on.',
    'on update(integer: delta), do. end on.',
    'signal hit(integer: damage). emit hit().',
    'signal hit(integer: damage). emit hit("bad").',
  ])('rejects invalid events %s', (source) =>
    expect(() => runSource(source)).toThrow(),
  );
  it('keeps module signals local and starts all modules after globals initialize', () => {
    const snapshot = singleFileSnapshot(
      'import "./lib.lang" as lib. on start, do. print(lib.value()). end on. print(lib.value()).',
    );
    snapshot.files.push({
      ...snapshot.files[0],
      id: 'lib',
      path: 'lib.lang',
      content:
        'integer: count = 1. on start, do. count = 2. end on. public function value() returns integer. return count. end function.',
    });
    expect(analyzeProject(snapshot).diagnostics).toEqual([]);
    expect(
      new RuntimeSession(compileProject(snapshot)).snapshot().output,
    ).toEqual(['1', '2']);
  });
});

describe('compatibility and resource identity', () => {
  it('keeps uppercase primitive types and underscored identifiers valid', () => {
    expect(
      runSource(
        'INPUT ARRAY<INTEGER>: my_items = [1]. FLOAT: _speed = 1.5. print(my_items[0], _speed).',
      ).output,
    ).toEqual(['1 1.5']);
  });
  it('compares dictionary values independent of insertion order', () => {
    expect(runSource('print({"a":1,"b":2} is {"b":2,"a":1}).').output).toEqual([
      'true',
    ]);
  });
  it('retains saved resource references by file identity after a rename', () => {
    const source =
      '@file("*.json") input resource: data = Resource("default.json"). button "Load", do. print(loadResource(data)). end button.';
    const snapshot = singleFileSnapshot(source);
    snapshot.files.push(
      {
        ...snapshot.files[0],
        id: 'default',
        path: 'default.json',
        content: '{"hp":1}',
      },
      {
        ...snapshot.files[0],
        id: 'selected',
        path: 'selected.json',
        content: '{"hp":2}',
      },
    );
    const options = {
      inputOverrides: {
        data: { $type: 'resource', id: 'selected', path: 'selected.json' },
      },
    };
    snapshot.files[2].path = 'renamed.json';
    const session = new RuntimeSession(compileProject(snapshot), options);
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['{"hp":2}']);
    expect(session.snapshot().inputs[0].assetIds?.['renamed.json']).toBe(
      'selected',
    );
    snapshot.files.pop();
    expect(() => {
      const missing = new RuntimeSession(compileProject(snapshot), options);
      missing.pressButton('button-0');
    }).toThrow(/existing project JSON/);
  });
  it('rejects invalid, oversized, and structurally incorrect JSON resources', () => {
    for (const data of [
      '{broken',
      '{"hp":"bad"}',
      JSON.stringify({ hp: 'a'.repeat(70000) }),
    ]) {
      const snapshot = singleFileSnapshot(
        'record Stats [integer: hp]. Stats: stats = loadResource("data.json").',
      );
      snapshot.files.push({
        ...snapshot.files[0],
        id: 'data',
        path: 'data.json',
        content: data,
      });
      expect(() => new RuntimeSession(compileProject(snapshot))).toThrow();
    }
  });
  it('bounds object depth, keys and cyclic host values', () => {
    const session = new ProgramSession('input dictionary: data = {}.');
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => session.setInput('data', cycle)).toThrow(/language values/);
    expect(() => session.setInput('data', { text: 'a'.repeat(70000) })).toThrow(
      /resource limits/,
    );
  });
});

it('executes the shipped feature project and keeps the unreferenced lifecycle file inactive', () => {
  const path = new URL('../examples/gdscript-inspired/', import.meta.url);
  const snapshot = singleFileSnapshot(
    readFileSync(new URL('main.lang', path), 'utf8'),
  );
  for (const name of ['assets/player.json', 'lifecycle.lang'])
    snapshot.files.push({
      ...snapshot.files[0],
      id: name,
      path: name,
      content: readFileSync(new URL(name, path), 'utf8'),
    });
  const session = new RuntimeSession(compileProject(snapshot));
  expect(session.snapshot().events).toEqual([]);
  session.setInput('action', 'damage');
  session.pressButton('button-0');
  expect(session.snapshot().output.at(-1)).toContain('Health 95');
  snapshot.project.entry = 'lifecycle.lang';
  const lifecycle = new RuntimeSession(compileProject(snapshot));
  lifecycle.dispatchEvent('update', [0.1]);
  expect(lifecycle.snapshot().inputValues.elapsed).toBe(0.1);
});

it('does not constant-fold enum variants through a shadowing variable or parameter', () => {
  expect(
    runSource(
      'enum Mode [easy]. integer: easy = 2. integer: value = easy. function read(integer: easy) returns integer. return easy. end function. print(value, read(3)).',
    ).output,
  ).toEqual(['2 3']);
});

it('keeps text concatenation with vectors and rejects non-finite intermediate results', () => {
  expect(runSource('print("Position: " + Vector2(1, 2)).').output[0]).toContain(
    'Position: {',
  );
  expect(() =>
    runSource('float: n = 10. while true, do. n = n * n. end while.'),
  ).toThrow(/finite/);
});

it('bounds aggregate queued payloads and clears them after an error', () => {
  const source =
    'text: payload = ' +
    JSON.stringify('a'.repeat(64000)) +
    '. signal data(text: message). button "Flood", do. for x in range(100), do. emit data(payload). end for. end button. button "Recover", do. emit data("ok"). print("recovered"). end button.';
  const session = new ProgramSession(source);
  expect(() => session.pressButton('button-0')).toThrow(/Event payload limit/);
  session.pressButton('button-1');
  expect(session.snapshot().output).toEqual(['recovered']);
});
