import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, basename, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  ProjectSnapshot,
  ProjectFile,
} from '../../../src/workspace/model';
import { LIMITS, VirtualFileSystem } from '../../../src/workspace/vfs';
import { validateApplicationSettings } from '../../../src/workspace/application';

const ignored = new Set([
  '.git',
  'node_modules',
  '.vscode',
  'dist',
  '.langlab-cli',
  '.vscode-test',
  'test-results',
]);
export const inside = (root: string, path: string) =>
  path === root || path.startsWith(root + sep);

/** Disk is only a host input: evaluation receives this bounded immutable snapshot.
 * Open editor buffers take precedence, including new files not yet saved.
 */
export async function loadProject(
  file: string,
  roots: string[],
  buffers = new Map<string, string>(),
): Promise<ProjectSnapshot> {
  file = resolve(file);
  const workspace = roots
    .filter((root) => inside(root, file))
    .sort((a, b) => b.length - a.length)[0];
  let root = dirname(file),
    manifest:
      | {
          name: string;
          entry: string;
          schemaVersion: number;
          application?: unknown;
        }
      | undefined;
  if (workspace) {
    for (let dir = root; inside(workspace, dir); dir = dirname(dir)) {
      if (!inside(await realpath(workspace), await realpath(dir)))
        throw new Error('Project directory escapes workspace through a link.');
      try {
        const path = resolve(dir, 'langlab.json');
        const info = await lstat(path);
        if (info.isSymbolicLink() || !info.isFile() || info.size > 100_000)
          throw new Error('Invalid langlab.json.');
        manifest = JSON.parse(
          buffers.get(path) ?? (await readFile(path, 'utf8')),
        );
        root = dir;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (dir === workspace) break;
    }
  }
  if (
    manifest &&
    (manifest.schemaVersion !== 1 ||
      typeof manifest.name !== 'string' ||
      !manifest.name.trim() ||
      manifest.name.length > 120 ||
      typeof manifest.entry !== 'string')
  )
    throw new Error(
      'Invalid langlab.json: expected schemaVersion 1, name and entry.',
    );
  const application = validateApplicationSettings(manifest?.application);
  const projectId = pathToFileURL(manifest ? root : file).href;
  const files: ProjectFile[] = [];
  let total = 0,
    directories = 0;
  async function add(path: string) {
    if (files.length >= LIMITS.files)
      throw new Error('Project has too many files.');
    const info = await lstat(path).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT' || !buffers.has(path)) throw e;
      return null;
    });
    if (info?.isSymbolicLink() || (info && !info.isFile()))
      throw new Error(
        'Project files must be regular files, not links: ' + path,
      );
    if (info && info.size > LIMITS.fileBytes)
      throw new Error('File exceeds 1 MB: ' + path);
    if (info && !inside(await realpath(root), await realpath(path)))
      throw new Error('File escapes project.');
    const text = /\.(lang|json|txt|md|csv)$/i.test(path);
    const data = buffers.has(path)
      ? new TextEncoder().encode(buffers.get(path)!)
      : new Uint8Array(await readFile(path));
    total += data.byteLength;
    if (data.byteLength > LIMITS.fileBytes || total > LIMITS.projectBytes)
      throw new Error('Project exceeds file or total size limit.');
    const name = relative(root, path).split(sep).join('/');
    files.push({
      id: pathToFileURL(path).href,
      projectId,
      name: basename(path),
      path: name,
      kind: 'file',
      content: text
        ? new TextDecoder('utf-8', { fatal: true }).decode(data)
        : '',
      bytes: text ? undefined : data,
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
    });
  }
  async function walk(dir: string) {
    if (++directories > 500)
      throw new Error('Project has too many directories.');
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        entry.name.startsWith('.') ||
        ignored.has(entry.name) ||
        entry.name === 'langlab.json'
      )
        continue;
      const path = resolve(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error('Project links are not supported: ' + path);
      if (entry.isDirectory()) await walk(path);
      else await add(path);
    }
  }
  if (manifest) {
    await walk(root);
    for (const path of buffers.keys())
      if (
        inside(root, path) &&
        !relative(root, path)
          .split(sep)
          .some((p) => ignored.has(p)) &&
        path !== resolve(root, 'langlab.json') &&
        !files.some((f) => f.id === pathToFileURL(path).href)
      )
        await add(path);
  } else await add(file);
  const snapshot: ProjectSnapshot = {
    project: {
      id: projectId,
      name: manifest?.name ?? basename(file, '.lang'),
      entry: manifest?.entry ?? basename(file),
      schemaVersion: 1,
      application,
      createdAt: 0,
      updatedAt: 0,
    },
    files,
  };
  return new VirtualFileSystem(snapshot).snapshot;
}
