import { describe, expect, it } from 'vitest';
import {
  decodeSourceFile,
  openSourceFile,
  sourceFileName,
  temporarySourceProject,
  LANG_MIME,
} from '../src/runner/sourceFile';
import { compileProject } from '../src/language/analysis';
import { programCapabilities } from '../src/runner/capabilities';
import { RuntimeHost } from '../src/runtime/host';
import { receiveFileLaunch } from '../src/runner/launch';

describe('temporary source projects', () => {
  it('keeps a clean source file as the named entry with fresh stable identities', async () => {
    const source = 'print("hello").\n';
    const project = await openSourceFile(
      new File([source], 'My Game.LANG', { type: 'application/octet-stream' }),
    );
    expect(project.project.entry).toBe('My Game.lang');
    expect(project.files).toHaveLength(1);
    expect(project.files[0].content).toBe(source);
    expect(project.files[0].projectId).toBe(project.project.id);
    expect(Object.isFrozen(project)).toBe(true);
    expect(temporarySourceProject('My Game.lang', source).project.id).not.toBe(
      project.project.id,
    );
    expect(LANG_MIME).toBe('text/x-language-lab');
  });
  it.each([
    '../game.lang',
    '/game.lang',
    'folder/game.lang',
    'C:\\game.lang',
    'game.txt',
    'game.lang\n',
    'game:bad.lang',
  ])('rejects invalid device name %s', (name) =>
    expect(() => sourceFileName(name)).toThrow(),
  );
  it('checks byte size and UTF-8 even when MIME is absent or misleading', async () => {
    expect(() => decodeSourceFile(new Uint8Array([0xff, 0xfe]))).toThrow(
      /UTF-8/,
    );
    await expect(
      openSourceFile(new File(['a'.repeat(1_000_001)], 'large.lang')),
    ).rejects.toThrow(/1 MB/);
    expect(decodeSourceFile(new Uint8Array([0xef, 0xbb, 0xbf, 65]))).toBe('A');
    expect(() =>
      temporarySourceProject('wide.lang', '😀'.repeat(300000)),
    ).toThrow(/1 MB/);
  });
  it.each([
    ['print("input button on start").', false],
    ['scene One. heading "Hello". end scene.', true],
    ['export integer: health = 1. print(health).', false],
    ['input integer: health = 1.', true],
    ['button "Go", do. print(1). end button.', true],
    ['on start, do. print(1). end on.', true],
    ['on update(float: delta), do. print(delta). end on.', true],
    ['signal hit(). on hit, do. print(1). end on. emit hit().', false],
  ])('detects capabilities from validated AST: %s', (source, interactive) => {
    expect(
      programCapabilities(
        compileProject(temporarySourceProject('game.lang', source)),
      ).interactive,
    ).toBe(interactive);
  });
  it('detects reachable module controls while ignoring unreferenced files', () => {
    const project = structuredClone(
      temporarySourceProject('main.lang', 'import "./lib.lang" as lib.'),
    );
    project.files.push({
      ...project.files[0],
      id: 'lib',
      path: 'lib.lang',
      content: 'button "Hi", do. print(1). end button.',
    });
    project.files.push({
      ...project.files[0],
      id: 'unused',
      path: 'unused.lang',
      content: 'not valid source',
    });
    expect(programCapabilities(compileProject(project)).interactive).toBe(true);
  });
  it('reports missing dependencies without loading neighboring files', () => {
    const host = new RuntimeHost();
    const project = temporarySourceProject(
      'game.lang',
      'import "./secret.lang" as secret.',
    );
    expect(
      host.handle({ type: 'analyze', project, epoch: 1, requestId: 1 })
        .diagnostics[0].code,
    ).toBe('MODULE_NOT_FOUND');
    const resource = temporarySourceProject(
      'game.lang',
      'dictionary: secret = loadResource("../private.json").',
    );
    expect(
      host.handle({ type: 'run', project: resource, epoch: 1, requestId: 2 })
        .diagnostics[0].message,
    ).toMatch(/escapes/);
  });
  it('uses the same host for analysis, override initialization, lifecycle, events and Stop epochs', () => {
    const project = structuredClone(
      temporarySourceProject(
        'game.lang',
        'export integer: base = 3. input integer: count = 1. on start, do. print("start"). end on. button "Add", do. count = count + base. print(count). end button.',
      ),
    );
    project.files[0].exportOverrides = { base: 4 };
    const host = new RuntimeHost();
    expect(
      host.handle({ type: 'analyze', project, epoch: 1, requestId: 1 })
        .capabilities?.interactive,
    ).toBe(true);
    expect(
      host.handle({ type: 'run', project, epoch: 1, requestId: 2 }).snapshot
        ?.output,
    ).toEqual(['start']);
    host.handle({
      type: 'input',
      name: 'count',
      value: 5,
      epoch: 1,
      requestId: 3,
    });
    expect(
      host.handle({ type: 'button', id: 'button-0', epoch: 1, requestId: 4 })
        .snapshot?.output,
    ).toEqual(['start', '9']);
    expect(
      host.handle({ type: 'button', id: 'button-0', epoch: 2, requestId: 5 })
        .diagnostics[0].message,
    ).toMatch(/no longer active/);
  });
});

it('feature-detects PWA file launches and handles read failures and multiple files', async () => {
  let consumer!: (params: { files?: { getFile(): Promise<File> }[] }) => void;
  const requests: Promise<File[]>[] = [];
  const target = {
    launchQueue: {
      setConsumer: (fn: typeof consumer) => {
        consumer = fn;
      },
    },
  } as unknown as Window;
  const dispose = receiveFileLaunch((p) => {
    void p.catch(() => {});
    requests.push(p);
  }, target);
  const handle = { getFile: async () => new File(['print(1).'], 'game.lang') };
  consumer({ files: [handle] });
  expect((await requests[0])[0].name).toBe('game.lang');
  consumer({ files: [handle, handle] });
  await expect(requests[1]).rejects.toThrow(/one/);
  consumer({
    files: [
      {
        getFile: async () => {
          throw new Error('Permission denied');
        },
      },
    ],
  });
  await expect(requests[2]).rejects.toThrow(/Permission/);
  dispose();
  consumer({ files: [handle] });
  expect(requests).toHaveLength(3);
  expect(() => receiveFileLaunch(() => {}, {} as Window)()).not.toThrow();
});
