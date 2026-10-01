import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  db,
  ensureStarterFile,
  saveOverride,
  withOverride,
  type OverrideKind,
} from '../db';
import { workspace } from '../workspace/store';
import type { Project, ProjectFile } from '../workspace/model';
import type { ExportValue } from '../language/ast';
import { errorMessage } from './useProgramSession';

/** Document persistence and selection are independent of runtime sessions. */
export function useWorkspace() {
  const [initialized, setInitialized] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [operations, setOperations] = useState(0);
  const [pending, setPending] = useState(0);
  const drafts = useRef(new Map<string, string>());
  const saves = useRef(new Map<string, Promise<void>>());
  const refresh = useCallback(async () => {
    const [ps, fs] = await Promise.all([
      db.projects.orderBy('createdAt').toArray(),
      db.files.orderBy('createdAt').toArray(),
    ]);
    setProjects(ps);
    setFiles(
      fs.map((f) => ({ ...f, content: drafts.current.get(f.id) ?? f.content })),
    );
  }, []);
  useEffect(() => {
    let cancelled = false;
    void ensureStarterFile()
      .then(async (first) => {
        if (cancelled) return;
        await refresh();
        if (cancelled) return;
        const requested = new URLSearchParams(location.search).get('project');
        let previous: { project?: string; file?: string } = {};
        try {
          previous =
            JSON.parse(localStorage.getItem('langlab.selection.v1') ?? '{}') ??
            {};
        } catch {
          /* Selection is optional. */
        }
        setProjectId(requested ?? previous.project ?? first?.projectId ?? null);
        setActiveId(requested ? null : (previous.file ?? first?.id ?? null));
        setInitialized(true);
      })
      .catch((e) => setStorageError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saves.current.size || drafts.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const project =
    projects.find((p) => p.id === projectId) ?? projects[0] ?? null;
  const projectFiles = useMemo(
    () => files.filter((f) => f.projectId === project?.id),
    [files, project?.id],
  );
  const activeFile =
    projectFiles.find((f) => f.id === activeId) ??
    projectFiles.find((f) => f.path === project?.entry) ??
    null;
  useEffect(() => {
    if (!initialized || !project) return;
    try {
      localStorage.setItem(
        'langlab.selection.v1',
        JSON.stringify({ project: project.id, file: activeFile?.id }),
      );
    } catch {
      /* Storage failures must not block editing. */
    }
  }, [initialized, project?.id, activeFile?.id]);
  const snapshot = useMemo(
    () => (project ? { project, files: projectFiles } : null),
    [project, projectFiles],
  );
  const updateCode = useCallback(
    (content: string) => {
      if (!activeFile || activeFile.kind !== 'file' || activeFile.bytes) return;
      const id = activeFile.id;
      drafts.current.set(id, content);
      setFiles((fs) =>
        fs.map((f) =>
          f.id === id
            ? { ...f, content, revision: f.revision + 1, updatedAt: Date.now() }
            : f,
        ),
      );
      setPending((n) => n + 1);
      const save = (saves.current.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then(() => workspace.saveSource(id, content));
      saves.current.set(id, save);
      void save
        .then(() => {
          if (drafts.current.get(id) === content) drafts.current.delete(id);
        })
        .catch((e) =>
          setStorageError(
            'Unable to save source. Keep this page open and retry. ' +
              errorMessage(e),
          ),
        )
        .finally(() => {
          if (saves.current.get(id) === save) saves.current.delete(id);
          setPending((n) => n - 1);
        });
    },
    [activeFile],
  );
  async function updateOverride(
    id: string,
    kind: OverrideKind,
    name: string,
    value: ExportValue | undefined,
  ) {
    setFiles((fs) =>
      fs.map((f) =>
        f.id === id ? { ...f, [kind]: withOverride(f[kind], name, value) } : f,
      ),
    );
    try {
      await saveOverride(id, kind, name, value);
    } catch (e) {
      setStorageError('Unable to save control values: ' + errorMessage(e));
    }
  }
  async function resetInputs() {
    if (!snapshot) return null;
    const reset = {
      project: snapshot.project,
      files: snapshot.files.map((f) => ({ ...f, inputOverrides: {} })),
    };
    setFiles((fs) =>
      fs.map((f) =>
        f.projectId === snapshot.project.id ? { ...f, inputOverrides: {} } : f,
      ),
    );
    try {
      await db.files
        .where('projectId')
        .equals(snapshot.project.id)
        .modify({ inputOverrides: {} });
    } catch (e) {
      setStorageError(errorMessage(e));
    }
    return reset;
  }
  async function perform(action: () => Promise<void>) {
    setOperations((n) => n + 1);
    try {
      await Promise.all(saves.current.values());
      await action();
      await refresh();
    } catch (e) {
      setStorageError(errorMessage(e));
    } finally {
      setOperations((n) => n - 1);
    }
  }
  function selectProject(id: string) {
    setProjectId(id);
    setActiveId(null);
  }
  return {
    projects,
    files,
    projectFiles,
    project,
    activeFile,
    snapshot,
    busy: operations > 0,
    saved: operations === 0 && pending === 0 && drafts.current.size === 0,
    storageError,
    setStorageError,
    setActiveId,
    selectProject,
    updateCode,
    updateOverride,
    resetInputs,
    perform,
    refresh,
  };
}
export type WorkspaceView = ReturnType<typeof useWorkspace>;
