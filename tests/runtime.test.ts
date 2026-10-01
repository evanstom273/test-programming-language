import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokenize, TokenType, LanguageError } from '../src/language/lexer';
import { parseSource } from '../src/language/parser';
import { ProgramSession, inspectSource, runSource, validateSource } from '../src/language/runtime';
import { labelFor } from '../src/language/program';

const calculator = readFileSync(new URL('../examples/interactive-calculator.lang', import.meta.url), 'utf8');

describe('input and button syntax', () => {
  it('tokenizes input/button as keywords, preserving quoted labels', () => {
    const tokens = tokenize('input text: name = "input". button "Run", do. end button.');
    expect(tokens[0].type).toBe(TokenType.Keyword);
    expect(tokens.filter((token) => token.value === 'button').every((token) => token.type === TokenType.Keyword)).toBe(true);
    expect(tokens.find((token) => token.value === 'Run')?.type).toBe(TokenType.String);
  });

  it('produces located AST nodes with ordinary nested executable bodies', () => {
    const ast = parseSource('input integer: health = 10.\nbutton "Heal", do.\n if health is less than 20, do. health = health + 10. end if.\nend button.');
    expect(ast[0]).toMatchObject({ kind: 'declare', exposure: 'input', typeName: 'integer', name: 'health' });
    expect(ast[1]).toMatchObject({ kind: 'button', label: 'Heal', line: 2, body: [{ kind: 'if' }] });
  });

  it.each(['integer count = 1.', 'export integer count = 1.', 'input integer count = 1.', 'input Choice choice = first.', 'function f(integer count). end function.', 'for integer i from 1 to 2, do. end for.'])('rejects missing mandatory colon: %s', (source) => {
    expect(() => validateSource(source)).toThrow(LanguageError);
  });

  it.each(['button Run, do. end button.', 'button "", do. end button.', 'button "Run" do. end button.', 'button "Run", do. print(1).', 'button "Run", do. end if.', 'input export integer: count = 1.'])('rejects malformed constructs: %s', (source) => {
    expect(() => validateSource(source)).toThrow(LanguageError);
  });

  it.each(['function f(). input integer: x = 1. end function.', 'if true, do. button "Go", do. end button. end if.', 'button "Go", do. input text: name = "a". end button.', 'button "Go", do. button "Nested", do. end button. end button.'])('rejects nested UI declarations: %s', (source) => {
    expect(() => validateSource(source)).toThrow(/top level/);
  });
});

describe('interactive sessions', () => {
  it('keeps exports in Inspector and inputs in the program surface', () => {
    expect(inspectSource(calculator).map((field) => field.name)).toEqual(['title']);
    const session = new ProgramSession(calculator);
    expect(session.snapshot().inputs.map((field) => field.name)).toEqual(['numberOne', 'numberTwo', 'operation']);
    expect(session.snapshot().inputs[2]).toMatchObject({ control: 'enum', options: ['add', 'subtract', 'multiply', 'divide'], defaultValue: 'add' });
    expect(session.snapshot().output).toEqual([]);
    expect(session.snapshot().buttons).toEqual([{ id: 'button-0', label: 'Calculate' }]);
  });

  it('applies both override namespaces and reads current inputs inside functions', () => {
    const session = new ProgramSession(calculator, {
      exportOverrides: { title: 'My calculator', numberOne: 99 },
      inputOverrides: { numberOne: 12, numberTwo: 3, operation: 'multiply', title: 'wrong namespace' }
    });
    session.pressButton('button-0');
    session.setInput('numberOne', 20);
    session.setInput('operation', 'divide');
    session.setInput('numberTwo', 4);
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['My calculator 36', 'My calculator 5']);
    expect(new ProgramSession(calculator).snapshot().inputValues.numberOne).toBe(10);
  });

  it('supports text, boolean and nested array inputs', () => {
    const session = new ProgramSession('input text: name = "Lyra". input boolean: enabled = true. input array: items = ["one", [2]]. button "Show", do. if enabled, do. print(name, items[0]). end if. end button.');
    expect(session.snapshot().inputs.map((field) => field.control)).toEqual(['text', 'boolean', 'array']);
    session.setInput('name', 'Mira');
    session.setInput('items', ['two', [3]]);
    session.pressButton('button-0');
    session.setInput('enabled', false);
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['Mira two']);
  });

  it('shares state across buttons and uses fresh action-local variables per click', () => {
    const source = 'input integer: health = 100. integer: score = 0. button "Heal", do. integer: amount = 10. health = health + amount. score = score + 1. print(health, score). end button. button "Reset", do. score = 0. print("Reset complete."). end button.';
    const session = new ProgramSession(source);
    session.pressButton('button-0'); session.pressButton('button-0'); session.pressButton('button-1'); session.pressButton('button-0');
    expect(session.snapshot().inputValues.health).toBe(130);
    expect(session.snapshot().output).toEqual(['110 1', '120 2', 'Reset complete.', '130 1']);
    expect(new ProgramSession(source).snapshot().inputValues.health).toBe(100);
    session.clearOutput();
    expect(session.snapshot().output).toEqual([]);
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['140 2']);
  });

  it('runs ordinary control flow and typed functions in a button', () => {
    const session = new ProgramSession('integer: score = 0. function add(integer: amount). score = score + amount. return score. end function. button "Count", do. for integer: i from 1 to 3, do. add(i). end for. while score is less than 8, do. score = score + 1. end while. for each word in ["done"], do. print(word, score). end for. end button.');
    session.pressButton('button-0');
    expect(session.snapshot().output).toEqual(['done 8']);
  });

  it('gives duplicate labels distinct identities', () => {
    const session = new ProgramSession('button "Go", do. print(1). end button. button "Go", do. print(2). end button.');
    session.pressButton('button-1');
    expect(session.snapshot().output).toEqual(['2']);
    expect(() => session.pressButton('unknown')).toThrow(/Unknown button/);
  });

  it('evaluates defaults in declaration order with effective earlier values', () => {
    const session = new ProgramSession('export integer: base = 2. input integer: amount = base + 1. integer: total = amount + base. print(total).', { exportOverrides: { base: 10 }, inputOverrides: { amount: 20 } });
    expect(session.snapshot().inputs[0].defaultValue).toBe(11);
    expect(session.snapshot().output).toEqual(['30']);
  });

  it('rejects invalid defaults, duplicate declarations and unknown input types', () => {
    expect(() => new ProgramSession('input integer: value = "x".', { inputOverrides: { value: 1 } })).toThrow(/different type/);
    expect(() => new ProgramSession('input integer: x = 1. export integer: x = 2.')).toThrow(/already exists/);
    expect(() => new ProgramSession('input Missing: x = 1.')).toThrow(/Unknown type/);
  });

  it.each([1.5, '', true, [], null, NaN, Infinity, { bad: 1 }])('rejects invalid integer input %j without mutating state', (value) => {
    const session = new ProgramSession('input integer: count = 1.');
    expect(() => session.setInput('count', value)).toThrow(LanguageError);
    expect(session.snapshot().inputValues.count).toBe(1);
  });

  it('validates saved overrides, enum choices and all other input types', () => {
    expect(() => new ProgramSession(calculator, { inputOverrides: { operation: 'modulo' } })).toThrow(/must be one of/);
    const session = new ProgramSession('input text: name = "a". input boolean: enabled = true. input array: items = [].');
    expect(() => session.setInput('name', 1)).toThrow(/different type/);
    expect(() => session.setInput('enabled', 'true')).toThrow(/different type/);
    session.setInput('items', [{}]); // Dictionaries are now language values.
    expect(session.snapshot().inputValues.items).toEqual([{}]);
    expect(() => session.setInput('items', [new Date()])).toThrow(/language values/);
    expect(() => session.setInput('missing', 1)).toThrow(/Unknown input/);
  });

  it('isolates snapshots and caller-owned arrays from mutable program state', () => {
    const items = [[1]];
    const session = new ProgramSession('input array: items = [].', { inputOverrides: { items } });
    items[0][0] = 9;
    const snapshot = session.snapshot();
    (snapshot.inputValues.items as number[][])[0][0] = 8;
    expect(session.snapshot().inputValues.items).toEqual([[1]]);
  });

  it('preserves completed statements on errors, and permits another action', () => {
    const session = new ProgramSession('integer: count = 0. button "Fail", do. count = count + 1. print(count). print(1 / 0). end button. button "Read", do. print(count). end button.');
    expect(() => session.pressButton('button-0')).toThrow(/divide by zero/);
    session.pressButton('button-1');
    expect(session.snapshot().output).toEqual(['1', '1']);
  });

  it('budgets each action independently and stops infinite loops', () => {
    const session = new ProgramSession('input boolean: loop = false. button "Work", do. for integer: i from 1 to 4000, do. integer: x = i + 1. end for. while loop, do. end while. print("done"). end button.');
    for (let i = 0; i < 5; i++) session.pressButton('button-0');
    expect(session.snapshot().output).toHaveLength(5);
    session.setInput('loop', true);
    expect(() => session.pressButton('button-0')).toThrow(/too many operations/);
    session.setInput('loop', false);
    session.pressButton('button-0');
    expect(session.snapshot().output).toHaveLength(6);
  });

  it('rejects return outside a function even inside button conditionals', () => {
    expect(() => new ProgramSession('button "Return", do. if true, do. return 1. end if. end button.')).toThrow(/inside a function/);
  });
});

describe('existing language behavior', () => {
  it('preserves word/symbol arithmetic, boolean logic, arrays and exported overrides', () => {
    const result = runSource('export integer: health = 10. array: items = ["one", "two"]. boolean: alive = true. if alive and health is greater than 5, do. print(health minus 2, health - 2, 3 plus 2, 3 + 2, 3 times 2, 3 * 2, 10 divided by 2, 10 / 2, items[1]). elif not alive, do. print("dead"). else, do. print("low"). end if.', { health: 20 });
    expect(result.output).toEqual(['18 18 5 5 6 6 5 5 two']);
  });
  it('prettifies control labels', () => {
    expect(labelFor('numberOne')).toBe('Number One');
    expect(labelFor('playerName')).toBe('Player Name');
  });
});
