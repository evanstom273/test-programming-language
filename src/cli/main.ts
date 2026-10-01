import { open, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  decodeSourceFile,
  sourceFileName,
  temporarySourceProject,
} from '../runner/sourceFile';
import { LIMITS } from '../workspace/vfs';
import type { ProjectSnapshot } from '../workspace/model';
import type { WorkerResponse } from '../runtime/protocol';
import { launchBrowserRunner } from './serve';

async function load(path: string): Promise<ProjectSnapshot> {
  const name = sourceFileName(basename(path));
  const info = await stat(path);
  if (!info.isFile()) throw new Error('Expected a regular .lang source file.');
  if (info.size > LIMITS.fileBytes)
    throw new Error('Source exceeds the 1 MB file limit.');
  const file = await open(path, 'r');
  try {
    const bytes = new Uint8Array(LIMITS.fileBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const chunk = await file.read(bytes, length, bytes.length - length, null);
      if (!chunk.bytesRead) break;
      length += chunk.bytesRead;
    }
    return temporarySourceProject(
      name,
      decodeSourceFile(bytes.subarray(0, length)),
    );
  } finally {
    await file.close();
  }
}
function execute(
  command: 'check' | 'run',
  project: ProjectSnapshot,
): Promise<WorkerResponse> {
  return new Promise((accept, reject) => {
    const worker = new Worker(resolve(__dirname, 'worker.js'), {
      workerData: { command, project },
      resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    });
    let finished = false;
    const finish = (result?: WorkerResponse, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
      void worker.terminate();
      if (error) reject(error);
      else accept(result!);
    };
    const interrupt = () => {
      process.exitCode = 130;
      finish(undefined, new Error('Program stopped.'));
    };
    const timer = setTimeout(
      () =>
        finish(undefined, new Error('Execution timed out; worker terminated.')),
      5000,
    );
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    worker.once('message', (response) => finish(response));
    worker.once('error', (error) => finish(undefined, error));
    worker.once('exit', (code) => {
      if (!finished)
        finish(
          undefined,
          new Error('Runtime worker exited without a result (' + code + ').'),
        );
    });
  });
}
async function main() {
  const [command, file, ...extra] = process.argv.slice(2);
  if (command === '--help' || command === 'help') {
    console.log(
      'Usage: npm run lang:check|lang:run|lang:open -- path/to/file.lang',
    );
    return;
  }
  if (!['check', 'run', 'open'].includes(command) || !file || extra.length)
    throw new Error(
      'Usage: npm run lang:check|lang:run|lang:open -- path/to/file.lang',
    );
  const project = await load(file);
  if (command === 'open') {
    await launchBrowserRunner(project);
    return;
  }
  const response = await execute(command as 'check' | 'run', project);
  for (const d of response.diagnostics)
    console.error(
      `${file}:${d.span.start.line}:${d.span.start.column} ${d.code}: ${d.message}`,
    );
  if (response.diagnostics.length) {
    process.exitCode = 1;
    return;
  }
  if (command === 'check') {
    console.log(
      `${file}: OK${response.capabilities?.interactive ? ' (interactive; use the browser runner)' : ''}`,
    );
    return;
  }
  if (response.capabilities?.interactive) {
    console.error(
      'This program uses scenes, inputs, buttons or lifecycle events. It was not executed in the terminal.\nUse npm run lang:open -- "' +
        file.replaceAll('"', '\\"') +
        '" or choose Open / Run .lang File in Language Lab.',
    );
    process.exitCode = 2;
    return;
  }
  for (const line of response.snapshot?.output ?? []) console.log(line);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode ||= 1;
});
