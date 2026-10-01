import type { ProjectSnapshot } from '../../workspace/model';
import { VirtualFileSystem } from '../../workspace/vfs';

export function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** Explicit allowlist: ship source/assets and author configuration, never saved
 * app inputs, mutable runtime state, timestamps or editor preferences.
 * Preserve IDs because resource values may reference file identities.
 */
export function serializeProject(snapshot: ProjectSnapshot): string {
  const clean = new VirtualFileSystem(snapshot).snapshot;
  return JSON.stringify({
    format: 'language-lab-standalone',
    version: 1,
    project: {
      id: clean.project.id,
      name: clean.project.name,
      entry: clean.project.entry,
      schemaVersion: 1,
      createdAt: 0,
      updatedAt: 0,
    },
    files: clean.files.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      path: f.path,
      name: f.path.split('/').at(-1),
      kind: f.kind,
      content: f.content,
      bytes: f.bytes ? base64(f.bytes) : undefined,
      exportOverrides: f.exportOverrides,
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
    })),
  });
}

export function deserializeProject(json: string): ProjectSnapshot {
  // Allows JSON escaping overhead for the existing 10 MB VFS limit.
  if (json.length > 70_000_000)
    throw new Error('Standalone project is too large.');
  const data = JSON.parse(json);
  if (
    data.format !== 'language-lab-standalone' ||
    data.version !== 1 ||
    !Array.isArray(data.files)
  )
    throw new Error('Unsupported standalone project format.');
  const snapshot: ProjectSnapshot = {
    project: data.project,
    files: data.files.map((file: { bytes?: string }) => ({
      ...file,
      bytes:
        file.bytes === undefined
          ? undefined
          : Uint8Array.from(atob(file.bytes), (c) => c.charCodeAt(0)),
    })),
  };
  const vfs = new VirtualFileSystem(snapshot);
  vfs.source(snapshot.project.entry);
  return vfs.snapshot;
}
