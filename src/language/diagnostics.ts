export interface SourcePosition { offset: number; line: number; column: number }
export interface SourceSpan { fileId: string; start: SourcePosition; end: SourcePosition }
export interface Diagnostic {
  category: 'syntax' | 'type' | 'binding' | 'module' | 'runtime' | 'resource';
  code: string;
  severity: 'error' | 'warning';
  message: string;
  span: SourceSpan;
}
export function pointSpan(fileId = 'main.lang', line = 1, column = 1, offset = 0): SourceSpan {
  return { fileId, start: { offset, line, column }, end: { offset, line, column } };
}
export class DiagnosticError extends Error {
  constructor(public diagnostics: Diagnostic[]) { super(diagnostics.map(d => d.message).join('\n')); }
}
export function diagnostic(error: unknown, fallback = pointSpan()): Diagnostic {
  if (error instanceof DiagnosticError) return error.diagnostics[0];
  const located = error as { span?: SourceSpan; line?: number; column?: number };
  const message = error instanceof Error ? error.message : String(error);
  const resource = /limit|too many operations|timed out/i.test(message);
  return { category: resource ? 'resource' : 'runtime', code: resource ? 'RESOURCE_LIMIT' : 'RUNTIME_ERROR', severity: 'error',
    message, span: located?.span ?? fallback };
}
