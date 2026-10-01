import { db, type LanguageLabDatabase } from '../db';
import { deepFreeze, type Project, type ProjectFile, type ProjectSnapshot } from './model';
import { canonicalPath, LIMITS, VirtualFileSystem } from './vfs';
export class WorkspaceStore {
  constructor(readonly database: LanguageLabDatabase = db) {}
  async snapshot(id: string): Promise<ProjectSnapshot> {
    return this.database.transaction('r', this.database.projects, this.database.files, async () => {
      const project = await this.database.projects.get(id);
      if (!project) throw new Error('Project does not exist.');
      return new VirtualFileSystem({ project, files: await this.database.files.where('projectId').equals(id).toArray() }).snapshot;
    });
  }
  async createProject(name: string) {
    if (!name.trim() || name.length > 120) throw new Error('Project names need 1–120 characters.');
    const now = Date.now(); const project: Project = { id: crypto.randomUUID(), name: name.trim(), entry: 'main.lang', schemaVersion: 1, createdAt: now, updatedAt: now };
    const file: ProjectFile = { id: crypto.randomUUID(), projectId: project.id, path: 'main.lang', name: 'main.lang', kind: 'file', content: 'print("Hello from a new project.").', revision: 0, createdAt: now, updatedAt: now };
    await this.importSnapshot({ project, files: [file] }); return project;
  }
  async importSnapshot(snapshot: ProjectSnapshot) {
    new VirtualFileSystem(snapshot).source(snapshot.project.entry);
    await this.database.transaction('rw', this.database.projects, this.database.files, async () => {
      await this.database.projects.add(snapshot.project);
      await this.database.files.bulkAdd(snapshot.files);
    });
  }
  async addFile(projectId: string, path: string, content = '', kind: 'file' | 'folder' = 'file', bytes?: Uint8Array) {
    canonicalPath(path); if (path === 'langlab.json') throw new Error('langlab.json is managed project metadata.');
    const now = Date.now(); const file: ProjectFile = { id: crypto.randomUUID(), projectId, path, name: path.split('/').pop()!, kind, content, bytes, revision: 0, createdAt: now, updatedAt: now };
    await this.database.transaction('rw', this.database.projects, this.database.files, async () => {
      const snapshot = await this.snapshot(projectId);
      new VirtualFileSystem({ ...snapshot, files: [...snapshot.files, file] });
      await this.database.files.add(file);
    }); return file;
  }
  async saveSource(id: string, content: string) {
    if (new TextEncoder().encode(content).length > LIMITS.fileBytes) throw new Error('Source exceeds 1 MB limit.');
    await this.database.transaction('rw', this.database.files, async () => {
      const file = await this.database.files.get(id); if (!file) throw new Error('File was deleted.');
      await this.database.files.update(id, { content, revision: file.revision + 1, updatedAt: Date.now() });
    });
  }
  async renameProject(id: string, name: string) {
    if (!name.trim() || name.length > 120) throw new Error('Project names need 1–120 characters.');
    await this.database.projects.update(id, { name: name.trim(), updatedAt: Date.now() });
  }
  async setEntry(projectId: string, path: string) {
    await this.database.transaction('rw', this.database.projects, this.database.files, async () => {
      const snapshot = await this.snapshot(projectId);
      if (!path.endsWith('.lang')) throw new Error('Entry must be a .lang file.');
      new VirtualFileSystem(snapshot).source(path);
      await this.database.projects.update(projectId, { entry: path, updatedAt: Date.now() });
    });
  }
  async move(id: string, newPath: string) {
    canonicalPath(newPath); if (newPath === 'langlab.json') throw new Error('Reserved project metadata path.');
    await this.database.transaction('rw', this.database.projects, this.database.files, async () => {
      const file = await this.database.files.get(id); if (!file) throw new Error('File does not exist.');
      if (file.kind === 'folder' && newPath.startsWith(file.path + '/')) throw new Error('Cannot move a folder into itself.');
      const snapshot = await this.snapshot(file.projectId);
      const moved = snapshot.files.map(f => f.id === id || (file.kind === 'folder' && f.path.startsWith(file.path + '/'))
        ? { ...f, path: newPath + f.path.slice(file.path.length), name: f.id === id ? newPath.split('/').pop()! : f.name, updatedAt: Date.now() } : f);
      let entry = snapshot.project.entry;
      if (entry === file.path || (file.kind === 'folder' && entry.startsWith(file.path + '/'))) entry = newPath + entry.slice(file.path.length);
      new VirtualFileSystem({ project: { ...snapshot.project, entry }, files: moved });
      // Delete/re-add only within the atomic transaction to avoid unique path swap conflicts.
      await this.database.files.where('projectId').equals(file.projectId).delete();
      await this.database.files.bulkAdd(moved);
      await this.database.projects.update(file.projectId, { entry, updatedAt: Date.now() });
    });
  }
  async duplicate(id: string, path: string) {
    const file = await this.database.files.get(id); if (!file) throw new Error('File does not exist.');
    const snapshot = await this.snapshot(file.projectId);
    const copies = snapshot.files.filter(f => f.id === id || (file.kind === 'folder' && f.path.startsWith(file.path + '/'))).map(f => ({ ...structuredClone(f), id: crypto.randomUUID(), path: path + f.path.slice(file.path.length), name: f.id === id ? path.split('/').pop()! : f.name }));
    await this.database.transaction('rw', this.database.projects, this.database.files, async () => {
      const latest = await this.snapshot(file.projectId); new VirtualFileSystem({ ...latest, files: [...latest.files, ...copies] }); await this.database.files.bulkAdd(copies);
    }); return copies[0];
  }
  async deleteFile(id: string) {
    await this.database.transaction('rw', this.database.projects, this.database.files, async () => {
      const file = await this.database.files.get(id); if (!file) return;
      const snapshot = await this.snapshot(file.projectId);
      if (snapshot.project.entry === file.path || (file.kind === 'folder' && snapshot.project.entry.startsWith(file.path + '/'))) throw new Error('Choose another entry point before deleting the entry file.');
      const ids = snapshot.files.filter(f => f.id === id || (file.kind === 'folder' && f.path.startsWith(file.path + '/'))).map(f => f.id);
      await this.database.files.bulkDelete(ids);
    });
  }
  async deleteProject(id: string) {
    await this.database.transaction('rw', this.database.projects, this.database.files, async () => {
      await this.database.files.where('projectId').equals(id).delete(); await this.database.projects.delete(id);
    });
  }
  async duplicateProject(id: string) {
    const snapshot = structuredClone(await this.snapshot(id)); const projectId = crypto.randomUUID();
    snapshot.project = { ...snapshot.project, id: projectId, name: snapshot.project.name + ' copy' };
    snapshot.files = snapshot.files.map(f => ({ ...f, id: crypto.randomUUID(), projectId }));
    await this.importSnapshot(snapshot); return snapshot.project;
  }
}
export const workspace = new WorkspaceStore();
export function snapshotWithDrafts(snapshot: ProjectSnapshot, drafts: Map<string, string>) {
  return deepFreeze({ project: { ...snapshot.project }, files: snapshot.files.map(f => ({ ...f, content: drafts.get(f.id) ?? f.content })) });
}
