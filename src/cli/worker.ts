import { parentPort, workerData } from 'node:worker_threads';
import { RuntimeHost } from '../runtime/host';
import type { ProjectSnapshot } from '../workspace/model';
import { diagnostic } from '../language/diagnostics';
const request = workerData as {
  command: 'check' | 'run';
  project: ProjectSnapshot;
};
try {
  const host = new RuntimeHost();
  const analysis = host.handle({
    type: 'analyze',
    project: request.project,
    epoch: 1,
    requestId: 1,
  });
  if (
    request.command === 'check' ||
    analysis.diagnostics.length ||
    analysis.capabilities?.interactive
  )
    parentPort!.postMessage(analysis);
  else
    parentPort!.postMessage(
      host.handle({
        type: 'run',
        project: request.project,
        epoch: 1,
        requestId: 2,
      }),
    );
} catch (error) {
  parentPort!.postMessage({ diagnostics: [diagnostic(error)] });
}
