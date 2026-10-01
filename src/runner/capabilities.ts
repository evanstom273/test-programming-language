import type { Program } from '../language/analysis';
import { HOST_EVENTS } from '../language/builtins';
/** Inspect validated reachable modules, without evaluating declarations or handlers. */
export function programCapabilities(program: Program) {
  const statements = program.modules.flatMap((module) => module.statements);
  const inputs = statements.some(
    (s) => s.kind === 'declare' && s.exposure === 'input',
  );
  const buttons = statements.some((s) => s.kind === 'button');
  const lifecycle = statements.some(
    (s) => s.kind === 'handler' && Object.hasOwn(HOST_EVENTS, s.event),
  );
  return {
    inputs,
    buttons,
    lifecycle,
    interactive: inputs || buttons || lifecycle,
  };
}
