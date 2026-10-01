import type { ProjectSnapshot } from '../workspace/model';
import { canonicalPath, LIMITS, VirtualFileSystem } from '../workspace/vfs';

export const LANG_MIME = 'text/x-language-lab';
export const LANG_ACCEPT = '.lang,text/x-language-lab,text/plain';

/** Device names are basenames, never paths granting access to neighboring files. */
export function sourceFileName(name: string): string {
  if (name.includes('/') || name.includes('\\') || !/\.lang$/i.test(name))
    throw new Error('Choose a file with a .lang extension.');
  return canonicalPath(name.slice(0, -5) + '.lang');
}
export function temporarySourceProject(
  name: string,
  source: string,
): ProjectSnapshot {
  const path = sourceFileName(name);
  const now = Date.now();
  const projectId = crypto.randomUUID();
  const snapshot: ProjectSnapshot = {
    project: {
      id: projectId,
      name: path.slice(0, -5).slice(0, 120) || 'Program',
      entry: path,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
    files: [
      {
        id: crypto.randomUUID(),
        projectId,
        name: path,
        path,
        kind: 'file',
        content: source,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
  return new VirtualFileSystem(snapshot).snapshot;
}
export function decodeSourceFile(bytes: Uint8Array): string {
  if (bytes.byteLength > LIMITS.fileBytes)
    throw new Error('Source exceeds the 1 MB file limit.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The .lang file must contain UTF-8 text.');
  }
}
export async function openSourceFile(file: File): Promise<ProjectSnapshot> {
  sourceFileName(file.name);
  if (file.size > LIMITS.fileBytes)
    throw new Error('Source exceeds the 1 MB file limit.');
  return temporarySourceProject(
    file.name,
    decodeSourceFile(new Uint8Array(await file.arrayBuffer())),
  );
}
