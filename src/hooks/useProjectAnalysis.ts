import { useEffect, useState } from 'react';
import { RuntimeClient } from '../runtime/client';
import type { ProjectSnapshot } from '../workspace/model';
import type { Diagnostic } from '../language/diagnostics';
import type { ProgramField } from '../language/program';
import { formatDiagnostics } from './useProgramSession';
export function useProjectAnalysis(project: ProjectSnapshot | null) {
  const [state, setState] = useState<{
    revision: string;
    fields: ProgramField[];
    diagnostics: Diagnostic[];
    error: string | null;
  }>({ revision: '', fields: [], diagnostics: [], error: null });
  const revision = JSON.stringify(
    project
      ? [
          project.project.id,
          project.project.entry,
          project.files.map((f) => [f.id, f.path, f.kind, f.content]),
        ]
      : null,
  );
  useEffect(() => {
    if (!project) return;
    const client = new RuntimeClient();
    let cancelled = false;
    const timer = setTimeout(() => {
      void client
        .request({ type: 'analyze', project })
        .then((r) => {
          if (!cancelled)
            setState({
              revision,
              fields: r.fields ?? [],
              diagnostics: r.diagnostics,
              error: formatDiagnostics(r.diagnostics, project),
            });
        })
        .catch((e) => {
          if (!cancelled)
            setState({
              revision,
              fields: [],
              diagnostics: [],
              error: String(e),
            });
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      client.stop();
    };
  }, [revision]);
  return state.revision === revision
    ? state
    : { fields: [], diagnostics: [], error: null };
}
