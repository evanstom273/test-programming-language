import { useEffect, useRef, useState } from 'react';
import { LanguageError } from '../language/lexer';
import type { ProgramSnapshot } from '../language/program';
import type { ExportValue } from '../language/ast';
import type { ProjectSnapshot } from '../workspace/model';
import type { RuntimeCommand } from '../runtime/protocol';
import { RuntimeClient } from '../runtime/client';
import type { Diagnostic } from '../language/diagnostics';
export function errorMessage(caught: unknown): string {
  if (caught instanceof LanguageError)
    return `Line ${caught.line}, column ${caught.column}\n${caught.message}`;
  return caught instanceof Error ? caught.message : 'Unknown runtime error.';
}
export function formatDiagnostics(
  ds: Diagnostic[],
  project?: ProjectSnapshot | null,
): string | null {
  return ds.length
    ? ds
        .map(
          (d) =>
            `${project?.files.find((f) => f.id === d.span.fileId)?.path ?? d.span.fileId}:${d.span.start.line}:${d.span.start.column} ${d.message}`,
        )
        .join('\n')
    : null;
}
export function projectRevision(project: ProjectSnapshot | null) {
  return project
    ? JSON.stringify([
        project.project.id,
        project.project.entry,
        project.files.map((f) => [
          f.id,
          f.path,
          f.content,
          f.kind,
          f.exportOverrides,
        ]),
      ])
    : '';
}
export function useProgramSession(project: ProjectSnapshot | null) {
  const client = useRef<RuntimeClient | null>(null);
  const current = useRef(project);
  current.current = project;
  const revision = projectRevision(project);
  const [runRevision, setRunRevision] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ProgramSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingInputs, setPendingInputs] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<
    'idle' | 'running' | 'ready' | 'stopped'
  >('idle');
  const epoch = useRef(0);
  const sequence = useRef(0);
  const activeProject = useRef<string>();
  const stale = runRevision !== null && revision !== runRevision;
  useEffect(
    () => () => {
      epoch.current++;
      client.current?.stop();
    },
    [],
  );
  useEffect(() => {
    if (stale) {
      epoch.current++;
      client.current?.stop();
      setStatus('stopped');
    }
  }, [stale, revision]);
  async function dispatch(command: RuntimeCommand, token = epoch.current) {
    const requestSequence = ++sequence.current;
    try {
      const response = await client.current!.request(command);
      if (token !== epoch.current) return false;
      if (requestSequence !== sequence.current)
        return response.diagnostics.length === 0;
      setSnapshot(response.snapshot ?? null);
      setError(formatDiagnostics(response.diagnostics, current.current));
      setStatus(response.snapshot ? 'ready' : 'stopped');
      return response.diagnostics.length === 0;
    } catch (caught) {
      if (token === epoch.current) {
        setError(errorMessage(caught));
        setStatus('stopped');
      }
      return false;
    }
  }
  function run(replacement?: ProjectSnapshot) {
    const source = replacement ?? current.current;
    if (!source) return;
    const token = ++epoch.current;
    client.current?.stop();
    client.current = new RuntimeClient();
    activeProject.current = source.project.id;
    setRunRevision(projectRevision(source));
    setSnapshot(null);
    setError(null);
    setGeneration((g) => g + 1);
    setStatus('running');
    void dispatch({ type: 'run', project: structuredClone(source) }, token);
  }
  function stop() {
    epoch.current++;
    client.current?.stop();
    setStatus('stopped');
    setError('Program stopped. Press Run to restart.');
  }
  const usable = !stale && status === 'ready';
  function pressButton(id: string) {
    if (!usable) return;
    setStatus('running');
    void dispatch({ type: 'button', id });
  }
  async function setInput(name: string, value: ExportValue) {
    if (!usable) return false;
    setSnapshot((s) =>
      s ? { ...s, inputValues: { ...s.inputValues, [name]: value } } : null,
    );
    setPendingInputs((n) => n + 1);
    try {
      return await dispatch({ type: 'input', name, value });
    } finally {
      setPendingInputs((n) => n - 1);
    }
  }
  function clearOutput() {
    if (usable) void dispatch({ type: 'clear' });
  }
  return {
    snapshot: activeProject.current === project?.project.id ? snapshot : null,
    error,
    stale,
    generation,
    pendingInputs,
    status,
    usable,
    run,
    stop,
    setInput,
    pressButton,
    clearOutput,
  };
}
