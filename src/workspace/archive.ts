import { Inflate, strToU8, zipSync } from 'fflate';
import { canonicalPath, LIMITS, VirtualFileSystem } from './vfs';
import type { ProjectFile, ProjectSnapshot } from './model';

const decoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate central AND local records before bounded, incremental decompression.
 * ZIP64, symlinks, encryption, multi-disk and unsupported methods are rejected.
 */
export function readArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length > LIMITS.projectBytes + 200_000 || bytes.length < 22)
    throw new Error('Invalid or oversized ZIP.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number) => view.getUint16(p, true);
  const u32 = (p: number) => view.getUint32(p, true);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === bytes.length) {
      end = p;
      break;
    }
  if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10))
    throw new Error('Invalid or multi-disk ZIP.');
  const count = u16(end + 10);
  const centralSize = u32(end + 12);
  let cursor = u32(end + 16);
  const centralStart = cursor;
  if (count > LIMITS.files + 1 || cursor + centralSize !== end)
    throw new Error('Invalid ZIP directory or too many entries.');
  const names = new Set<string>();
  const result = new Map<string, Uint8Array>();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50)
      throw new Error('Corrupt ZIP directory.');
    const flags = u16(cursor + 8),
      method = u16(cursor + 10),
      crc = u32(cursor + 16),
      compressed = u32(cursor + 20),
      size = u32(cursor + 24);
    const length = u16(cursor + 28),
      extra = u16(cursor + 30),
      comment = u16(cursor + 32),
      offset = u32(cursor + 42);
    const mode = u32(cursor + 38) >>> 16;
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      (mode & 0xf000) === 0xa000 ||
      u16(cursor + 34)
    )
      throw new Error('Unsupported or unsafe ZIP entry.');
    if (cursor + 46 + length + extra + comment > end)
      throw new Error('Corrupt ZIP filename.');
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + length),
    );
    const path = canonicalPath(name.endsWith('/') ? name.slice(0, -1) : name);
    if (names.has(path.toLowerCase()))
      throw new Error('Duplicate archive path: ' + path);
    names.add(path.toLowerCase());
    total += size;
    if (size > LIMITS.fileBytes || total > LIMITS.projectBytes)
      throw new Error('Archive exceeds expanded size limits.');
    if (
      offset + 30 > centralStart ||
      u32(offset) !== 0x04034b50 ||
      u16(offset + 6) !== flags ||
      u16(offset + 8) !== method
    )
      throw new Error('Corrupt ZIP local header.');
    const localLength = u16(offset + 26),
      localExtra = u16(offset + 28);
    const start = offset + 30 + localLength + localExtra;
    if (
      start + compressed > centralStart ||
      decoder.decode(bytes.subarray(offset + 30, offset + 30 + localLength)) !==
        name
    )
      throw new Error('Mismatched ZIP entry.');
    let output: Uint8Array;
    if (method === 0) {
      if (compressed !== size) throw new Error('Incorrect stored ZIP size.');
      output = bytes.slice(start, start + compressed);
    } else {
      const chunks: Uint8Array[] = [];
      let actual = 0;
      const inflate = new Inflate((chunk) => {
        actual += chunk.length;
        if (actual > size || actual > LIMITS.fileBytes)
          throw new Error('Decompression exceeds declared size.');
        chunks.push(chunk);
      });
      if (!compressed) throw new Error('Corrupt compressed entry.');
      for (let p = 0; p < compressed; p += 128)
        inflate.push(
          bytes.subarray(start + p, start + Math.min(p + 128, compressed)),
          p + 128 >= compressed,
        );
      if (actual !== size) throw new Error('Incorrect expanded ZIP size.');
      output = new Uint8Array(actual);
      let p = 0;
      for (const chunk of chunks) {
        output.set(chunk, p);
        p += chunk.length;
      }
    }
    if (crc32(output) !== crc) throw new Error('Corrupt ZIP checksum.');
    if (name.endsWith('/') && size !== 0)
      throw new Error('Directory contains unexpected data.');
    result.set(name, output);
    cursor += 46 + length + extra + comment;
  }
  if (cursor !== end) throw new Error('Invalid ZIP directory length.');
  return result;
}

export function exportProject(snapshot: ProjectSnapshot): Uint8Array {
  new VirtualFileSystem(snapshot).source(snapshot.project.entry);
  const files: Record<string, Uint8Array> = Object.create(null);
  files['langlab.json'] = strToU8(
    JSON.stringify(
      {
        schemaVersion: 1,
        name: snapshot.project.name,
        entry: snapshot.project.entry,
        files: snapshot.files.map((f) => ({
          path: f.path,
          kind: f.kind,
          encoding: f.bytes ? 'binary' : 'text',
        })),
      },
      null,
      2,
    ),
  );
  for (const f of snapshot.files) {
    if (f.path === 'langlab.json')
      throw new Error('Reserved project metadata path.');
    files[f.path + (f.kind === 'folder' ? '/' : '')] =
      f.kind === 'folder' ? new Uint8Array() : (f.bytes ?? strToU8(f.content));
  }
  return zipSync(files, { level: 6 });
}
export function importProject(bytes: Uint8Array): ProjectSnapshot {
  const entries = readArchive(bytes);
  const manifest = entries.get('langlab.json');
  if (!manifest)
    throw new Error('Project ZIP requires langlab.json at its root.');
  const m = JSON.parse(decoder.decode(manifest));
  if (
    m.schemaVersion !== 1 ||
    typeof m.name !== 'string' ||
    !m.name.trim() ||
    m.name.length > 120 ||
    typeof m.entry !== 'string' ||
    !m.entry.endsWith('.lang')
  )
    throw new Error('Unsupported or invalid project manifest.');
  canonicalPath(m.entry);
  const id = crypto.randomUUID();
  const now = Date.now();
  const files: ProjectFile[] = [];
  const encodings = new Map<string, string>();
  if (m.files !== undefined) {
    if (!Array.isArray(m.files) || m.files.length > LIMITS.files)
      throw new Error('Invalid file manifest.');
    for (const f of m.files) {
      if (
        !f ||
        typeof f.path !== 'string' ||
        !['file', 'folder'].includes(f.kind) ||
        !['text', 'binary'].includes(f.encoding)
      )
        throw new Error('Invalid file manifest entry.');
      canonicalPath(f.path);
      if (encodings.has(f.path))
        throw new Error('Duplicate file manifest entry.');
      if (!entries.has(f.path + (f.kind === 'folder' ? '/' : '')))
        throw new Error('Manifest file missing: ' + f.path);
      encodings.set(f.path, f.encoding);
    }
  }
  for (const [name, data] of entries) {
    if (name === 'langlab.json') continue;
    const kind = name.endsWith('/') ? 'folder' : 'file';
    const path = kind === 'folder' ? name.slice(0, -1) : name;
    const binary =
      kind === 'file' &&
      (encodings.get(path) === 'binary' ||
        (!encodings.has(path) && !/\.(lang|txt|json|md|csv)$/i.test(path)));
    files.push({
      id: crypto.randomUUID(),
      projectId: id,
      name: path.split('/').pop()!,
      path,
      kind,
      content: kind === 'folder' || binary ? '' : decoder.decode(data),
      bytes: binary ? data : undefined,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  const snapshot: ProjectSnapshot = {
    project: {
      id,
      name: m.name,
      entry: m.entry,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
    files,
  };
  new VirtualFileSystem(snapshot).source(m.entry);
  return snapshot;
}
