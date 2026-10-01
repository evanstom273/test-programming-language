import Dexie, { type EntityTable } from 'dexie';
import interactiveCalculatorCode from '../examples/interactive-calculator.lang?raw';
import type { ExportValue, ExportOverrides } from './language/runtime';

import type { Project, ProjectFile } from './workspace/model';
export type CodeFile = ProjectFile;
export interface StoredRecord { id: string; value: unknown }
export class LanguageLabDatabase extends Dexie {
  files!: EntityTable<CodeFile, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  legacyBackup!: EntityTable<StoredRecord, 'id'>;
  appData!: EntityTable<StoredRecord, 'id'>;
  preferences!: EntityTable<StoredRecord, 'id'>;
  metadata!: EntityTable<StoredRecord, 'id'>;
  constructor(name = 'language-lab') {
    super(name);
    this.version(1).stores({ files: 'id, name, createdAt, updatedAt' });
    this.version(2).stores({
      files: 'id, projectId, &[projectId+path], name, createdAt, updatedAt',
      projects: 'id, name, createdAt', legacyBackup: 'id', appData: 'id', preferences: 'id', metadata: 'id'
    }).upgrade(async tx => {
      const files = await tx.table('files').toArray();
      for (const old of files) {
        await tx.table('legacyBackup').put({ id: old.id, value: structuredClone(old) });
        const projectId = 'legacy-' + old.id;
        // Legacy filenames were unrestricted. Keep their display name and exact source;
        // choose a safe execution path without changing their stable identity.
        const path = /^[A-Za-z0-9][A-Za-z0-9._-]*\.lang$/.test(old.name) ? old.name : 'main.lang';
        await tx.table('projects').add({ id: projectId, name: old.name, entry: path, schemaVersion: 1, createdAt: old.createdAt, updatedAt: old.updatedAt });
        await tx.table('files').put({ ...old, projectId, path, kind: 'file', revision: 0 });
      }
      await tx.table('metadata').put({ id: 'initialized', value: true });
    });
  }
}
export const db = new LanguageLabDatabase();

export const starterCode = [
  'text: name = "Lyra".',
  'integer: health = 100.',
  'integer: damage = 25.',
  'array: inventory = ["sword", "potion", "key"].',
  '',
  'print("Hello", name).',
  'print("Inventory", inventory).',
  '',
  'health = health minus damage.',
  'print("Health remaining", health).',
  'print("First item", inventory[0]).',
  '',
  'for each item in inventory, do.',
  '    print("Item", item).',
  'end for.'
].join('\n');

export const calculatorCode = [
  'enum Operation [add, subtract, multiply, divide].',
  '',
  'export integer: numberOne = 10.',
  'export integer: numberTwo = 5.',
  'export Operation: operation = add.',
  '',
  'function calculate().',
  '    if operation is add, do.',
  '        return numberOne plus numberTwo.',
  '    elif operation is subtract, do.',
  '        return numberOne - numberTwo.',
  '    elif operation is multiply, do.',
  '        return numberOne * numberTwo.',
  '    elif operation is divide, do.',
  '        return numberOne / numberTwo.',
  '    else, do.',
  '        return 0.',
  '    end if.',
  'end function.',
  '',
  'print(calculate()).'
].join('\n');

// Serialized, once-only seeding. No source rewriting or deleted-example resurrection.
export async function ensureStarterFile(): Promise<CodeFile | undefined> {
  return db.transaction('rw', db.files, db.projects, db.metadata, async () => {
    if (!await db.metadata.get('initialized')) {
      if (!await db.projects.count()) {
        for (const [name, content] of [['main.lang', starterCode], ['calculator.lang', calculatorCode], ['interactive-calculator.lang', interactiveCalculatorCode]]) {
          const now = Date.now(); const projectId = crypto.randomUUID();
          await db.projects.add({ id: projectId, name, entry: name, schemaVersion: 1, createdAt: now, updatedAt: now });
          await db.files.add({ id: crypto.randomUUID(), projectId, path: name, name, kind: 'file', content, revision: 0, exportOverrides: {}, inputOverrides: {}, createdAt: now, updatedAt: now });
        }
      }
      await db.metadata.put({ id: 'initialized', value: true });
    }
    const files = await db.files.orderBy('createdAt').toArray();
    // Millisecond timestamps can tie during seeding; UUID ordering must not
    // choose an arbitrary example as the initial entry.
    return files.find(file => file.path === 'main.lang') ?? files[0];
  });
}

export type OverrideKind = 'exportOverrides' | 'inputOverrides';

export function withOverride(overrides: ExportOverrides = {}, name: string, value: ExportValue | undefined): ExportOverrides {
  const next = { ...overrides };
  if (value === undefined) delete next[name];
  else Object.defineProperty(next, name, { value, enumerable: true, configurable: true, writable: true });
  return next;
}

/** Read/modify/write atomically so rapid edits to different controls cannot race. */
export async function saveOverride(id: string, kind: OverrideKind, name: string, value: ExportValue | undefined): Promise<void> {
  await db.files.where('id').equals(id).modify((file) => {
    file[kind] = withOverride(file[kind], name, value);
  });
}
