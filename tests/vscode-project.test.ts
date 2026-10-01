import { it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProject } from '../extensions/vscode/src/project';
import { compileProject } from '../src/language/analysis';
import { RuntimeSession } from '../src/language/runtime';
it('loads entry, modules, resources and unsaved buffers without including ignored folders', async () => {
  const root = await mkdtemp(join(tmpdir(), 'langlab-project-'));
  try {
    await mkdir(join(root, 'lib'));
    await mkdir(join(root, 'node_modules'));
    await mkdir(join(root, '.private'));
    await writeFile(
      join(root, 'langlab.json'),
      JSON.stringify({ schemaVersion: 1, name: 'Project', entry: 'main.lang' }),
    );
    await writeFile(
      join(root, 'main.lang'),
      'import "./lib/maths.lang" as maths. print(maths.double(2)).',
    );
    await writeFile(
      join(root, 'lib/maths.lang'),
      'public function double(integer: n). return n * 2. end function.',
    );
    await writeFile(join(root, '.private/secret'), 'excluded');
    const buffers = new Map([
      [
        join(root, 'lib/maths.lang'),
        'public function double(integer: n). return n * 3. end function.',
      ],
      [join(root, 'new.lang'), 'print("unused").'],
    ]);
    const project = await loadProject(
      join(root, 'lib/maths.lang'),
      [root],
      buffers,
    );
    expect(project.project.entry).toBe('main.lang');
    expect(project.files.map((f) => f.path)).toEqual([
      'lib/maths.lang',
      'main.lang',
      'new.lang',
    ]);
    expect(
      new RuntimeSession(compileProject(project)).snapshot().output,
    ).toEqual(['6']);
    const single = await loadProject(join(root, 'main.lang'), [], buffers);
    expect(single.files).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('rejects invalid manifests, escaping entry points, symlinks and oversized buffers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'langlab-project-'));
  try {
    const entry = join(root, 'main.lang');
    await writeFile(entry, 'print(1).');
    await writeFile(
      join(root, 'langlab.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'Bad',
        entry: '../escape.lang',
      }),
    );
    await expect(loadProject(entry, [root])).rejects.toThrow(/path/);
    await writeFile(
      join(root, 'langlab.json'),
      JSON.stringify({ schemaVersion: 1, name: 'Bad', entry: 'main.lang' }),
    );
    await symlink(entry, join(root, 'linked.lang'));
    await expect(loadProject(entry, [root])).rejects.toThrow(/links/);
    await rm(join(root, 'linked.lang'));
    await expect(
      loadProject(entry, [root], new Map([[entry, 'x'.repeat(1_000_001)]])),
    ).rejects.toThrow(/limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('preserves Inspector configuration and resource references across file/folder renames', async () => {
  const { renameConfiguration } = await import(
    '../extensions/vscode/src/configuration'
  );
  const { pathToFileURL } = await import('node:url');
  const root = join(tmpdir(), 'settings-project');
  const source = pathToFileURL(join(root, 'main.lang')).href;
  const resource = pathToFileURL(join(root, 'data/one.json')).href;
  const settings = {
    [source]: {
      title: 'Game',
      data: { $type: 'resource', id: resource, path: 'data/one.json' },
    },
  };
  const nextRoot = root + '-renamed';
  const next = renameConfiguration(settings, [{ from: root, to: nextRoot }]);
  const fields = next[pathToFileURL(join(nextRoot, 'main.lang')).href];
  expect(fields.title).toBe('Game');
  expect(fields.data).toEqual({
    $type: 'resource',
    id: pathToFileURL(join(nextRoot, 'data/one.json')).href,
    path: 'data/one.json',
  });
  expect(settings[source].data.id).toBe(resource);
});
