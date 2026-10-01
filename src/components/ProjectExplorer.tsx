import { LANG_MIME, sourceFileName } from '../runner/sourceFile';
import { useRef, useState } from 'react';
import { X, FileCode2, Folder } from 'lucide-react';
import type { WorkspaceView } from '../hooks/useWorkspace';
import { workspace } from '../workspace/store';
import { exportProject, importProject } from '../workspace/archive';
import { LIMITS } from '../workspace/vfs';

function download(
  name: string,
  bytes: Uint8Array,
  type = 'application/octet-stream',
) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], { type }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const actionClass =
  'min-h-11 rounded border border-[#30363d] px-2 text-xs text-[#b1bac4] hover:bg-[#21262d] disabled:opacity-50';
export function ProjectExplorer({
  view,
  close,
  onOpenRunner,
}: {
  view: WorkspaceView;
  close?: () => void;
  onOpenRunner: () => void;
}) {
  const [filter, setFilter] = useState('');
  const importFile = useRef<HTMLInputElement>(null);
  const importZip = useRef<HTMLInputElement>(null);
  const { project, activeFile } = view;
  const act = (fn: () => Promise<void>) => void view.perform(fn);
  function pathPrompt(label: string, initial = '') {
    const path = window.prompt(label, initial);
    return path?.trim() || null;
  }
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[#21262d] bg-[#0d1117]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#21262d] px-3">
        <span className="text-xs uppercase text-[#8b949e]">Explorer</span>
        {close && (
          <button
            aria-label="Close explorer"
            onClick={close}
            className="h-11 w-11"
          >
            <X size={17} />
          </button>
        )}
      </div>
      <div className="ide-scrollbar min-h-0 flex-1 overflow-y-auto p-2 space-y-3">
        <button className={actionClass + ' w-full'} onClick={onOpenRunner}>
          Open / Run .lang File
        </button>
        <label className="block text-xs text-[#8b949e]">
          Project
          <select
            disabled={view.busy}
            aria-label="Project"
            value={project?.id ?? ''}
            onChange={(e) => view.selectProject(e.target.value)}
            className="mt-1 min-h-11 w-full min-w-0 rounded border border-[#30363d] bg-[#0d1117] px-2"
          >
            {!project && <option value="">No projects</option>}
            {view.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1">
          <button
            disabled={view.busy}
            className={actionClass}
            onClick={() => {
              const name = pathPrompt('Project name', 'My Project');
              if (name)
                act(async () => {
                  const p = await workspace.createProject(name);
                  view.selectProject(p.id);
                });
            }}
          >
            New project
          </button>
          <button
            disabled={view.busy}
            className={actionClass}
            onClick={() => importZip.current?.click()}
          >
            Import ZIP
          </button>
        </div>
        {project && (
          <>
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-xs text-[#8b949e]">
                Project actions
              </summary>
              <div className="grid grid-cols-2 gap-1">
                <button
                  disabled={view.busy}
                  className={actionClass}
                  onClick={() => {
                    const name = pathPrompt('Rename project', project.name);
                    if (name)
                      act(() => workspace.renameProject(project.id, name));
                  }}
                >
                  Rename project
                </button>
                <button
                  disabled={view.busy}
                  className={actionClass}
                  onClick={() =>
                    act(async () => {
                      const p = await workspace.duplicateProject(project.id);
                      view.selectProject(p.id);
                    })
                  }
                >
                  Duplicate project
                </button>
                <button
                  disabled={view.busy}
                  className={actionClass}
                  onClick={() =>
                    act(async () =>
                      download(
                        project.name + '.zip',
                        exportProject(view.snapshot!),
                        'application/zip',
                      ),
                    )
                  }
                >
                  Export ZIP
                </button>
                <button
                  disabled={view.busy}
                  className={actionClass + ' col-span-2'}
                  onClick={() => {
                    const snapshot = structuredClone(view.snapshot!);
                    act(async () => {
                      const { downloadStandalone } = await import(
                        '../build/standalone/download'
                      );
                      await downloadStandalone(snapshot);
                    });
                  }}
                >
                  Download standalone HTML
                </button>
                <button
                  disabled={view.busy}
                  className={actionClass}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Delete project "' +
                          project.name +
                          '" and its files? Export a ZIP first to keep a copy.',
                      )
                    )
                      act(() => workspace.deleteProject(project.id));
                  }}
                >
                  Delete project
                </button>
              </div>
            </details>
            <label className="block text-xs text-[#8b949e]">
              Entry point
              <select
                disabled={view.busy}
                aria-label="Entry point"
                className="mt-1 min-h-11 w-full min-w-0 rounded border border-[#30363d] bg-[#0d1117] px-2"
                value={project.entry}
                onChange={(e) => {
                  const path = e.target.value;
                  act(() => workspace.setEntry(project.id, path));
                }}
              >
                {view.projectFiles
                  .filter(
                    (f) =>
                      f.kind === 'file' && f.path.endsWith('.lang') && !f.bytes,
                  )
                  .map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-1">
              <button
                disabled={view.busy}
                className={actionClass}
                onClick={() => {
                  const path = pathPrompt(
                    'New source file path, e.g. lib/maths.lang',
                    'file' + (view.projectFiles.length + 1) + '.lang',
                  );
                  if (path)
                    act(async () => {
                      const f = await workspace.addFile(project.id, path);
                      view.setActiveId(f.id);
                    });
                }}
              >
                New file
              </button>
              <button
                disabled={view.busy}
                className={actionClass}
                onClick={() => {
                  const path = pathPrompt('Folder path', 'lib');
                  if (path)
                    act(async () => {
                      await workspace.addFile(project.id, path, '', 'folder');
                    });
                }}
              >
                New folder
              </button>
              <button
                disabled={view.busy}
                className={actionClass}
                onClick={() => importFile.current?.click()}
              >
                Import file
              </button>
            </div>
            <label className="block text-xs text-[#a8b8cd]">
              Find a file
              <input
                aria-label="Filter files"
                placeholder="File name or path…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="mt-1 min-h-11 w-full min-w-0 rounded border border-[#3b4a60] bg-[#0d1117] px-2 text-sm"
              />
            </label>
            <div className="space-y-1">
              {[...view.projectFiles]
                .filter((f) =>
                  f.path.toLowerCase().includes(filter.toLowerCase()),
                )
                .sort((a, b) => a.path.localeCompare(b.path))
                .map((f) => (
                  <button
                    key={f.id}
                    title={f.path}
                    onClick={() => {
                      view.setActiveId(f.id);
                      if (f.kind === 'file') close?.();
                    }}
                    className={
                      'flex min-h-11 w-full min-w-0 items-center gap-2 rounded px-2 text-left text-xs ' +
                      (f.id === activeFile?.id
                        ? 'bg-[#1f6feb24] text-white'
                        : 'text-[#b1bac4] hover:bg-[#161b22]')
                    }
                  >
                    {f.kind === 'folder' ? (
                      <Folder size={15} className="shrink-0" />
                    ) : (
                      <FileCode2 size={15} className="shrink-0" />
                    )}
                    <span className="truncate">{f.path}</span>
                  </button>
                ))}
            </div>
            {activeFile && (
              <details>
                <summary className="min-h-11 cursor-pointer py-3 text-xs text-[#8b949e]">
                  Selected file actions
                </summary>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    disabled={view.busy}
                    className={actionClass}
                    onClick={() => {
                      const path = pathPrompt(
                        'Rename / move to path (imports are not rewritten)',
                        activeFile.path,
                      );
                      if (path) act(() => workspace.move(activeFile.id, path));
                    }}
                  >
                    Rename / move
                  </button>
                  <button
                    disabled={view.busy}
                    className={actionClass}
                    onClick={() => {
                      const path = pathPrompt(
                        'Duplicate to path',
                        activeFile.path.replace(/(\.[^.]+)?$/, '-copy$1'),
                      );
                      if (path)
                        act(async () => {
                          const f = await workspace.duplicate(
                            activeFile.id,
                            path,
                          );
                          view.setActiveId(f.id);
                        });
                    }}
                  >
                    Duplicate
                  </button>
                  {activeFile.kind === 'file' && (
                    <button
                      disabled={view.busy}
                      className={actionClass}
                      onClick={() =>
                        download(
                          !activeFile.bytes && /\.lang$/i.test(activeFile.path)
                            ? sourceFileName(activeFile.path.split('/').at(-1)!)
                            : activeFile.name,
                          activeFile.bytes ??
                            new TextEncoder().encode(activeFile.content),
                          !activeFile.bytes && /\.lang$/i.test(activeFile.path)
                            ? LANG_MIME + ';charset=utf-8'
                            : 'application/octet-stream',
                        )
                      }
                    >
                      Download file
                    </button>
                  )}
                  <button
                    disabled={view.busy}
                    className={actionClass}
                    onClick={() => {
                      if (window.confirm('Delete ' + activeFile.path + '?'))
                        act(() => workspace.deleteFile(activeFile.id));
                    }}
                  >
                    Delete file
                  </button>
                </div>
              </details>
            )}
          </>
        )}
        <p className="text-[11px] leading-5 text-[#6e7681]">
          Projects, Inspector overrides, and program inputs are saved locally.
          ZIP exports contain source and assets, not personal control values.
        </p>
      </div>
      <input
        ref={importZip}
        aria-label="Import project archive"
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f)
            act(async () => {
              if (f.size > LIMITS.projectBytes + 200_000)
                throw new Error('ZIP exceeds size limit.');
              const snapshot = importProject(
                new Uint8Array(await f.arrayBuffer()),
              );
              await workspace.importSnapshot(snapshot);
              view.selectProject(snapshot.project.id);
            });
        }}
      />
      <input
        ref={importFile}
        aria-label="Import source file"
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f && project) {
            const path = pathPrompt('Import file to path', f.name);
            if (path)
              act(async () => {
                if (f.size > LIMITS.fileBytes)
                  throw new Error('File exceeds 1 MB limit.');
                const bytes = new Uint8Array(await f.arrayBuffer());
                const text = /\.(lang|txt|json|md|csv)$/i.test(path);
                const file = await workspace.addFile(
                  project.id,
                  path,
                  text
                    ? new TextDecoder('utf-8', { fatal: true }).decode(bytes)
                    : '',
                  'file',
                  text ? undefined : bytes,
                );
                view.setActiveId(file.id);
              });
          }
        }}
      />
    </aside>
  );
}
