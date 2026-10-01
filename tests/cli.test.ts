import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const directory = mkdtempSync(resolve(tmpdir(), 'language-lab-cli-'));
const entry = resolve('.langlab-cli/cli/main.js');
beforeAll(() => {
  const result = spawnSync(process.execPath, ['scripts/lang.mjs', '--build'], {
    encoding: 'utf8',
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}, 30000);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
let serial = 0;
function run(command: string, source: string, name = `game ${++serial}.lang`) {
  const path = resolve(directory, name);
  writeFileSync(path, source);
  return spawnSync(process.execPath, [entry, command, path], {
    encoding: 'utf8',
    timeout: 10000,
  });
}
describe('CLI using the shared isolated language core', () => {
  it('checks valid source without execution', () => {
    const result = run('check', 'while true, do. end while.');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(': OK');
  });
  it('prints file, line, column diagnostics and a nonzero exit status', () => {
    const result = run('check', 'print(1).\ninteger missing = 2.');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/game .*\.lang:2:\d+ SYNTAX_ERROR/);
  });
  it('runs functions, exports, randomInteger and both range forms', () => {
    const result = run(
      'run',
      'export integer: base = 2. function double(integer: n) returns integer. return n * base. end function. for i in range(3), do. print(double(i), randomInteger(4, 4)). end for. for integer: x from 1 to 2, do. print(x). end for.',
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      '0 4',
      '2 4',
      '4 4',
      '1',
      '2',
    ]);
  });
  it('runs typed data, vectors, colours and local signal queues', () => {
    const result = run(
      'run',
      'record Stats [float: speed]. Stats: stats = {"speed": 2.5}. signal hello(). on hello, do. print(stats.speed, Vector2(1,2).x, Color(1,0,0)). end on. emit hello().',
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('2.5 1 #ff0000');
  });
  it.each([
    'scene One. heading "Hello". end scene.',
    'scene One. on enter, do. print(1). end on. end scene.',
    'input integer: n = 1.',
    'button "Go", do. print(1). end button.',
    'on start, do. print(1). end on.',
  ])('detects interactive features before executing anything: %s', (source) => {
    const result = run('run', 'print("MUST NOT RUN"). ' + source);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('lang:open');
    expect(run('check', source).status).toBe(0);
  });
  it('does not load neighboring source or resources from disk', () => {
    writeFileSync(resolve(directory, 'private.json'), '{"secret":1}');
    writeFileSync(resolve(directory, 'private.lang'), 'print("private").');
    const resource = run(
      'run',
      'dictionary: data = loadResource("private.json").',
    );
    expect(resource.status).toBe(1);
    expect(resource.stderr).toContain('existing project JSON');
    const imported = run('check', 'import "./private.lang" as privateModule.');
    expect(imported.status).toBe(1);
    expect(imported.stderr).toContain('MODULE_NOT_FOUND');
  });
  it('enforces execution and output limits', () => {
    const infinite = run('run', 'while true, do. end while.');
    expect(infinite.status).toBe(1);
    expect(infinite.stderr).toMatch(/operations|limit|timed out/);
    const output = run('run', 'for x in range(1500), do. print(x). end for.');
    expect(output.status).toBe(0);
    expect(output.stdout.trim().split('\n')).toHaveLength(1001);
    expect(output.stdout).toContain('Output limit reached');
  });
  it('rejects invalid files and arguments', () => {
    expect(run('check', 'print(1).', 'invalid.txt').status).toBe(1);
    expect(run('check', 'x'.repeat(1_000_001)).stderr).toContain('1 MB');
    expect(
      spawnSync(
        process.execPath,
        [entry, 'check', resolve(directory, 'missing.lang')],
        { encoding: 'utf8' },
      ).status,
    ).toBe(1);
    expect(
      spawnSync(process.execPath, [entry, 'run'], { encoding: 'utf8' }).stderr,
    ).toContain('Usage');
  });
  it('terminates its worker when interrupted', async () => {
    const path = resolve(directory, 'interrupt.lang');
    writeFileSync(path, 'while true, do. end while.');
    const child = spawn(process.execPath, [entry, 'run', path], {
      stdio: 'ignore',
    });
    const exited = new Promise<number | null>((accept) =>
      child.once('exit', (code) => accept(code)),
    );
    await new Promise((accept) => setTimeout(accept, 80));
    child.kill('SIGINT');
    expect([null, 130]).toContain(await exited);
  });
});
