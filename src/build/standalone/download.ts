import host from 'virtual:standalone-host';
import type { ProjectSnapshot } from '../../workspace/model';
import { RuntimeClient } from '../../runtime/client';
import { formatDiagnostics } from '../../hooks/useProgramSession';
import { standaloneDocument, standaloneFilename } from './document';

/** Analyze in a worker, never run the program merely to export it. */
export async function downloadStandalone(
  snapshot: ProjectSnapshot,
): Promise<void> {
  const project = structuredClone(snapshot);
  const client = new RuntimeClient();
  try {
    const result = await client.request({ type: 'analyze', project });
    if (result.diagnostics.length)
      throw new Error(formatDiagnostics(result.diagnostics, project)!);
    const html = standaloneDocument(project, host);
    const url = URL.createObjectURL(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = standaloneFilename(project.project.name);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    client.stop();
  }
}
