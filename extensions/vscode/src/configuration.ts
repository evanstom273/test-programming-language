import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ExportOverrides, Value } from '../../../src/language/ast';
import { inside } from './project';

/** VS Code file/folder rename events preserve author settings and resource IDs. */
export function renameConfiguration(
  settings: Record<string, ExportOverrides>,
  renames: { from: string; to: string }[],
): Record<string, ExportOverrides> {
  const paths = [...renames].sort((a, b) => b.from.length - a.from.length);
  const path = (old: string) => {
    const change = paths.find((r) => inside(r.from, old));
    return change ? resolve(change.to, relative(change.from, old)) : old;
  };
  const id = (old: string) => {
    try {
      return pathToFileURL(path(fileURLToPath(old))).href;
    } catch {
      return old;
    }
  };
  function value(v: Value): Value {
    if (Array.isArray(v)) return v.map(value);
    if (!v || typeof v !== 'object') return v;
    const copy = Object.fromEntries(
      Object.entries(v).map(([k, v]) => [k, value(v)]),
    );
    if (copy.$type === 'resource' && typeof copy.id === 'string') {
      const old = copy.id;
      copy.id = id(old);
      if (typeof copy.path === 'string' && copy.id !== old) {
        const root = resolve(
          fileURLToPath(old),
          ...copy.path.split('/').map(() => '..'),
        );
        copy.path = relative(path(root), fileURLToPath(copy.id))
          .split(sep)
          .join('/');
      }
    }
    return copy;
  }
  return Object.fromEntries(
    Object.entries(settings).map(([uri, fields]) => [
      id(uri),
      value(fields) as ExportOverrides,
    ]),
  );
}
