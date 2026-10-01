import type { ExportOverrides } from '../language/ast';
export interface Project { id: string; name: string; entry: string; schemaVersion: 1; createdAt: number; updatedAt: number }
export interface ProjectFile {
  id: string; projectId: string; path: string; name: string; kind: 'file' | 'folder';
  content: string; bytes?: Uint8Array; revision: number;
  exportOverrides?: ExportOverrides; inputOverrides?: ExportOverrides;
  createdAt: number; updatedAt: number;
}
export interface ProjectSnapshot { project: Project; files: ProjectFile[] }
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
export function singleFileSnapshot(source: string, id = 'main.lang'): ProjectSnapshot {
  return { project: { id: 'single', name: 'Program', entry: 'main.lang', schemaVersion: 1, createdAt: 0, updatedAt: 0 },
    files: [{ id, projectId: 'single', path: 'main.lang', name: 'main.lang', kind: 'file', content: source, revision: 0, createdAt: 0, updatedAt: 0 }] };
}
