import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { LanguageLabDatabase } from '../src/db';
import { WorkspaceStore, snapshotWithDrafts } from '../src/workspace/store';
import {
  canonicalPath,
  resolveImport,
  VirtualFileSystem,
} from '../src/workspace/vfs';
import {
  exportProject,
  importProject,
  readArchive,
} from '../src/workspace/archive';
import { singleFileSnapshot } from '../src/workspace/model';
const databases: LanguageLabDatabase[] = [];
function setup(name = crypto.randomUUID()) {
  const db = new LanguageLabDatabase(name);
  databases.push(db);
  return { db, store: new WorkspaceStore(db) };
}
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

describe('workspace migration and identity', () => {
  it('migrates v1 atomically, preserves exact content/IDs/overrides, and retains raw backup records', async () => {
    const name = crypto.randomUUID();
    const old = new Dexie(name);
    old.version(1).stores({ files: 'id, name, createdAt, updatedAt' });
    const records = [
      {
        id: 'one',
        name: 'main.lang',
        content: 'integer health = 100.',
        exportOverrides: { health: 7 },
        inputOverrides: { health: 8 },
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'two',
        name: '../odd name',
        content: 'print("another independent program").',
        createdAt: 3,
        updatedAt: 4,
      },
    ];
    await old.table('files').bulkAdd(records);
    old.close();
    const { db, store } = setup(name);
    await db.open();
    expect(await db.projects.count()).toBe(2);
    for (const record of records) {
      expect(await db.files.get(record.id)).toMatchObject(record);
      expect((await db.legacyBackup.get(record.id))?.value).toEqual(record);
      const snapshot = await store.snapshot('legacy-' + record.id);
      expect(snapshot.files).toHaveLength(1);
      expect(snapshot.files[0].id).toBe(record.id);
      expect(
        new VirtualFileSystem(snapshot).source(snapshot.project.entry).content,
      ).toBe(record.content);
    }
    db.close();
    await db.open();
    expect(await db.projects.count()).toBe(2);
  });
  it('preserves override identity through file/folder/project renames and moves', async () => {
    const { db, store } = setup();
    const p = await store.createProject('Example');
    await store.addFile(p.id, 'lib', '', 'folder');
    const f = await store.addFile(
      p.id,
      'lib/maths.lang',
      'export integer: factor = 2.',
    );
    await db.files.update(f.id, {
      exportOverrides: { factor: 5 },
      inputOverrides: { x: 7 },
    });
    await store.move(f.id, 'lib/calculation.lang');
    const folder = await db.files
      .where('[projectId+path]')
      .equals([p.id, 'lib'])
      .first();
    await store.move(folder!.id, 'modules');
    await store.renameProject(p.id, 'Renamed');
    expect(await db.files.get(f.id)).toMatchObject({
      id: f.id,
      path: 'modules/calculation.lang',
      exportOverrides: { factor: 5 },
      inputOverrides: { x: 7 },
    });
    const main = await db.files
      .where('[projectId+path]')
      .equals([p.id, 'main.lang'])
      .first();
    await store.move(main!.id, 'start.lang');
    expect((await db.projects.get(p.id))?.entry).toBe('start.lang');
  });
  it('takes isolated snapshots including unsaved drafts without modifying persistence', async () => {
    const { store } = setup();
    const p = await store.createProject('Snapshot');
    const before = await store.snapshot(p.id);
    const f = before.files[0];
    const draft = snapshotWithDrafts(
      before,
      new Map([[f.id, 'print("draft").']]),
    );
    await store.saveSource(f.id, 'print("saved later").');
    expect(before.files[0].content).toContain('Hello');
    expect(draft.files[0].content).toBe('print("draft").');
    expect(Object.isFrozen(before.project)).toBe(true);
    expect((await store.snapshot(p.id)).files[0].revision).toBe(1);
  });
  it('supports duplicate/delete, protects entry points, and rolls back path collisions', async () => {
    const { store, db } = setup();
    const p = await store.createProject('One');
    const f = await store.addFile(p.id, 'extra.lang', 'print(2).');
    const copy = await store.duplicate(f.id, 'copy.lang');
    expect(copy.id).not.toBe(f.id);
    await expect(store.move(f.id, 'main.lang')).rejects.toThrow(/Duplicate/);
    expect((await db.files.get(f.id))?.path).toBe('extra.lang');
    const main = (await store.snapshot(p.id)).files.find(
      (f) => f.path === 'main.lang',
    )!;
    await expect(store.deleteFile(main.id)).rejects.toThrow(/entry/);
    await store.setEntry(p.id, 'copy.lang');
    await store.deleteFile(main.id);
    const p2 = await store.duplicateProject(p.id);
    expect(p2.id).not.toBe(p.id);
    await store.deleteProject(p.id);
    expect(await db.projects.count()).toBe(1);
    expect((await store.snapshot(p2.id)).files).toHaveLength(2);
  });
  it('transactional import rolls back the project and earlier files on an ID conflict', async () => {
    const { store, db } = setup();
    const p = await store.createProject('Existing');
    const existing = await store.snapshot(p.id);
    const imported = structuredClone(existing);
    imported.project.id = 'new-project';
    imported.files = [
      {
        ...existing.files[0],
        id: 'new-file',
        projectId: 'new-project',
        path: 'other.lang',
      },
      { ...existing.files[0], projectId: 'new-project' },
    ];
    await expect(store.importSnapshot(imported)).rejects.toThrow();
    expect(await db.projects.get('new-project')).toBeUndefined();
    expect(await db.files.get('new-file')).toBeUndefined();
    expect(await db.files.count()).toBe(1);
    expect(await db.projects.count()).toBe(1);
  });
});

describe('portable archives and hostile inputs', () => {
  const manifest = strToU8(
    JSON.stringify({ schemaVersion: 1, name: 'Imported', entry: 'main.lang' }),
  );
  it('round trips source, nested paths, empty folders and binary assets without personal overrides', async () => {
    const { store, db } = setup();
    const p = await store.createProject('Portable');
    await store.addFile(p.id, 'assets', '', 'folder');
    await store.addFile(p.id, 'empty', '', 'folder');
    await store.addFile(
      p.id,
      'assets/icon.bin',
      '',
      'file',
      new Uint8Array([0, 255, 33]),
    );
    const f = await store.addFile(
      p.id,
      'lib/helper.lang',
      'public function read(). return 2. end function.',
    );
    await db.files.update(f.id, {
      exportOverrides: { privateValue: 'secret' },
      inputOverrides: { name: 'personal' },
    });
    const before = await store.snapshot(p.id);
    const bytes = exportProject(before);
    const after = importProject(bytes);
    expect(after.project.name).toBe('Portable');
    expect(after.project.id).not.toBe(p.id);
    expect(after.files.map((f) => f.path).sort()).toEqual(
      before.files.map((f) => f.path).sort(),
    );
    expect(
      after.files.find((f) => f.path === 'assets/icon.bin')?.bytes,
    ).toEqual(new Uint8Array([0, 255, 33]));
    expect(
      after.files.every((f) => !f.exportOverrides && !f.inputOverrides),
    ).toBe(true);
    await store.importSnapshot(after);
    expect(await db.projects.count()).toBe(2);
  });
  it.each([
    '../escape.lang',
    '/absolute.lang',
    'a/../../escape.lang',
    'a\\evil.lang',
    'C:evil.lang',
    'a//b.lang',
    'a/./b.lang',
  ])('rejects unsafe archive path %s', (path) => {
    expect(() =>
      importProject(
        zipSync({
          'langlab.json': manifest,
          'main.lang': strToU8('print(1).'),
          [path]: strToU8('bad'),
        }),
      ),
    ).toThrow();
  });
  it('rejects corrupt checksums, truncation, duplicate case-folded names, unsupported manifests and missing entry', () => {
    const bytes = zipSync(
      { 'langlab.json': manifest, 'main.lang': strToU8('print(1).') },
      { level: 0 },
    );
    const corrupt = bytes.slice();
    corrupt[30 + 'langlab.json'.length] ^= 1;
    expect(() => importProject(corrupt)).toThrow(/checksum/);
    expect(() => importProject(bytes.slice(0, -1))).toThrow();
    expect(() =>
      importProject(
        zipSync({
          'langlab.json': manifest,
          'main.lang': strToU8(''),
          'MAIN.lang': strToU8(''),
        }),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      importProject(
        zipSync({ 'langlab.json': strToU8('{"schemaVersion":999}') }),
      ),
    ).toThrow(/manifest/);
    expect(() => importProject(zipSync({ 'langlab.json': manifest }))).toThrow(
      /Missing/,
    );
  });
  it('rejects expanded size bombs and forged sizes before importing anything', () => {
    expect(() =>
      readArchive(zipSync({ 'bomb.txt': new Uint8Array(1_000_001) })),
    ).toThrow(/size limits/);
    const bytes = zipSync({ 'bomb.txt': new Uint8Array(10000) });
    const v = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 46; i++)
      if (v.getUint32(i, true) === 0x02014b50) {
        v.setUint32(i + 24, 10, true);
        break;
      }
    expect(() => readArchive(bytes)).toThrow(/declared size/);
  });
  it('rejects symlinks and encrypted entries', () => {
    for (const mode of ['symlink', 'encrypted']) {
      const bytes = zipSync({ 'main.lang': strToU8('print(1).') });
      const v = new DataView(bytes.buffer);
      for (let i = 0; i < bytes.length - 46; i++)
        if (v.getUint32(i, true) === 0x02014b50) {
          if (mode === 'symlink') v.setUint32(i + 38, 0xa0000000, true);
          else v.setUint16(i + 8, 1, true);
          break;
        }
      expect(() => readArchive(bytes)).toThrow(/unsafe/);
    }
  });
  it('validates VFS limits, duplicates and file/directory conflicts', () => {
    const s = singleFileSnapshot('');
    expect(
      () =>
        new VirtualFileSystem({
          ...s,
          files: [
            ...s.files,
            { ...s.files[0], id: 'another', path: 'main.lang/nested.lang' },
          ],
        }),
    ).toThrow(/directory/);
    expect(
      () =>
        new VirtualFileSystem({
          ...s,
          files: [{ ...s.files[0], content: 'x'.repeat(1_000_001) }],
        }),
    ).toThrow(/limit/);
    expect(() => canonicalPath('a/../b')).toThrow();
    expect(resolveImport('lib/a.lang', '../b.lang')).toBe('b.lang');
  });
});
