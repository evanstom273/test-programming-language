import Dexie, { type EntityTable } from 'dexie';

export interface CodeFile {
  id: string;
  name: string;
  content: string;
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
  'text name = "Lyra".',
  'integer health = 100.',
  'integer damage = 25.',
  'array inventory = ["sword", "potion", "key"].',
  '',
  'print("Hello", name).',
  'print("Inventory", inventory).',
  '',
  'health = health minus damage.',
  'print("Health remaining", health).',
  'print("First item", inventory[0]).'
].join('\n');

export async function ensureStarterFile(): Promise<CodeFile> {
  const existing = await db.files.orderBy('updatedAt').reverse().first();
  if (existing) return existing;

  const now = Date.now();
  const file: CodeFile = {
    id: crypto.randomUUID(),
    name: 'main.lang',
    content: starterCode,
    createdAt: now,
    updatedAt: now
  };

  await db.files.add(file);
  return file;
}
