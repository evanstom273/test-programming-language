import Dexie, { type EntityTable } from 'dexie';
import type { ExportOverrides } from './language/runtime';

export interface CodeFile {
  id: string;
  name: string;
  content: string;
  exportOverrides?: ExportOverrides;
  createdAt: number;
  updatedAt: number;
}

class LanguageLabDatabase extends Dexie {
  files!: EntityTable<CodeFile, 'id'>;

  constructor() {
    super('language-lab');
    this.version(1).stores({
      files: 'id, name, createdAt, updatedAt'
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

function migrateLegacyColonSyntax(content: string): string {
  return content.replace(
    /^(\s*)(export\s+)?(integer|text|boolean|array)\s+([A-Za-z][A-Za-z0-9]*)\s*=/gim,
    '$1$2$3: $4 ='
  );
}

export async function ensureStarterFile(): Promise<CodeFile> {
  let stored = await db.files.orderBy('updatedAt').reverse().toArray();

  if (!stored.length) {
    const now = Date.now();
    const main: CodeFile = {
      id: crypto.randomUUID(),
      name: 'main.lang',
      content: starterCode,
      exportOverrides: {},
      createdAt: now,
      updatedAt: now
    };
    await db.files.add(main);
    stored = [main];
  }

  for (const file of stored) {
    const migrated = migrateLegacyColonSyntax(file.content);
    if (migrated !== file.content) {
      file.content = migrated;
      file.updatedAt = Date.now();
      await db.files.update(file.id, { content: migrated, updatedAt: file.updatedAt });
    }
  }

  const calculator = await db.files.where('name').equals('calculator.lang').first();
  if (!calculator) {
    const now = Date.now();
    await db.files.add({
      id: crypto.randomUUID(),
      name: 'calculator.lang',
      content: calculatorCode,
      exportOverrides: {},
      createdAt: now,
      updatedAt: now
    });
  }

  return stored[0];
}
