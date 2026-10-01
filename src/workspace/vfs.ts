import { deepFreeze, type ProjectSnapshot, type ProjectFile } from './model';
export const LIMITS = { fileBytes: 1_000_000, projectBytes: 10_000_000, files: 200, pathLength: 240 };
export function canonicalPath(path: string): string {
  if (!path || path.length > LIMITS.pathLength || /[\\\x00-\x1f\x7f:]/.test(path) || path.startsWith('/') || path.endsWith('/')) throw new Error('Invalid project path: ' + path);
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.trim() !== p)) throw new Error('Unsafe project path: ' + path);
  return path;
}
export function resolveImport(from: string, specifier: string): string {
  if (!/^\.\.?\//.test(specifier) || !specifier.endsWith('.lang') || /[\\\x00-\x1f:?#]/.test(specifier)) throw new Error('Imports require explicit relative .lang paths.');
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '.') continue;
    if (part === '..') { if (!parts.length) throw new Error('Import escapes the project.'); parts.pop(); }
    else { if (!part) throw new Error('Invalid import path.'); parts.push(part); }
  }
  return canonicalPath(parts.join('/'));
}
export class VirtualFileSystem {
  private paths = new Map<string, ProjectFile>();
  readonly snapshot: ProjectSnapshot;
  constructor(snapshot: ProjectSnapshot) {
    this.snapshot = deepFreeze(structuredClone(snapshot));
    if (snapshot.files.length > LIMITS.files) throw new Error('Project has too many files.');
    const ids = new Set<string>(); const folded = new Set<string>(); let bytes = 0;
    for (const file of this.snapshot.files) {
      const path = canonicalPath(file.path);
      if (ids.has(file.id) || folded.has(path.toLowerCase())) throw new Error('Duplicate file identity or path: ' + path);
      if (file.projectId !== snapshot.project.id) throw new Error('File belongs to another project.');
      const size = file.bytes?.byteLength ?? new TextEncoder().encode(file.content).length;
      if (size > LIMITS.fileBytes) throw new Error('File exceeds 1 MB limit: ' + path);
      bytes += size; ids.add(file.id); folded.add(path.toLowerCase()); this.paths.set(path, file);
    }
    if (bytes > LIMITS.projectBytes) throw new Error('Project exceeds 10 MB limit.');
    for (const path of this.paths.keys()) {
      const parts = path.split('/'); parts.pop();
      while (parts.length) {
        if (this.paths.get(parts.join('/'))?.kind === 'file') throw new Error('File cannot also be a directory.');
        parts.pop();
      }
    }
    canonicalPath(snapshot.project.entry);
  }
  get(path: string) { return this.paths.get(canonicalPath(path)); }
  source(path: string) {
    const file = this.get(path);
    if (!file || file.kind !== 'file' || file.bytes) throw new Error('Missing source module: ' + path);
    return file;
  }
}
