import type { ProjectSnapshot } from '../workspace/model';
import type { ExportValue, Value } from '../language/ast';
import type { ProgramField, ProgramSnapshot } from '../language/program';
import type { Diagnostic } from '../language/diagnostics';
export type RuntimeCommand =
  | { type: 'analyze'; project: ProjectSnapshot }
  | { type: 'run'; project: ProjectSnapshot }
  | { type: 'input'; name: string; value: ExportValue }
  | { type: 'button'; id: string }
  | { type: 'event'; name: string; args: Value[] }
  | { type: 'clear' };
export type WorkerRequest = RuntimeCommand & {
  epoch: number;
  requestId: number;
};
export interface WorkerResponse {
  epoch: number;
  requestId: number;
  snapshot?: ProgramSnapshot;
  fields?: ProgramField[];
  diagnostics: Diagnostic[];
}
