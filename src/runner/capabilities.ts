import type { Program } from '../language/analysis';
import { HOST_EVENTS } from '../language/builtins';
/** Inspect validated reachable modules, without evaluating declarations or handlers. */
export function programCapabilities(program: Program) {
  const roots = program.modules.flatMap((module) => module.statements);
  const scenes = roots.filter((s) => s.kind === 'scene');
  const statements = roots.flatMap((s) => (s.kind === 'scene' ? s.body : [s]));
  const inputs = statements.some(
    (s) => s.kind === 'declare' && s.exposure === 'input',
  );
  const buttons = statements.some((s) => s.kind === 'button');
  const lifecycle = statements.some(
    (s) =>
      s.kind === 'handler' &&
      (Object.hasOwn(HOST_EVENTS, s.event) ||
        s.event === 'enter' ||
        s.event === 'leave'),
  );
  return {
    inputs,
    buttons,
    lifecycle,
    interactive: scenes.length > 0 || inputs || buttons || lifecycle,
  };
}
