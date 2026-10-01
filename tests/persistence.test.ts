import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db, ensureStarterFile, saveOverride } from '../src/db';

// Unindexed object properties need no Dexie schema/index migration.
afterEach(async () => { await db.delete(); });

describe('local input persistence', () => {
  it('preserves source and exports across input writes, rapid edits and reopening', async () => {
    await db.open();
    const file = await ensureStarterFile();
    await saveOverride(file.id, 'exportOverrides', 'title', 'My title');
    await Promise.all([
      saveOverride(file.id, 'inputOverrides', 'numberOne', 42),
      saveOverride(file.id, 'inputOverrides', 'numberTwo', 7),
      saveOverride(file.id, 'inputOverrides', 'operation', 'multiply')
    ]);
    db.close();
    await db.open();
    const stored = await db.files.get(file.id);
    expect(stored?.content).toBe(file.content);
    expect(stored?.exportOverrides).toEqual({ title: 'My title' });
    expect(stored?.inputOverrides).toEqual({ numberOne: 42, numberTwo: 7, operation: 'multiply' });
    await saveOverride(file.id, 'inputOverrides', 'numberOne', undefined);
    expect((await db.files.get(file.id))?.inputOverrides).toEqual({ numberTwo: 7, operation: 'multiply' });
  });

  it('seeds once under concurrent startup and preserves an existing calculator', async () => {
    await db.open();
    await Promise.all([ensureStarterFile(), ensureStarterFile()]);
    expect(await db.files.count()).toBe(3);
    const old = await db.files.where('name').equals('calculator.lang').first();
    await db.files.update(old!.id, { content: 'print("custom").' });
    await ensureStarterFile();
    expect((await db.files.get(old!.id))?.content).toBe('print("custom").');
    const example = await db.files.where('name').equals('interactive-calculator.lang').first();
    expect(example?.content).toContain('export text: title');
    expect(example?.content).toContain('input Operation: operation');
    expect(example?.content).toContain('button "Calculate"');
  });
});
