import { programCapabilities } from '../runner/capabilities';
import { analyzeProject, compileProject } from '../language/analysis';
import { diagnostic, DiagnosticError } from '../language/diagnostics';
import { RuntimeSession } from '../language/runtime';
import type { WorkerRequest, WorkerResponse } from './protocol';
export class RuntimeHost {
  private session: RuntimeSession | null = null;
  private epoch = -1;
  handle(request: WorkerRequest): WorkerResponse {
    let { session, epoch } = this;
    const response: WorkerResponse = {
      epoch: request.epoch,
      requestId: request.requestId,
      diagnostics: [],
    };
    try {
      if (request.type === 'analyze') {
        const analysis = analyzeProject(request.project);
        response.fields = analysis.fields;
        if (analysis.program)
          response.capabilities = programCapabilities(analysis.program);
        response.diagnostics = analysis.diagnostics;
      } else {
        if (request.type === 'run') {
          session = null;
          epoch = request.epoch;
          const program = compileProject(request.project);
          session = new RuntimeSession(program, {
            modules: Object.fromEntries(
              request.project.files.map((f) => [
                f.id,
                {
                  exportOverrides: f.exportOverrides,
                  inputOverrides: f.inputOverrides,
                },
              ]),
            ),
          });
        } else {
          if (!session || epoch !== request.epoch)
            throw new Error('Session is no longer active. Press Run.');
          if (request.type === 'button') session.pressButton(request.id);
          if (request.type === 'input')
            session.setInput(request.name, request.value);
          if (request.type === 'event')
            session.dispatchEvent(request.name, request.args);
          if (request.type === 'clear') session.clearOutput();
        }
        response.snapshot = session.snapshot();
      }
    } catch (error) {
      response.diagnostics =
        error instanceof DiagnosticError
          ? error.diagnostics
          : [diagnostic(error)];
      if (session && epoch === request.epoch)
        response.snapshot = session.snapshot();
    }
    this.session = session;
    this.epoch = epoch;
    return response;
  }
}
