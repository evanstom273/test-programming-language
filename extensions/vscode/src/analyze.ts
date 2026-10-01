import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type { Analysis } from '../../../src/language/analysis';
import type { ProjectSnapshot } from '../../../src/workspace/model';
let active = 0;
const waiting: (() => void)[] = [];
export async function analyze(
  project: ProjectSnapshot,
  signal?: AbortSignal,
): Promise<Analysis> {
  if (active >= 2) {
    if (waiting.length >= 8) throw new Error('Too many pending analyses.');
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active++;
  try {
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    return await runAnalysis(project, signal);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
function runAnalysis(
  project: ProjectSnapshot,
  signal?: AbortSignal,
): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'analysis-worker.cjs'), {
      workerData: project,
      resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    });
    let done = false;
    const finish = (value?: Analysis, error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancelled);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const cancelled = () => finish(undefined, new Error('Analysis cancelled.'));
    signal?.addEventListener('abort', cancelled, { once: true });
    const timer = setTimeout(
      () => finish(undefined, new Error('Analysis timed out.')),
      5000,
    );
    worker.once('message', (value) => finish(value));
    worker.once('error', (error) => finish(undefined, error));
    worker.once('exit', () => {
      if (!done) finish(undefined, new Error('Analysis worker stopped.'));
    });
  });
}
